import sys
import json
import ast
import numpy as np
from pathlib import Path
from typing import List
from sklearn.model_selection import train_test_split

# =============================
# FIX IMPORT PATH
# =============================

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BACKEND_DIR))

# Import your RAG system
from main import ManimRAG, normalize_prompt, build_documents

from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from sentence_transformers import SentenceTransformer


# =============================
# CONFIG
# =============================

DATASET_PATH = BACKEND_DIR / "dataset" / "manim-dataset.jsonl"

TEST_SIZE = 0.2
RANDOM_SEED = 42
TOP_K = 3

EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
SIMILARITY_THRESHOLD = 0.65


# =============================
# LOAD DATASET
# =============================

def load_jsonl(path: Path) -> List[dict]:
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f]


# =============================
# AST STRUCTURAL SIMILARITY
# =============================

def ast_similarity(code1: str, code2: str):

    try:
        tree1 = ast.parse(code1)
        tree2 = ast.parse(code2)
    except:
        return 0

    nodes1 = [type(node).__name__ for node in ast.walk(tree1)]
    nodes2 = [type(node).__name__ for node in ast.walk(tree2)]

    set1 = set(nodes1)
    set2 = set(nodes2)

    intersection = len(set1 & set2)
    union = len(set1 | set2)

    return intersection / union if union else 0


# =============================
# RETRIEVAL METRICS
# =============================

def compute_recall_mrr(rag, test_data):

    embedder = SentenceTransformer(EMBEDDING_MODEL)

    correct_at_k = 0
    reciprocal_sum = 0

    for item in test_data:

        query = item["prompt"]
        query_vec = embedder.encode(query)

        docs = rag.retriever.invoke(normalize_prompt(query))

        found_rank = None

        for rank, doc in enumerate(docs, start=1):

            retrieved_text = doc.page_content
            retrieved_vec = embedder.encode(retrieved_text)

            similarity = np.dot(query_vec, retrieved_vec) / (
                np.linalg.norm(query_vec) * np.linalg.norm(retrieved_vec)
            )

            if similarity > SIMILARITY_THRESHOLD:
                found_rank = rank
                break

        if found_rank:
            correct_at_k += 1
            reciprocal_sum += 1 / found_rank

    recall = correct_at_k / len(test_data)
    mrr = reciprocal_sum / len(test_data)

    return recall, mrr


# =============================
# GENERATION METRICS
# =============================

def evaluate_generation(rag, test_data):

    total = len(test_data)

    success = 0
    total_attempts = 0
    total_quality = 0
    total_ast_similarity = 0

    for item in test_data:

        result = rag.generate(item["prompt"])

        generated_code = result["code"]
        ground_truth = item.get("code", "")

        if result["success"]:
            success += 1

        total_attempts += result["attempts"]
        total_quality += result.get("quality_score", 0)

        total_ast_similarity += ast_similarity(
            generated_code,
            ground_truth
        )

    return {
        "Success Rate": success / total,
        "Avg Attempts": total_attempts / total,
        "Avg Quality": total_quality / total,
        "AST Similarity": total_ast_similarity / total
    }


# =============================
# EXPERIMENT RUNNER
# =============================

def run_experiment():

    dataset = load_jsonl(DATASET_PATH)

    train_data, test_data = train_test_split(
        dataset,
        test_size=TEST_SIZE,
        random_state=RANDOM_SEED
    )

    print(f"Train size: {len(train_data)}")
    print(f"Test size: {len(test_data)}")

    # Initialize RAG
    rag = ManimRAG()

    # =============================
    # Rebuild FAISS using TRAIN set
    # =============================

    documents = build_documents(train_data)

    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL
    )

    rag.vectorstore = FAISS.from_documents(
        documents,
        embeddings
    )

    rag.retriever = rag.vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": TOP_K,
            "fetch_k": 20,
            "lambda_mult": 0.7
        }
    )

    # =============================
    # RUN METRICS
    # =============================

    recall, mrr = compute_recall_mrr(rag, test_data)

    gen_metrics = evaluate_generation(rag, test_data)

    print("\n==============================")
    print("RESEARCH EVALUATION RESULTS")
    print("==============================")

    print(f"Recall@{TOP_K}: {recall:.4f}")
    print(f"MRR: {mrr:.4f}")

    print(f"Success Rate: {gen_metrics['Success Rate']:.4f}")
    print(f"Average Attempts: {gen_metrics['Avg Attempts']:.4f}")
    print(f"Average Quality: {gen_metrics['Avg Quality']:.4f}")
    print(f"AST Similarity: {gen_metrics['AST Similarity']:.4f}")

    print("==============================")


# =============================
# MAIN
# =============================

if __name__ == "__main__":
    run_experiment()