# =============================================================================
# insight_service.py
# -----------------------------------------------------------------------------
# Pedagogical Insight Generation Service
#
# Provides a streaming, beginner-oriented conceptual explanation for a given
# animation prompt.  This service is designed to operate concurrently with the
# primary RAG code-generation pipeline, populating the client loading screen
# with meaningful educational content while the animation renders.
#
# Design Principles
# -----------------
# - Non-blocking  : Intended to be invoked in parallel with rag.generate().
#                   It must never delay or depend on the generation pipeline.
# - Non-critical  : Failure is handled gracefully; a degraded response is
#                   returned rather than propagating an exception to the caller.
# - Stateless     : No database interaction.  Insights are ephemeral by design
#                   and are not persisted between sessions.
# - Consistent    : Reuses the same LLM model as the generation pipeline
#                   (qwen2.5-coder) to avoid loading a second model into memory.
#
# Integration
# -----------
# Called from backend/api/ as a Server-Sent Events (SSE) streaming endpoint:
#
#     from fastapi.responses import StreamingResponse
#     from services.insight_service import stream_insight
#
#     @router.get("/api/insight")
#     async def insight_endpoint(prompt: str):
#         return StreamingResponse(
#             stream_insight(prompt),
#             media_type="text/plain"
#         )
# =============================================================================

from typing import Iterator
from langchain_ollama import OllamaLLM


# -----------------------------------------------------------------------------
# Constants
# -----------------------------------------------------------------------------

# Reuses the model already loaded by the RAG pipeline to avoid additional
# memory overhead from initialising a second model instance.
_LLM_MODEL: str = "qwen2.5-coder:latest"

# Higher temperature than code generation (0.2) to produce a warmer,
# more conversational explanatory tone appropriate for a beginner audience.
_TEMPERATURE: float = 0.7

# Hard token ceiling.  Keeps the insight concise and ensures it finishes
# streaming well before the animation is ready, avoiding a situation where
# the explanation is still loading when the video completes.
_MAX_TOKENS: int = 200


# -----------------------------------------------------------------------------
# Prompt Template
# -----------------------------------------------------------------------------

_INSIGHT_PROMPT_TEMPLATE: str = (
    "You are a knowledgeable but approachable teacher explaining a computer science "
    "or mathematics concept to a first-year undergraduate student with no prior "
    "background in the topic.\n\n"
    "The student has requested an animated visualisation of the following concept:\n"
    '"{topic}"\n\n'
    "Structure your response using exactly the three sections below. "
    "Do not add additional sections or deviate from this format.\n\n"
    "What is this?\n"
    "Provide one to two sentences defining the concept in plain English. "
    "Avoid technical jargon. If a technical term is unavoidable, define it "
    "immediately in the same sentence.\n\n"
    "Think of it like...\n"
    "Provide a single, concrete real-world analogy that maps directly onto the "
    "concept. The analogy should be immediately relatable and require no specialist "
    "knowledge.\n\n"
    "What you will see\n"
    "Provide two to three short bullet points describing the specific visual elements "
    "and animations the student is about to observe. Use present tense.\n\n"
    "Constraints:\n"
    "- Total response must not exceed 120 words.\n"
    "- Do not use markdown bold or header formatting.\n"
    "- Do not begin your response with phrases such as 'Sure', 'Of course', "
    "or 'Certainly'.\n"
)


# -----------------------------------------------------------------------------
# Public Interface
# -----------------------------------------------------------------------------

def stream_insight(prompt: str) -> Iterator[str]:
    """
    Stream a pedagogical explanation for the given animation prompt.

    Yields incremental text chunks suitable for server-sent events (SSE).
    The full response follows the three-section structure defined in the
    prompt template: a plain-English definition, a real-world analogy, and
    a visual preview of the forthcoming animation.

    Parameters
    ----------
    prompt : str
        The raw user prompt describing the requested Manim animation.
        This is passed directly to the LLM without RAG retrieval, as the
        explanation is grounded in general world knowledge rather than the
        Manim code dataset.

    Yields
    ------
    str
        Incremental text chunks from the LLM stream.  In the event of an
        exception, a single degraded-mode message is yielded and the
        generator terminates cleanly without raising to the caller.

    Notes
    -----
    A new ``OllamaLLM`` instance is created per call.  Ollama itself manages
    model caching at the process level, so this does not incur a model-reload
    penalty on repeated invocations.

    The ``temperature`` is intentionally set higher than the code-generation
    pipeline (0.7 vs 0.2) to produce a warmer, more conversational tone
    suited to a pedagogical context.  This has no effect on code correctness
    as this service never generates executable output.
    """
    llm = OllamaLLM(
        model=_LLM_MODEL,
        temperature=_TEMPERATURE,
        num_predict=_MAX_TOKENS,
    )

    filled_prompt = _INSIGHT_PROMPT_TEMPLATE.format(topic=prompt.strip())

    try:
        for chunk in llm.stream(filled_prompt):
            yield chunk
    except Exception as exc:  # pylint: disable=broad-except
        # Insight generation is non-critical.  A failure here must not
        # surface as an unhandled exception in the API layer or interfere
        # with the parallel animation generation pipeline in any way.
        yield (
            "\n\n[Insight generation encountered an error and is currently "
            f"unavailable. The animation will continue to load normally. ({exc})]"
        )