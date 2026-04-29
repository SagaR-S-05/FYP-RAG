import json
import os
import re
from functools import lru_cache

from langchain_ollama import OllamaLLM


DOMAIN_REJECTION_MESSAGE = (
    "I can only generate Math, Machine Learning, or Deep Learning visualizations. "
    "Please ask for a concept such as calculus, linear algebra, probability, "
    "statistics, regression, classification, neural networks, or optimization."
)

LLM_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:latest")

DOMAIN_VALIDATION_PROMPT = """
Classify whether this user request is within the supported visualization domain.

Supported domain:
- Mathematics concepts: algebra, calculus, geometry, trigonometry, probability,
  statistics, linear algebra, optimization, equations, graphs, functions.
- Machine Learning concepts: supervised learning, unsupervised learning,
  regression, classification, clustering, model training/evaluation, loss,
  gradient descent, decision boundaries, datasets, features, labels.
- Deep Learning concepts: neural networks, activations, backpropagation,
  CNNs, RNNs, transformers, attention, embeddings.

Important judgment rules:
- Accept comparison, explanation, demonstration, animation, plotting, or
  visualization requests if their concept belongs to the supported domain.
- Do not require the user to say "visualize"; infer whether the concept can be
  turned into a Manim educational visualization.
- Base the verdict on the main educational concept, not on command words like
  compare, explain, show, generate, visualize, animate, or create.
- Reject requests whose main topic is outside math, ML, or deep learning, even
  if they use generic words like model, network, graph, or data.
- Reject generic computer science, software engineering, business, science,
  history, writing, or general knowledge prompts unless the main concept is
  explicitly mathematical, machine learning, or deep learning.

Return only compact JSON with this exact shape:
{{"allowed": true|false, "domain": "math|machine_learning|deep_learning|outside", "confidence": 0.0-1.0, "reason": "short reason"}}

User request:
{prompt}
""".strip()

_ALLOWED_PHRASES = {
    "machine learning",
    "deep learning",
    "linear algebra",
    "gradient descent",
    "back propagation",
    "backpropagation",
    "neural network",
    "neural networks",
    "decision boundary",
    "loss function",
    "activation function",
    "support vector",
    "random forest",
    "naive bayes",
    "nearest neighbor",
    "principal component",
    "eigen value",
    "eigen vector",
    "bayes theorem",
    "normal distribution",
    "probability distribution",
    "confusion matrix",
    "training data",
    "feature space",
    "supervised learning",
    "unsupervised learning",
    "labeled data",
    "unlabeled data",
    "pattern discovery",
}

_ALLOWED_TERMS = {
    "algebra",
    "calculus",
    "derivative",
    "integral",
    "limit",
    "function",
    "equation",
    "polynomial",
    "quadratic",
    "matrix",
    "matrices",
    "vector",
    "vectors",
    "eigenvalue",
    "eigenvector",
    "geometry",
    "geometric",
    "triangle",
    "circle",
    "square",
    "polygon",
    "angle",
    "slope",
    "graph",
    "plot",
    "axis",
    "axes",
    "probability",
    "statistics",
    "statistical",
    "mean",
    "median",
    "variance",
    "standard deviation",
    "distribution",
    "regression",
    "classification",
    "classifier",
    "clustering",
    "cluster",
    "dataset",
    "data",
    "label",
    "labels",
    "feature",
    "features",
    "model",
    "training",
    "prediction",
    "predict",
    "loss",
    "gradient",
    "optimization",
    "optimizer",
    "activation",
    "neuron",
    "network",
    "perceptron",
    "cnn",
    "rnn",
    "lstm",
    "transformer",
    "attention",
    "embedding",
    "pca",
    "svm",
    "kmeans",
    "knn",
    "entropy",
    "sigmoid",
    "softmax",
    "relu",
    "supervised",
    "unsupervised",
    "labeled",
    "unlabeled",
    "evaluation",
    "accuracy",
    "precision",
    "recall",
    "overfitting",
    "underfitting",
}

_GENERIC_ALLOWED_TERMS = {
    "data",
    "dataset",
    "function",
    "graph",
    "plot",
    "model",
    "network",
    "training",
    "prediction",
    "predict",
    "feature",
    "features",
    "label",
    "labels",
    "algorithm",
    "algorithms",
    "evaluation",
}

_OFF_DOMAIN_TERMS = {
    "article",
    "blog",
    "satellite",
    "communication",
    "networking",
    "router",
    "blockchain",
    "weather",
    "recipe",
    "movie",
    "game",
    "story",
    "history",
    "geography",
    "biology",
    "chemistry",
    "physics",
    "rocket",
    "planet",
    "solar",
    "business",
    "finance",
    "website",
    "webpage",
    "api",
    "database",
    "login",
    "authentication",
    "sorting",
    "searching",
    "dijkstra",
    "filesystem",
    "operating",
    "compiler",
    "programming",
    "javascript",
    "python",
    "react",
    "song",
    "poem",
    "essay",
    "resume",
    "email",
    "letter",
    "travel",
    "hotel",
    "sports",
    "football",
    "cricket",
    "music",
    "medical",
    "law",
    "legal",
    "stock",
    "crypto",
    "marketing",
    "sales",
    "shopping",
    "ecommerce",
    "e-commerce",
}


@lru_cache(maxsize=1)
def _domain_llm() -> OllamaLLM:
    return OllamaLLM(
        model=LLM_MODEL,
        temperature=0,
    )


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z][a-zA-Z0-9+-]*", text.lower()))


def _contains_math_expression(text: str) -> bool:
    compact = text.lower().replace(" ", "")
    expression_patterns = [
        r"\by\s*=",
        r"\bf\s*\(\s*x\s*\)\s*=",
        r"[a-z]\s*\^\s*\d+",
        r"[a-z]\s*\*\*\s*\d+",
        r"\d+\s*[a-z]\b",
        r"\b(sin|cos|tan|log|ln|exp)\s*\(",
    ]
    return any(re.search(pattern, text.lower()) for pattern in expression_patterns) or bool(
        re.search(r"(y=|f\(x\)=|[a-z]\^\d+|[a-z]\*\*\d+|\d+[a-z])", compact)
    )


def _extract_json_object(text: str) -> dict | None:
    if not text:
        return None

    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()

    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        return None

    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None

    return payload if isinstance(payload, dict) else None


def _is_supported_domain_by_terms(prompt: str) -> bool | None:
    normalized = " ".join(prompt.lower().split())
    if not normalized:
        return False

    tokens = _tokens(normalized)
    off_domain_hits = tokens & _OFF_DOMAIN_TERMS
    if off_domain_hits:
        return False

    if _contains_math_expression(normalized):
        return True

    if any(phrase in normalized for phrase in _ALLOWED_PHRASES):
        return True

    allowed_hits = tokens & _ALLOWED_TERMS

    if not allowed_hits:
        return None

    if not (allowed_hits - _GENERIC_ALLOWED_TERMS):
        return None

    return True


def _is_supported_domain_by_llm(prompt: str) -> bool | None:
    try:
        response = _domain_llm().invoke(
            DOMAIN_VALIDATION_PROMPT.format(prompt=prompt.strip())
        )
    except Exception:
        return None

    payload = _extract_json_object(str(response))
    if not payload:
        return None

    allowed = payload.get("allowed")
    domain = str(payload.get("domain", "")).strip().lower()

    if not isinstance(allowed, bool):
        return None

    if allowed and domain in {"math", "machine_learning", "deep_learning"}:
        return True

    if not allowed or domain == "outside":
        return False

    return None


def is_supported_domain(prompt: str) -> bool:
    normalized = prompt.strip()
    if not normalized:
        return False

    term_verdict = _is_supported_domain_by_terms(normalized)
    if term_verdict is not None:
        return term_verdict

    llm_verdict = _is_supported_domain_by_llm(normalized)
    if llm_verdict is not None:
        return llm_verdict

    return False


def validate_supported_domain(prompt: str) -> None:
    if not is_supported_domain(prompt):
        raise ValueError(DOMAIN_REJECTION_MESSAGE)
