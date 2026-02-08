# =========================
# Manim RAG (LangChain >=0.2, FAISS, Ollama)
# Dataset-grounded generation + Validators + Intent Verification
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

BASE_DIR = Path(__file__).resolve().parents[1]
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
# MARKDOWN STRIPPER
# =========================

def extract_code(text: str) -> str:
    if "```" in text:
        text = re.sub(r"```(?:python)?", "", text)
        text = text.replace("```", "")
    return text.strip()


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

def load_or_create_faiss(docs: List[Document]) -> FAISS:
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    if FAISS_DIR.exists():
        return FAISS.load_local(
            str(FAISS_DIR),
            embeddings,
            allow_dangerous_deserialization=True
        )

    vectorstore = FAISS.from_documents(docs, embeddings)
    vectorstore.save_local(str(FAISS_DIR))
    return vectorstore


# =========================
# PROMPTS
# =========================

SYSTEM_RULES = """
You are an expert Manim Community Edition developer.

RULES:
- Generate NEW Manim code
- Output ONLY valid Python code
- Always start with: from manim import *
- Define EXACTLY ONE Scene class
- Code must run in Manim CE v0.18+

MANIM API SAFETY RULES:
- Plot graphs first and reuse graph objects
- Never pass lambda functions directly to shading or slope utilities
"""

GENERATION_PROMPT = PromptTemplate(
    input_variables=["question", "references", "error", "system_rules"],
    template="""
{system_rules}

USER REQUEST:
{question}

REFERENCE EXAMPLES:
{references}

PREVIOUS ERROR:
{error}

TASK:
Generate corrected Manim code.
"""
)

INTENT_JUDGE_PROMPT = PromptTemplate(
    input_variables=["question", "code"],
    template="""
You are reviewing generated Manim code.

USER REQUEST:
{question}

GENERATED CODE:
{code}

Question:
Does the code clearly and directly satisfy the user request?

Answer ONLY with YES or NO.
"""
)


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
        raise ValueError("Missing 'from manim import *'")

    if len(scene_classes) != 1:
        raise ValueError("Exactly ONE Scene class required")


def validate_manim_semantics(code: str) -> None:
    if "get_area(lambda" in code:
        raise ValueError("axes.get_area() must receive a graph object")

    if "get_area(" in code and ".plot(" not in code:
        raise ValueError("Plot graph before calling get_area()")


def validate(code: str) -> None:
    validate_python(code)
    validate_manim_structure(code)
    validate_manim_semantics(code)


# =========================
# RAG ENGINE
# =========================

class ManimRAG:
    def __init__(self):
        self.dataset = load_jsonl(DATASET_PATH)
        documents = build_documents(self.dataset)

        self.vectorstore = load_or_create_faiss(documents)

        self.retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": TOP_K}
        )

        self.llm = OllamaLLM(
            model=LLM_MODEL,
            temperature=0.0
        )

        self.gen_chain = GENERATION_PROMPT | self.llm
        self.judge_chain = INTENT_JUDGE_PROMPT | self.llm

    def generate(self, query: str) -> str:
        docs = self.retriever.invoke(normalize_prompt(query))

        if not docs:
            return "# ❌ No relevant Manim examples found."

        references = "\n\n---\n\n".join(doc.page_content for doc in docs)

        last_error = "None"
        last_code = ""

        for _ in range(MAX_REPAIR_ATTEMPTS):
            raw_output = self.gen_chain.invoke({
                "question": query,
                "references": references,
                "error": last_error,
                "system_rules": SYSTEM_RULES
            })

            last_code = extract_code(raw_output)

            # 1️⃣ Syntax & structural validation
            try:
                validate(last_code)
            except Exception as e:
                last_error = str(e)
                continue

            # 2️⃣ Intent verification (GENERAL)
            verdict = self.judge_chain.invoke({
                "question": query,
                "code": last_code
            }).strip().upper()

            if verdict == "YES":
                return last_code

            last_error = (
                "The generated code does not satisfy the user request. "
                "Regenerate code that directly fulfills the request."
            )

        # Guaranteed fallback
        return f"""
# ⚠️ Auto-generation failed. Returning closest dataset example.

{docs[0].page_content}
"""


# =========================
# CLI
# =========================

if __name__ == "__main__":
    print("Initializing Manim RAG with intent verification...")
    rag = ManimRAG()

    while True:
        query = input("\n> ").strip()
        if query.lower() in {"exit", "quit"}:
            break

        code = rag.generate(query)
        print("\nGenerated Manim Code:\n")
        print(code)
