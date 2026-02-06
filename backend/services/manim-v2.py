# =========================
# Manim RAG (LangChain >=0.2, FAISS, Ollama)
# Dataset-grounded generation + Validators
# =========================

import json
import re
import ast
from pathlib import Path
from typing import List

from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import OllamaLLM


# =========================
# PATH RESOLUTION
# =========================

BASE_DIR = Path(__file__).resolve().parents[1]   # backend/
DATASET_PATH = BASE_DIR / "dataset" / "manim-dataset.jsonl"
FAISS_DIR = BASE_DIR / "manim_faiss_store_v2"


# =========================
# CONFIG
# =========================

EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "qwen2.5-coder:latest"

TOP_K = 3
MAX_REPAIR_ATTEMPTS = 3


# =========================
# NORMALIZATION
# =========================

def normalize_prompt(text: str) -> str:
    text = str(text).lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


# =========================
# DATA LOADING
# =========================

def load_jsonl(path: Path) -> List[dict]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


# =========================
# DOCUMENT BUILDING
# =========================

def build_documents(dataset: List[dict]) -> List[Document]:
    docs = []

    for item in dataset:
        content = f"""
PROMPT:
{item.get("prompt", "")}

TOPIC:
{item.get("topic", "")}

DIFFICULTY:
{item.get("difficulty", "")}

MANIM CODE EXAMPLE:
{item.get("code", "")}
"""

        docs.append(
            Document(
                page_content=content.strip(),
                metadata={
                    "normalized_prompt": normalize_prompt(item.get("prompt", ""))
                }
            )
        )

    return docs


# =========================
# VECTOR STORE
# =========================

def create_faiss(docs: List[Document]) -> FAISS:
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    if FAISS_DIR.exists():
        import shutil
        shutil.rmtree(FAISS_DIR)

    vectorstore = FAISS.from_documents(docs, embeddings)
    vectorstore.save_local(str(FAISS_DIR))
    return vectorstore


# =========================
# PROMPT
# =========================

SYSTEM_RULES = """
You are an expert Manim Community Edition developer.

You will be given reference Manim examples from a dataset.
Use them strictly as guidance for correctness and structure.

RULES:
- Generate NEW Manim code that satisfies the user request
- Do NOT copy examples verbatim
- Do NOT hallucinate APIs not shown in the references
- NEVER wrap output in markdown or triple backticks
- Prefer clarity, simplicity, and correctness

STRICT OUTPUT RULES:
- Output ONLY valid Python code
- Always start with: from manim import *
- Define EXACTLY ONE Scene class
- Code must run in Manim CE v0.18+
"""

PROMPT = PromptTemplate(
    input_variables=["question", "references", "error", "system_rules"],
    template="""
{system_rules}

USER REQUEST:
{question}

REFERENCE EXAMPLES:
{references}

PREVIOUS ERROR (if any):
{error}

TASK:
Generate corrected Manim code.
"""
)


# =========================
# OUTPUT SANITIZATION
# =========================

def strip_code_fences(code: str) -> str:
    code = code.strip()

    if code.startswith("```"):
        lines = code.splitlines()

        # Remove opening ``` or ```python
        if lines[0].startswith("```"):
            lines = lines[1:]

        # Remove closing ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        code = "\n".join(lines)

    return code.strip()


# =========================
# VALIDATORS
# =========================

def validate_python(code: str) -> None:
    ast.parse(code)


def validate_manim_structure(code: str) -> None:
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
        raise ValueError("Missing 'from manim import *' import")

    if len(scene_classes) != 1:
        raise ValueError("Exactly ONE Scene class inheriting from Scene is required")


def validate(code: str) -> None:
    validate_python(code)
    validate_manim_structure(code)


# =========================
# RAG ENGINE
# =========================

class ManimRAG:
    def __init__(self):
        self.dataset = load_jsonl(DATASET_PATH)

        documents = build_documents(self.dataset)
        self.vectorstore = create_faiss(documents)

        self.retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": TOP_K}
        )

        self.llm = OllamaLLM(model=LLM_MODEL, temperature=0.0)
        self.chain = PROMPT | self.llm

    def generate(self, query: str) -> str:
        docs = self.retriever.invoke(query)

        if not docs:
            return f"# ❌ No relevant examples found for:\n# {query}"

        references = "\n\n---\n\n".join(doc.page_content for doc in docs)

        last_error = "None"
        last_code = ""

        for _ in range(MAX_REPAIR_ATTEMPTS):
            raw_code = self.chain.invoke({
                "question": query,
                "references": references,
                "error": last_error,
                "system_rules": SYSTEM_RULES
            })

            last_code = strip_code_fences(raw_code)

            try:
                validate(last_code)
                return last_code
            except Exception as e:
                last_error = str(e)

        return f"""
# ⚠️ Validation failed after {MAX_REPAIR_ATTEMPTS} attempts
# Last error:
# {last_error}

{last_code}
"""


# =========================
# CLI
# =========================

if __name__ == "__main__":
    print("Initializing Manim RAG with validators...")
    rag = ManimRAG()

    print("\nReady. Type a Manim animation request (type 'exit' to quit)")
    while True:
        query = input("\n> ").strip()
        if query.lower() in {"exit", "quit"}:
            break

        print("\nGenerated Manim Code:\n")
        print(rag.generate(query))
