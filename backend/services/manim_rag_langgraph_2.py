# ============================================================
# Manim RAG with LangGraph Validation, Retry, Syntax Repair
# and Semantic Simplification (FINAL)
# ============================================================

import json
import ast
import re
from pathlib import Path
from typing import List, Optional, TypedDict

from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import OllamaLLM

from langgraph.graph import StateGraph, END


# ============================================================
# CONFIG
# ============================================================

DATASET_PATH = r"manim-dataset.jsonl"
FAISS_DIR = r"manim_faiss_store"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
LLM_MODEL = "qwen2.5-coder:latest"
TOP_K = 5
MAX_ATTEMPTS = 3


# ============================================================
# DATA LOADING
# ============================================================

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


# ============================================================
# VECTOR STORE
# ============================================================

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


# ============================================================
# PROMPT (GENERATOR)
# ============================================================

SYSTEM_RULES = """
You are an expert Manim Community Edition developer.

STRICT RULES:
- Output ONLY valid Python code.
- Always start with: from manim import *
- Define EXACTLY ONE Scene class.
- Do NOT invent APIs or classes.

FAIL-SAFE RULE:
- If the request is complex, produce a simpler but correct conceptual visualization.
"""

PROMPT = PromptTemplate(
    input_variables=["context", "question"],
    template=f"""
{SYSTEM_RULES}

REFERENCE EXAMPLES:
{{context}}

TASK:
Generate Manim code for:

"{{question}}"
"""
)


# ============================================================
# VALIDATORS
# ============================================================

def structural_validator(code: str) -> bool:
    if "from manim import *" not in code:
        return False
    return len(re.findall(r"class\\s+\\w+\\(Scene\\):", code)) == 1


def syntax_validator(code: str) -> bool:
    try:
        ast.parse(code)
        return True
    except SyntaxError:
        return False


def manim_semantic_validator(code: str) -> bool:
    return "def construct" in code and any(
        k in code for k in ["Create(", "Write(", "FadeIn(", "Transform("]
    )


def validate_code(code: str):
    if not structural_validator(code):
        return False, "STRUCTURAL", "Structural validation failed"
    if not syntax_validator(code):
        return False, "SYNTAX", "Python syntax error"
    if not manim_semantic_validator(code):
        return False, "SEMANTIC", "Manim semantic validation failed"
    return True, None, None


# ============================================================
# LANGGRAPH STATE
# ============================================================

class RAGState(TypedDict):
    query: str
    context: str
    code: Optional[str]
    is_valid: bool
    error: Optional[str]
    error_type: Optional[str]
    attempts: int


# ============================================================
# MANIM RAG ENGINE (FINAL)
# ============================================================

class ManimRAG:
    def __init__(self):
        dataset = load_jsonl(DATASET_PATH)
        docs = build_documents(dataset)

        self.vectorstore = create_or_load_faiss(docs)
        self.retriever = self.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": TOP_K}
        )

        self.llm = OllamaLLM(model=LLM_MODEL, temperature=0.1)
        self.chain = PROMPT | self.llm
        self.graph = self._build_graph()

    # ---------------- Nodes ----------------

    def _retrieve(self, state: RAGState):
        docs = self.retriever.invoke(state["query"])
        return {**state, "context": "\n\n".join(d.page_content for d in docs)}

    def _generate(self, state: RAGState):
        code = self.chain.invoke({
            "context": state["context"],
            "question": state["query"]
        })
        return {**state, "code": code, "attempts": state["attempts"] + 1}

    def _validate(self, state: RAGState):
        ok, etype, msg = validate_code(state["code"])
        return {**state, "is_valid": ok, "error_type": etype, "error": msg}

    def _fix_syntax(self, state: RAGState):
        fixed = self.llm.invoke(
            f"Fix ONLY Python syntax errors in this code:\n{state['code']}"
        )
        return {**state, "code": fixed}

    def _simplify_semantic(self, state: RAGState):
        simplified = self.llm.invoke(
            f"""
Produce a SIMPLE but VALID Manim animation for:

"{state['query']}"

Rules:
- One Scene
- Minimal objects
- Conceptual correctness over detail
"""
        )
        return {**state, "code": simplified}

    def _route(self, state: RAGState):
        if state["is_valid"]:
            return "end"
        if state["error_type"] == "SYNTAX":
            return "fix_syntax"
        if state["error_type"] == "SEMANTIC" and state["attempts"] >= 1:
            return "simplify"
        if state["attempts"] >= MAX_ATTEMPTS:
            return "simplify"
        return "generate"

    def _build_graph(self):
        g = StateGraph(RAGState)

        g.add_node("retrieve", self._retrieve)
        g.add_node("generate", self._generate)
        g.add_node("validate", self._validate)
        g.add_node("fix_syntax", self._fix_syntax)
        g.add_node("simplify", self._simplify_semantic)

        g.set_entry_point("retrieve")
        g.add_edge("retrieve", "generate")
        g.add_edge("generate", "validate")

        g.add_conditional_edges(
            "validate",
            self._route,
            {
                "fix_syntax": "fix_syntax",
                "simplify": "simplify",
                "generate": "generate",
                "end": END
            }
        )

        g.add_edge("fix_syntax", "validate")
        g.add_edge("simplify", "validate")

        return g.compile()

    # ---------------- API ----------------

    def generate(self, query: str) -> str:
        result = self.graph.invoke({
            "query": query,
            "context": "",
            "code": None,
            "is_valid": False,
            "error": None,
            "error_type": None,
            "attempts": 0
        })

        if not result["is_valid"]:
            raise RuntimeError("Generation failed")

        return result["code"]
