# ============================================================
# Manim RAG with LangGraph Validation, Retry & Syntax Repair
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

ANIMATION FLOW RULES:
- Introduce elements step-by-step.
- Any explanatory Text or MathTex MUST fade out after display.
- Persistent elements only: axes, graphs, titles, core objects.

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
Generate Manim code for the following request:

"{{question}}"

OUTPUT:
"""
)


# ============================================================
# VALIDATORS
# ============================================================

FORBIDDEN_KEYWORDS = [
    "import os",
    "import sys",
    "subprocess",
    "eval(",
    "exec(",
    "__import__",
]


def structural_validator(code: str) -> bool:
    if "from manim import *" not in code:
        return False

    scenes = re.findall(r"class\s+\w+\(Scene\):", code)
    if len(scenes) != 1:
        return False

    for bad in FORBIDDEN_KEYWORDS:
        if bad in code:
            return False

    return True


def syntax_validator(code: str) -> bool:
    try:
        ast.parse(code)
        return True
    except SyntaxError:
        return False


def manim_semantic_validator(code: str) -> bool:
    if "def construct" not in code:
        return False

    required_hits = [
        "Create(",
        "Write(",
        "FadeIn(",
        "FadeOut(",
        "Transform(",
        "Text(",
        "MathTex(",
    ]

    return sum(1 for k in required_hits if k in code) >= 2


def validate_code(code: str) -> tuple[bool, Optional[str], Optional[str]]:
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
# MANIM RAG ENGINE
# ============================================================

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
        self.graph = self._build_graph()

    # ----------------------------
    # LangGraph Nodes
    # ----------------------------

    def _retrieve(self, state: RAGState) -> RAGState:
        docs = self.retriever.invoke(state["query"])
        context = "\n\n".join(d.page_content for d in docs)
        return {**state, "context": context}

    def _generate(self, state: RAGState) -> RAGState:
        code = self.chain.invoke({
            "context": state["context"],
            "question": state["query"]
        })
        return {
            **state,
            "code": code,
            "attempts": state["attempts"] + 1
        }

    def _validate(self, state: RAGState) -> RAGState:
        ok, error_type, error_msg = validate_code(state["code"])
        return {
            **state,
            "is_valid": ok,
            "error": error_msg,
            "error_type": error_type
        }

    def _fix(self, state: RAGState) -> RAGState:
        feedback = f"""
The generated Manim code FAILED validation.

ERROR:
{state['error']}

Fix ONLY this issue.
Do NOT add new features.
Keep structure as close as possible.
Output ONLY corrected Python code.
"""
        return {**state, "query": state["query"] + "\n\n" + feedback}

    def _fix_syntax(self, state: RAGState) -> RAGState:
        prompt = f"""
The following Manim code has PYTHON SYNTAX ERRORS.

RULES:
- Fix ONLY Python syntax errors
- Do NOT change logic, structure, or animation order
- Do NOT add or remove features
- Output ONLY corrected Python code

CODE:
{state['code']}
"""
        fixed_code = self.llm.invoke(prompt)
        return {**state, "code": fixed_code}

    def _should_continue(self, state: RAGState) -> str:
        if state["is_valid"]:
            return "end"
        if state["attempts"] >= MAX_ATTEMPTS:
            return "end"
        if state["error_type"] == "SYNTAX":
            return "fix_syntax"
        return "fix"

    def _build_graph(self):
        graph = StateGraph(RAGState)

        graph.add_node("retrieve", self._retrieve)
        graph.add_node("generate", self._generate)
        graph.add_node("validate", self._validate)
        graph.add_node("fix", self._fix)
        graph.add_node("fix_syntax", self._fix_syntax)

        graph.set_entry_point("retrieve")

        graph.add_edge("retrieve", "generate")
        graph.add_edge("generate", "validate")

        graph.add_conditional_edges(
            "validate",
            self._should_continue,
            {
                "fix": "fix",
                "fix_syntax": "fix_syntax",
                "end": END
            }
        )

        graph.add_edge("fix", "generate")
        graph.add_edge("fix_syntax", "validate")

        return graph.compile()

    # ----------------------------
    # Public API
    # ----------------------------

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
            raise RuntimeError(
                f"Failed after {result['attempts']} attempts: {result['error']}"
            )

        return result["code"]


# ============================================================
# CLI (OPTIONAL)
# ============================================================

if __name__ == "__main__":
    rag = ManimRAG()
    print("Manim RAG with syntax-aware LangGraph ready. Type 'exit' to quit.")

    while True:
        q = input("\n> ").strip()
        if q.lower() in {"exit", "quit"}:
            break

        try:
            code = rag.generate(q)
            print("\nGenerated Manim Code:\n")
            print(code)
        except Exception as e:
            print(f"\n❌ Error: {e}")
