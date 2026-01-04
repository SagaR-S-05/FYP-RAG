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

DATASET_PATH = "manim-dataset-111-fixed.jsonl"
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
You are an expert Manim developer.

STRICT RULES:
- Output ONLY valid Python code.
- Do NOT include explanations.
- Do NOT include markdown.
- Do NOT include comments unless required.
- Always use: from manim import *
- Define EXACTLY ONE Scene class.
- The code must run without modification.
- Follow the retrieved examples closely.
- Do NOT invent APIs or classes.
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

