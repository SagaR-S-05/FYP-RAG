import re


DOMAIN_REJECTION_MESSAGE = (
    "I can only generate Math, Machine Learning, or Deep Learning visualizations. "
    "Please ask for a concept such as calculus, linear algebra, probability, "
    "statistics, regression, classification, neural networks, or optimization."
)

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


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z][a-zA-Z0-9+-]*", text.lower()))


def is_supported_domain(prompt: str) -> bool:
    normalized = " ".join(prompt.lower().split())
    if not normalized:
        return False

    tokens = _tokens(normalized)
    off_domain_hits = tokens & _OFF_DOMAIN_TERMS
    if off_domain_hits:
        return False

    if any(phrase in normalized for phrase in _ALLOWED_PHRASES):
        return True

    allowed_hits = tokens & _ALLOWED_TERMS

    if not allowed_hits:
        return False

    if not (allowed_hits - _GENERIC_ALLOWED_TERMS):
        return False

    return True


def validate_supported_domain(prompt: str) -> None:
    if not is_supported_domain(prompt):
        raise ValueError(DOMAIN_REJECTION_MESSAGE)
