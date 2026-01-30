# =========================
# Manim RAG (LangChain >=0.2, FAISS, Ollama)
# =========================

import json
from pathlib import Path
from typing import List

from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate

from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import OllamaLLM


# =========================
# CONFIG
# =========================

DATASET_PATH = "manim-dataset.jsonl"
FAISS_DIR = "manim_faiss_store"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "qwen2.5-coder:latest"  # must exist in Ollama
TOP_K = 5


# =========================
# DATA LOADING
# =========================

def load_jsonl(path: str) -> List[dict]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def build_documents(dataset: List[dict]) -> List[Document]:
    docs = []
    for item in dataset:
        content = f"""
USER_INTENT:
{item.get('prompt', '').strip()}

MANIM_CODE:
{item.get('code', '').strip()}

EXPLANATION:
{item.get('explanation', '').strip()}

TOPIC:
{item.get('topic', '').strip()}

DIFFICULTY:
{item.get('difficulty', '')}
"""
        docs.append(Document(page_content=content))
    return docs


# =========================
# VECTOR STORE
# =========================

def create_or_load_faiss(docs: List[Document]) -> FAISS:
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    if Path(FAISS_DIR).exists():
        return FAISS.load_local(
            FAISS_DIR,
            embeddings,
            allow_dangerous_deserialization=True
        )

    vectorstore = FAISS.from_documents(docs, embeddings)
    vectorstore.save_local(FAISS_DIR)
    return vectorstore


# =========================
# PROMPT
# =========================

SYSTEM_RULES = """
You are an expert Manim Community Edition developer.

STRICT RULES (NON-NEGOTIABLE):
- Output ONLY valid Python code.
- Do NOT include explanations, markdown, or prose.
- Always start with: from manim import *
- Define EXACTLY ONE Scene class.
- The code must run without modification in Manim CE v0.18+.
- Do NOT invent APIs, classes, or functions.
- Use ONLY Manim constructs observed in the reference examples.
- Prefer simpler, explicit animations over complex abstractions.
- If unsure, copy the closest reference structure and modify minimally.

LAYOUT & LABELING RULES:
- All visual elements must be clearly visible and non-overlapping.
- Place text labels using relative positioning (UP, DOWN, LEFT, RIGHT).
- Ensure labels remain readable throughout the animation.
- Avoid placing text directly on top of graphs or objects.
- Use consistent font sizes and spacing.

ANIMATION FLOW RULES (CRITICAL):
- Introduce elements step-by-step (no sudden clutter).
- NEVER allow text or formulas to accumulate on screen.
- Any explanatory Text or MathTex MUST fade out after it has been shown.
- Only persistent elements (titles, axes, graphs, core shapes) may remain.
- All temporary explanatory content must be removed before introducing new content.

TEXT MANAGEMENT RULES (VERY IMPORTANT):
- Define a helper function inside the Scene:

    def show_and_fade(self, obj, wait=0.6):
        self.play(Write(obj))
        self.wait(wait)
        self.play(FadeOut(obj))

- Use this function for:
    - All explanatory Text
    - All MathTex formulas
    - All labels that are not structural

- DO NOT fade:
    - Scene titles
    - Final summary text
    - Coordinate axes
    - Graphs and plots
    - Core geometric objects

ANIMATION RULES:
- Use Create, Write, Transform, FadeIn, FadeOut explicitly.
- Avoid unnecessary animation effects.
- Maintain focus on concept clarity rather than visual flair.

FAIL-SAFE RULE:
- If the requested animation is complex, produce a correct and simpler conceptual visualization instead of attempting a complex one.
"""


PROMPT = PromptTemplate(
    input_variables=["context", "question"],
    template=f"""
{SYSTEM_RULES}

REFERENCE EXAMPLES:
{{context}}

TASK:
Generate Manim code for the following user request:

"{{question}}"

OUTPUT:
"""
)


# =========================
# RAG ENGINE
# =========================

class ManimRAG:
    def __init__(self):
        dataset = load_jsonl(DATASET_PATH)
        documents = build_documents(dataset)

        self.vectorstore = create_or_load_faiss(documents)

        self.retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": TOP_K}
        )

        self.llm = OllamaLLM(
            model=LLM_MODEL,
            temperature=0.1
        )

        self.chain = PROMPT | self.llm

    def generate(self, query: str) -> str:
        docs = self.retriever.invoke(query)
        context = "\n\n".join(d.page_content for d in docs)

        return self.chain.invoke({
            "context": context,
            "question": query
        })


# =========================
# CLI
# =========================

if __name__ == "__main__":
    print("Initializing Manim RAG...")
    rag = ManimRAG()

    print("\nReady. Type a Manim animation request (type 'exit' to quit)")
    while True:
        query = input("\n> ").strip()
        if query.lower() in {"exit", "quit"}:
            break

        code = rag.generate(query)
        print("\nGenerated Manim Code:\n")
        print(code)

