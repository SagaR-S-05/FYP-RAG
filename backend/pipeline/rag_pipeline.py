# =========================
# Manim RAG (LangChain >=0.2, FAISS, Ollama)
# Dataset-grounded generation + Validators + Intent Verification
# With Embedding Model Tracking & Auto-Rebuild
# =========================

import json
import re
import ast
import hashlib
import shutil
import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import OllamaLLM
from dotenv import load_dotenv


# =========================
# PATH RESOLUTION
# =========================

# main.py is at: backend/main.py
# Get the absolute path to this file's directory
PIPELINE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = PIPELINE_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Dataset is at: backend/dataset/manim-dataset.jsonl
DATASET_PATH = BACKEND_DIR / "dataset" / "manim-dataset.jsonl"

# FAISS store at project root: FYP-RAG/manim_faiss_store_v2
FAISS_DIR = PROJECT_ROOT / "manim_faiss_store_v2"

# Eval split file — stored alongside the FAISS index
EVAL_SPLIT_PATH = PROJECT_ROOT / "manim_faiss_store_v2" / "eval_split.json"

load_dotenv(PROJECT_ROOT / ".env")


# =========================
# CONFIG
# =========================

# Better embedding model for code semantics
EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
LLM_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:latest")

TOP_K = 3
MAX_REPAIR_ATTEMPTS = 3
FORCE_REBUILD_INDEX = False  # Set to True to force rebuild

# Intent verification settings
ENABLE_INTENT_VERIFICATION = True  # Set to False to disable
INTENT_VERIFICATION_THRESHOLD = 0.7  # Skip intent check if validation passes

# -----------------------------------------------------------
# Eval split config
# 0.15 = 15% of *unique* code examples held out for evaluation.
# These prompts are EXCLUDED from the FAISS index so retrieval
# cannot cheat by finding the exact matching example.
# -----------------------------------------------------------
EVAL_SPLIT_RATIO = 0.15
EVAL_SPLIT_SEED = 42


# =========================
# NORMALIZATION
# =========================

def normalize_prompt(text: str) -> str:
    """Normalize text for better semantic matching."""
    text = str(text).lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


# =========================
# MARKDOWN STRIPPER
# =========================

def extract_code(text: str) -> str:
    """Extract code from markdown code blocks."""
    if "```" in text:
        text = re.sub(r"```(?:python)?", "", text)
        text = text.replace("```", "")
    return text.strip()


# =========================
# DATA LOADING
# =========================

def load_jsonl(path: Path) -> List[dict]:
    """Load JSONL dataset."""
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


# =========================
# DEDUPLICATION & SPLIT
# =========================

def _code_hash(code: str) -> str:
    """Stable hash of code content for deduplication."""
    return hashlib.md5(code.strip().encode()).hexdigest()


def deduplicate_and_split(dataset: List[dict], eval_ratio: float = EVAL_SPLIT_RATIO, seed: int = EVAL_SPLIT_SEED):
    """
    1. Group all dataset rows by their code hash (same code, different prompts).
    2. Split unique code groups into train / eval using a deterministic seed.
    3. Return:
       - train_items  : list of dicts (used to build the FAISS index)
       - eval_items   : list of dicts (held-out; never indexed)
       - dedup_stats  : dict with counts for logging

    Why deduplicate before splitting?
    ----------------------------------
    The 872-row dataset contains multiple prompt variants per unique Manim
    snippet.  Without deduplication the retriever can trivially find an
    almost-identical prompt in the index for any eval query (data leakage),
    producing unrealistically perfect Recall/MRR scores.

    After deduplication:
    - The index holds *one representative document per unique code snippet*
      (the prompt that was seen first for that hash).
    - Eval items are drawn from *different code groups*, so the retriever
      must generalise rather than regurgitate a memorised example.
    """
    import random

    # Group rows by code hash
    groups: dict[str, list] = {}
    for item in dataset:
        h = _code_hash(item.get("code", ""))
        groups.setdefault(h, []).append(item)

    unique_hashes = sorted(groups.keys())  # sorted for reproducibility

    rng = random.Random(seed)
    rng.shuffle(unique_hashes)

    n_eval = max(1, int(len(unique_hashes) * eval_ratio))
    eval_hashes = set(unique_hashes[:n_eval])
    train_hashes = set(unique_hashes[n_eval:])

    # Build train set: one document per unique code (first prompt variant)
    train_items = [groups[h][0] for h in sorted(train_hashes)]

    # Build eval set: all prompt variants for the held-out code groups
    eval_items = [item for h in sorted(eval_hashes) for item in groups[h]]

    dedup_stats = {
        "total_rows": len(dataset),
        "unique_codes": len(unique_hashes),
        "train_unique": len(train_hashes),
        "eval_unique": len(eval_hashes),
        "eval_rows": len(eval_items),
    }

    return train_items, eval_items, dedup_stats


def save_eval_split(eval_items: List[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(eval_items, f, indent=2)


def load_eval_split(path: Path) -> List[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Eval split not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# =========================
# DOCUMENT BUILDING
# =========================

def build_documents(dataset: List[dict]) -> List[Document]:
    """
    Build LangChain documents from dataset.

    Each document represents ONE unique Manim code snippet.
    The page_content combines prompt + topic + difficulty + code so
    that semantic search on any of these dimensions works well.
    """
    docs = []

    for item in dataset:
        content = f"""PROMPT:
{item.get("prompt", "")}

TOPIC:
{item.get("topic", "")}

DIFFICULTY:
{item.get("difficulty", "")}

MANIM CODE EXAMPLE:
{item.get("code", "")}"""

        docs.append(
            Document(
                page_content=content.strip(),
                metadata={
                    "normalized_prompt": normalize_prompt(item.get("prompt", "")),
                    "topic": item.get("topic", ""),
                    "difficulty": item.get("difficulty", ""),
                    "code_hash": _code_hash(item.get("code", "")),
                }
            )
        )

    return docs


# =========================
# VECTOR STORE WITH MODEL TRACKING
# =========================

def load_or_create_faiss(docs: List[Document], eval_items: List[dict]) -> FAISS:
    """
    Load existing FAISS index or create a new one.
    Automatically rebuilds if the embedding model changes or the
    deduplicated document count changes.

    Speed improvements vs original:
    - Retrieval uses similarity search (not MMR) by default —
      MMR fetches fetch_k=20 docs and re-ranks them, which is ~7x
      slower than a single k-NN call.
    - FAISS nlist/nprobe can be tuned here for larger indexes.
    - The index is smaller because duplicates are removed first.
    """
    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        # Cache embeddings to disk — avoids re-encoding on repeated runs
        cache_folder=str(PROJECT_ROOT / ".embedding_cache"),
    )
    metadata_file = FAISS_DIR / "model_metadata.json"

    should_rebuild = FORCE_REBUILD_INDEX

    if FAISS_DIR.exists() and not FORCE_REBUILD_INDEX:
        if metadata_file.exists():
            try:
                with open(metadata_file, "r") as f:
                    metadata = json.load(f)

                stored_model = metadata.get("embedding_model")
                stored_docs = metadata.get("num_documents", -1)

                if stored_model != EMBEDDING_MODEL:
                    print(f"\n[WARNING] Embedding model mismatch detected")
                    print(f"          Stored model:  {stored_model}")
                    print(f"          Current model: {EMBEDDING_MODEL}")
                    should_rebuild = True
                elif stored_docs != len(docs):
                    print(f"\n[WARNING] Document count changed ({stored_docs} → {len(docs)}), rebuilding index")
                    should_rebuild = True
                else:
                    print(f"[INFO] Loading existing FAISS index")
                    print(f"       Model:     {EMBEDDING_MODEL}")
                    print(f"       Documents: {metadata.get('num_documents', 'unknown')}")
                    print(f"       Created:   {metadata.get('created_at', 'unknown')}")

                    return FAISS.load_local(
                        str(FAISS_DIR),
                        embeddings,
                        allow_dangerous_deserialization=True,
                    )
            except Exception as e:
                print(f"[WARNING] Error reading metadata: {e}")
                should_rebuild = True
        else:
            print(f"[WARNING] No metadata found for existing index")
            should_rebuild = True

    if should_rebuild and FAISS_DIR.exists():
        print(f"[INFO] Removing old FAISS index...")
        shutil.rmtree(FAISS_DIR)

    print(f"\n[INFO] Building new FAISS index...")
    print(f"       Embedding model: {EMBEDDING_MODEL}")
    print(f"       Documents:       {len(docs)} (deduplicated)")

    vectorstore = FAISS.from_documents(docs, embeddings)

    FAISS_DIR.mkdir(parents=True, exist_ok=True)
    vectorstore.save_local(str(FAISS_DIR))

    # Persist eval split alongside the index
    save_eval_split(eval_items, EVAL_SPLIT_PATH)
    print(f"[INFO] Eval split saved: {len(eval_items)} held-out examples → {EVAL_SPLIT_PATH}")

    metadata = {
        "embedding_model": EMBEDDING_MODEL,
        "created_at": datetime.now().isoformat(),
        "num_documents": len(docs),
        "top_k": TOP_K,
        "eval_split_ratio": EVAL_SPLIT_RATIO,
        "eval_split_seed": EVAL_SPLIT_SEED,
    }

    with open(metadata_file, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"[SUCCESS] FAISS index built and saved to {FAISS_DIR}\n")

    return vectorstore


# =========================
# PROMPTS
# =========================

# SYSTEM_RULES = """
# You are an expert Manim Community Edition developer.

# RULES:
# - Generate NEW Manim code based on the user request
# - Output ONLY valid Python code (no explanations, no markdown)
# - Always start with: from manim import *
# - Define EXACTLY ONE Scene class
# - Code must run in Manim CE v0.18+
# - Use proper Manim animation methods (play, wait, etc.)

# MANIM API SAFETY RULES:
# - Plot graphs first and reuse graph objects
# - Never pass lambda functions directly to shading or slope utilities
# - Use proper color constants (RED, BLUE, YELLOW, GREEN, etc.)
# - For darker colors, use color_utils like DARK_BLUE, or .set_opacity()
# - Ensure all objects are properly positioned
# - Include appropriate wait times between animations
# - Use Rotate() for rotation animations
# """

SYSTEM_RULES = """
You are an expert Manim Community Edition developer specializing ONLY in
mathematics, machine learning (ML), and deep learning (DL) visualizations.

STRICT DOMAIN CONSTRAINT:
- ONLY generate code for:
  • Mathematics concepts (algebra, calculus, linear algebra, geometry, probability, statistics)
  • Machine Learning concepts (regression, classification, gradient descent, loss functions, etc.)
  • Deep Learning concepts (neural networks, backpropagation, activations, etc.)

- DO NOT generate code for:
  • General programming problems (sorting, APIs, web dev, etc.)
  • System-level tasks (file handling, OS operations)
  • Non-educational animations (games, random visuals, UI mockups, etc.)

- If the user request is OUTSIDE the allowed domain:
  → Return ONLY:
    # ERROR: Request is outside the supported domain of Mathematics and AI/ML visualization.

GENERAL RULES:
- Generate NEW Manim code based on the user request
- Output ONLY valid Python code (no explanations, no markdown)
- Always start with: from manim import *
- Define EXACTLY ONE Scene class
- Code must run in Manim CE v0.18+
- Use proper Manim animation methods (play, wait, etc.)

MANIM API SAFETY RULES:
- Plot graphs first and reuse graph objects
- Never pass lambda functions directly to shading or slope utilities
- Use proper color constants (RED, BLUE, YELLOW, GREEN, etc.)
- Ensure all objects are properly positioned
- Include appropriate wait times between animations
- Use Rotate() for rotation animations
"""

GENERATION_PROMPT = PromptTemplate(
    input_variables=["question", "references", "error", "system_rules"],
    template="""
{system_rules}

USER REQUEST:
{question}

REFERENCE EXAMPLES FROM DATASET:
{references}

PREVIOUS ERROR (if any):
{error}

TASK:
Generate corrected Manim code that fulfills the user request.
Output ONLY the Python code, no explanations.
"""
)

INTENT_JUDGE_PROMPT = PromptTemplate(
    input_variables=["question", "code"],
    template="""
You are reviewing Manim code to verify it matches the user's request.

USER REQUEST:
{question}

GENERATED CODE:
{code}

Analyze the code carefully. Check if it:
1. Creates the visual elements mentioned in the request
2. Performs the requested animations or transformations
3. Uses appropriate colors, sizes, or properties mentioned
4. Generally matches the user's intent (exact implementation may vary)

Be LENIENT - if the code reasonably attempts to fulfill the request, answer YES.
Only answer NO if the code clearly does something completely different.

Answer ONLY with YES or NO.
"""
)

REFINEMENT_PROMPT = PromptTemplate(
    input_variables=["original_request", "refinement_request", "previous_code", "references", "system_rules"],
    template="""
{system_rules}

ORIGINAL REQUEST:
{original_request}

PREVIOUS CODE:
{previous_code}

USER REFINEMENT REQUEST (make these specific changes):
{refinement_request}

REFERENCE EXAMPLES:
{references}

TASK:
Modify the previous code to incorporate ONLY the user's refinement request.
Keep everything else the same unless it conflicts with the refinement.
For color changes: Use Manim color constants (RED, BLUE, YELLOW, etc.)
For darker colors: Use variations like DARK_BLUE, DARK_RED, or set_opacity()
For rotations: Use Rotate(object, angle) where angle is in radians (TAU = 360 degrees)

Output ONLY the modified Python code, no explanations.
"""
)

RUNTIME_REPAIR_PROMPT = PromptTemplate(
    input_variables=["original_request", "render_error", "generated_code"],
    template="""
You are repairing Python animation code generated by an automated RAG system.

The code generates Manim animations and is executed inside a sandboxed Docker environment.

Execution details:
- Python environment contains: manim, numpy, sympy, ffmpeg
- Rendering command: manim -ql scene.py <SceneName> --media_dir /output
- Final rendered output must be a valid scene video, not a partial clip.

Project constraints:
1. Code must start with: from manim import *
2. Exactly one Scene class must be defined
3. No unsafe imports are allowed (os, sys, subprocess, socket, requests, eval, exec)
4. The animation must render successfully in Manim without runtime errors.

Original user request:
{original_request}

Render failure details:
{render_error}

Generated code:
{generated_code}

Task:
Repair only what is needed to make the code render successfully while preserving the intended animation.
Return ONLY corrected Python code.
"""
)


# =========================
# VALIDATORS
# =========================

def validate_python(code: str) -> None:
    """Validate Python syntax."""
    try:
        ast.parse(code)
    except SyntaxError as e:
        raise ValueError(f"Python syntax error: {e}")


def validate_manim_structure(code: str) -> None:
    """Validate Manim-specific structure requirements."""
    tree = ast.parse(code)

    has_import = False
    scene_classes = []

    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "manim":
            has_import = True

        if isinstance(node, ast.ClassDef):
            for base in node.bases:
                if isinstance(base, ast.Name) and base.id == "Scene":
                    scene_classes.append(node.name)

    if not has_import:
        raise ValueError("Missing 'from manim import *'")

    if len(scene_classes) != 1:
        raise ValueError(f"Exactly ONE Scene class required, found {len(scene_classes)}")


def validate_manim_semantics(code: str) -> None:
    """Validate Manim API usage patterns."""
    if "get_area(lambda" in code:
        raise ValueError("axes.get_area() must receive a graph object, not lambda")

    if "get_area(" in code and ".plot(" not in code:
        raise ValueError("Plot graph before calling get_area()")

    if "def construct(self)" not in code:
        raise ValueError("Scene class must have construct(self) method")


def validate(code: str) -> None:
    """Run all validators."""
    validate_python(code)
    validate_manim_structure(code)
    validate_manim_semantics(code)


# =========================
# CODE QUALITY CHECKER
# =========================

def check_code_quality(code: str, query: str) -> dict:
    """
    Heuristic check for code quality and intent matching.
    Returns dict with 'score' (0-1) and 'issues' list.
    """
    issues = []
    score = 1.0

    query_lower = query.lower()

    colors = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'white', 'black']
    for color in colors:
        if color in query_lower and color.upper() not in code:
            issues.append(f"Missing color: {color}")
            score -= 0.2

    shapes = ['circle', 'square', 'triangle', 'rectangle', 'line', 'dot', 'arrow']
    for shape in shapes:
        if shape in query_lower and shape.capitalize() not in code:
            issues.append(f"Missing shape: {shape}")
            score -= 0.2

    animations = {
        'move': ['shift', 'move_to'],
        'rotate': ['Rotate', 'rotate'],
        'transform': ['Transform', 'ReplacementTransform'],
        'create': ['Create', 'DrawBorderThenFill'],
        'fade': ['FadeIn', 'FadeOut']
    }

    for keyword, manim_methods in animations.items():
        if keyword in query_lower:
            if not any(method in code for method in manim_methods):
                issues.append(f"Missing animation: {keyword}")
                score -= 0.15

    return {
        'score': max(0.0, score),
        'issues': issues
    }


# =========================
# RAG ENGINE
# =========================

class ManimRAG:
    """Manim RAG system with validation and intent verification."""

    def __init__(self):
        print("[INFO] Initializing Manim RAG system...")

        # Load dataset
        print(f"[INFO] Loading dataset from {DATASET_PATH}")
        raw_dataset = load_jsonl(DATASET_PATH)
        print(f"[INFO] Loaded {len(raw_dataset)} raw examples")

        # Deduplicate and split BEFORE indexing to prevent data leakage
        train_items, eval_items, dedup_stats = deduplicate_and_split(raw_dataset)

        print(f"[INFO] Deduplication summary:")
        print(f"       Total rows:     {dedup_stats['total_rows']}")
        print(f"       Unique codes:   {dedup_stats['unique_codes']}")
        print(f"       Train (index):  {dedup_stats['train_unique']} unique codes")
        print(f"       Eval (held-out):{dedup_stats['eval_unique']} unique codes "
              f"({dedup_stats['eval_rows']} prompt variants)")

        # Build documents from TRAIN split only
        documents = build_documents(train_items)

        # Load/create vector store (eval_items saved alongside index)
        self.vectorstore = load_or_create_faiss(documents, eval_items)

        # -------------------------------------------------------
        # Retriever: similarity search (faster than MMR)
        #
        # MMR fetches `fetch_k` candidates and re-ranks them —
        # useful for diversity but ~3–7x slower than a straight
        # k-NN call.  Since our index is deduplicated (no duplicate
        # codes), diversity is already guaranteed at index level.
        # Switch back to mmr only if you re-introduce duplicates.
        # -------------------------------------------------------
        self.retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": TOP_K},
        )

        # Initialize LLM
        print(f"[INFO] Initializing LLM: {LLM_MODEL}")
        self.llm = OllamaLLM(
            model=LLM_MODEL,
            temperature=0.2
        )

        # Create chains
        self.gen_chain = GENERATION_PROMPT | self.llm
        self.judge_chain = INTENT_JUDGE_PROMPT | self.llm
        self.refinement_chain = REFINEMENT_PROMPT | self.llm
        self.runtime_repair_chain = RUNTIME_REPAIR_PROMPT | self.llm

        # Conversation history for refinements
        self.conversation_history = []

        print("[SUCCESS] Manim RAG system ready\n")

    def generate(self, query: str, context: Optional[dict] = None) -> dict:
        """
        Generate Manim code for a query.

        Args:
            query: User request
            context: Optional context for refinements (original_request, previous_code)

        Returns:
            dict with 'code', 'success', 'error', 'attempts'
        """
        docs = self.retriever.invoke(normalize_prompt(query))

        if not docs:
            return {
                'code': "# ERROR: No relevant Manim examples found in dataset.",
                'success': False,
                'error': "No relevant examples found",
                'attempts': 0
            }

        references = "\n\n---\n\n".join(doc.page_content for doc in docs)

        last_error = "None"
        last_code = ""
        best_code = None
        best_score = 0.0

        for attempt in range(1, MAX_REPAIR_ATTEMPTS + 1):
            print(f"[INFO] Attempt {attempt}/{MAX_REPAIR_ATTEMPTS}")

            if context and context.get('previous_code'):
                raw_output = self.refinement_chain.invoke({
                    "original_request": context.get('original_request', query),
                    "refinement_request": query,
                    "previous_code": context['previous_code'],
                    "references": references,
                    "system_rules": SYSTEM_RULES
                })
            else:
                raw_output = self.gen_chain.invoke({
                    "question": query,
                    "references": references,
                    "error": last_error,
                    "system_rules": SYSTEM_RULES
                })

            last_code = extract_code(raw_output)

            try:
                validate(last_code)
                print("[SUCCESS] Code validation passed")
            except Exception as e:
                print(f"[ERROR] Validation failed: {e}")
                last_error = str(e)
                continue

            quality = check_code_quality(last_code, query)
            print(f"[INFO] Quality score: {quality['score']:.2f}")
            if quality['issues']:
                print(f"[WARNING] Potential issues: {', '.join(quality['issues'][:2])}")

            if quality['score'] > best_score:
                best_score = quality['score']
                best_code = last_code

            if quality['score'] >= INTENT_VERIFICATION_THRESHOLD:
                print("[INFO] Quality threshold met, skipping intent verification")
                return {
                    'code': last_code,
                    'success': True,
                    'error': None,
                    'attempts': attempt,
                    'quality_score': quality['score']
                }

            if ENABLE_INTENT_VERIFICATION:
                print("[INFO] Verifying intent...")
                try:
                    verdict = self.judge_chain.invoke({
                        "question": query,
                        "code": last_code
                    }).strip().upper()

                    if "YES" in verdict:
                        print("[SUCCESS] Intent verification passed")
                        return {
                            'code': last_code,
                            'success': True,
                            'error': None,
                            'attempts': attempt,
                            'quality_score': quality['score']
                        }
                    else:
                        print("[WARNING] Intent verification failed")
                except Exception as e:
                    print(f"[WARNING] Intent verification error: {e}")

            last_error = (
                "The generated code does not fully satisfy the user request. "
                f"Issues: {', '.join(quality['issues']) if quality['issues'] else 'General mismatch'}. "
                "Regenerate code that directly fulfills the request."
            )

        if best_code and best_score > 0.3:
            print(f"[WARNING] Max attempts reached, returning best code (score: {best_score:.2f})")
            return {
                'code': best_code,
                'success': True,
                'error': "Best attempt returned",
                'attempts': MAX_REPAIR_ATTEMPTS,
                'quality_score': best_score
            }

        print("[WARNING] Max attempts reached, returning closest dataset example")
        return {
            'code': f"""# WARNING: Auto-generation failed after {MAX_REPAIR_ATTEMPTS} attempts.
# Returning closest dataset example:

{docs[0].page_content}""",
            'success': False,
            'error': "Max attempts reached",
            'attempts': MAX_REPAIR_ATTEMPTS,
            'quality_score': 0.0
        }

    def refine(self, original_request: str, refinement: str, previous_code: str) -> dict:
        """
        Refine previously generated code based on user feedback.

        Args:
            original_request: Original user request
            refinement: Refinement/change request
            previous_code: Previously generated code

        Returns:
            dict with refined code
        """
        print(f"\n[INFO] Refining code based on: {refinement}")

        context = {
            'original_request': original_request,
            'previous_code': previous_code
        }

        return self.generate(refinement, context=context)

    def repair_runtime_error(self, original_request: str, generated_code: str, render_error: str) -> dict:
        """
        Repair Manim code using concrete runtime render errors.

        Args:
            original_request: Original user prompt
            generated_code: Code that failed at render time
            render_error: Render logs / traceback from sandbox

        Returns:
            dict with repaired code and metadata
        """
        last_error = render_error or "Unknown render error"
        best_code = None

        for attempt in range(1, MAX_REPAIR_ATTEMPTS + 1):
            raw_output = self.runtime_repair_chain.invoke({
                "original_request": original_request,
                "render_error": last_error,
                "generated_code": generated_code
            })

            repaired_code = extract_code(raw_output)

            try:
                validate(repaired_code)
                quality = check_code_quality(repaired_code, original_request)
                return {
                    'code': repaired_code,
                    'success': True,
                    'error': None,
                    'attempts': attempt,
                    'quality_score': quality['score']
                }
            except Exception as e:
                last_error = f"{render_error}\nValidation after repair failed: {e}"
                best_code = repaired_code

        return {
            'code': best_code or generated_code,
            'success': False,
            'error': f"Runtime repair failed: {last_error}",
            'attempts': MAX_REPAIR_ATTEMPTS,
            'quality_score': 0.0
        }


# =========================
# CLI
# =========================

def main():
    """Main CLI interface."""
    print("=" * 70)
    print("  Manim RAG - Code Generation System")
    print("=" * 70)

    rag = ManimRAG()

    current_code = None
    current_request = None

    print("\nCommands:")
    print("  - Type your request to generate Manim code")
    print("  - Type 'refine: <changes>' to refine the last generation")
    print("  - Type 'exit' or 'quit' to quit")
    print("  - Type 'show' to display the last generated code")
    print()

    while True:
        try:
            query = input("\n> ").strip()

            if not query:
                continue

            if query.lower() in {"exit", "quit"}:
                print("\nExiting...")
                break

            if query.lower() == "show":
                if current_code:
                    print("\n" + "=" * 70)
                    print("Last Generated Code:")
                    print("=" * 70)
                    print(current_code)
                else:
                    print("[ERROR] No code generated yet")
                continue

            if query.lower().startswith("refine:"):
                if not current_code or not current_request:
                    print("[ERROR] No previous code to refine. Generate code first.")
                    continue

                refinement = query[7:].strip()
                result = rag.refine(current_request, refinement, current_code)
            else:
                current_request = query
                result = rag.generate(query)

            print("\n" + "=" * 70)
            if result['success']:
                quality_info = f", quality: {result.get('quality_score', 0):.2f}" if 'quality_score' in result else ""
                print(f"[SUCCESS] Code generated (attempt {result['attempts']}{quality_info})")
            else:
                print(f"[WARNING] Generation completed with issues: {result['error']}")
            print("=" * 70)
            print(result['code'])
            print("=" * 70)

            current_code = result['code']

        except KeyboardInterrupt:
            print("\n\nExiting...")
            break
        except Exception as e:
            print(f"\n[ERROR] {e}")
            import traceback
            traceback.print_exc()
# CLI disabled when used as backend service
