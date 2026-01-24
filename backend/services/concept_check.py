import json
from collections import Counter, defaultdict
import re

DATASET_PATH = "dataset/manim-dataset-111-fixed.jsonl"

# Basic keyword-to-concept mapping (extendable)
KEYWORD_CONCEPTS = {
    "gradient descent": "Gradient Descent",
    "loss": "Loss Function",
    "error": "Loss Function",
    "linear regression": "Linear Regression",
    "logistic regression": "Logistic Regression",
    "knn": "KNN",
    "k nearest": "KNN",
    "cluster": "Clustering",
    "kmeans": "Clustering",
    "neural": "Neural Networks",
    "perceptron": "Neural Networks",
    "activation": "Activation Functions",
    "relu": "Activation Functions",
    "sigmoid": "Activation Functions",
    "tanh": "Activation Functions",
    "pca": "Dimensionality Reduction",
    "dimension": "Curse of Dimensionality",
    "overfit": "Bias-Variance",
    "underfit": "Bias-Variance",
    "bias": "Bias-Variance",
    "variance": "Bias-Variance",
    "accuracy": "Evaluation Metrics",
    "precision": "Evaluation Metrics",
    "recall": "Evaluation Metrics",
}

def normalize(text):
    return re.sub(r"[^a-z0-9 ]", "", text.lower())

def extract_concepts(entry):
    concepts = set()

    # 1. Topic field (highest priority)
    topic = entry.get("topic", "")
    if topic:
        concepts.add(topic.strip())

    # 2. Prompt-based keyword detection
    prompt = normalize(entry.get("prompt", ""))
    for key, concept in KEYWORD_CONCEPTS.items():
        if key in prompt:
            concepts.add(concept)

    return concepts


def main():
    concept_counter = Counter()
    concept_examples = defaultdict(list)

    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, start=1):
            entry = json.loads(line)
            concepts = extract_concepts(entry)

            for c in concepts:
                concept_counter[c] += 1
                concept_examples[c].append(idx)

    print("\n📊 CONCEPT COVERAGE SUMMARY\n")
    for concept, count in concept_counter.most_common():
        print(f"{concept:30s} : {count}")

    print("\n📌 TOTAL UNIQUE CONCEPTS:", len(concept_counter))

    # Optional: save detailed report
    with open("concept_coverage_report.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "summary": dict(concept_counter),
                "examples": dict(concept_examples),
            },
            f,
            indent=2
        )

    print("\n✅ Detailed report saved as concept_coverage_report.json")


if __name__ == "__main__":
    main()
