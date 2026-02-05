# =========================
# Manim RAG (LangChain >=0.2, FAISS, Ollama)
# =========================

import json
import re
from pathlib import Path
from typing import List, Dict

from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate

from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import OllamaLLM


# =========================
# CONFIG
# =========================

DATASET_PATH = "dataset/manim-dataset.jsonl"
FAISS_DIR = "manim_faiss_store_v2"   # versioned to avoid stale embeddings
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "qwen2.5-coder:latest"
TOP_K = 1


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

def load_jsonl(path: str) -> List[dict]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


# =========================
# DOCUMENT BUILDING (SAFE)
# =========================

def build_documents(dataset: List[dict]) -> List[Document]:
    docs = []

    for item in dataset:
        prompt = str(item.get("prompt", "")).strip()
        topic = str(item.get("topic", "")).strip()
        difficulty = str(item.get("difficulty", "")).strip()
        code = str(item.get("code", ""))

        content = f"""
PROMPT:
{prompt}

TOPIC:
{topic}

DIFFICULTY:
{difficulty}
"""

        docs.append(
            Document(
                page_content=content.strip(),
                metadata={
                    "code": code,
                    "prompt": normalize_prompt(prompt)
                }
            )
        )

    return docs


# =========================
# VECTOR STORE (FORCED REBUILD)
# =========================

def create_faiss(docs: List[Document]) -> FAISS:
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)

    if Path(FAISS_DIR).exists():
        import shutil
        shutil.rmtree(FAISS_DIR)

    vectorstore = FAISS.from_documents(docs, embeddings)
    vectorstore.save_local(FAISS_DIR)
    return vectorstore


# =========================
# PROMPT (LLM LAST RESORT)
# =========================

SYSTEM_RULES = """
You are an expert Manim Community Edition developer.

STRICT RULES:
- Output ONLY valid Python code.
- Always start with: from manim import *
- Define EXACTLY ONE Scene class.
- The code must run in Manim CE v0.18+.
"""

PROMPT = PromptTemplate(
    input_variables=["question"],
    template=f"""
{SYSTEM_RULES}

TASK:
Generate Manim code for:

"{{question}}"

OUTPUT:
"""
)


# =========================
# RAG ENGINE
# =========================

class ManimRAG:
    def __init__(self):
        self.dataset = load_jsonl(DATASET_PATH)

        # Exact-match index
        self.prompt_index: Dict[str, dict] = {
            normalize_prompt(item.get("prompt", "")): item
            for item in self.dataset
        }

        documents = build_documents(self.dataset)
        self.vectorstore = create_faiss(documents)

        self.retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": TOP_K}
        )

        self.llm = OllamaLLM(
            model=LLM_MODEL,
            temperature=0.0
        )

        self.chain = PROMPT | self.llm

    def generate(self, query: str) -> str:
        normalized = normalize_prompt(query)

        # 1️⃣ Exact match → return dataset code verbatim
        if normalized in self.prompt_index:
            return self.prompt_index[normalized]["code"]

        # 2️⃣ Strong semantic hit → return dataset code verbatim
        docs = self.retriever.invoke(query)
        if docs:
            return docs[0].metadata["code"]

        # 3️⃣ LLM fallback (last resort)
        return self.chain.invoke({
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
