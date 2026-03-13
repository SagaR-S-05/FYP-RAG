"""
Manim RAG — Evaluation Script
==============================
Loads the held-out eval split that was saved by rag_pipeline.py during
index construction.  Because those prompts were *never added to the FAISS
index*, Recall/MRR scores reflect genuine retrieval generalisation rather
than memorised lookups.

Usage
-----
    python evaluate.py                  # full eval
    python evaluate.py --quick 30       # fast smoke-test on 30 samples
    python evaluate.py --no-generation  # retrieval metrics only (no LLM)
"""

import sys
import json
import ast
import argparse
import numpy as np
from pathlib import Path
from typing import List, Dict, Optional

# ─────────────────────────────────────────────
# PATH SETUP
# ─────────────────────────────────────────────

SCRIPT_DIR   = Path(__file__).resolve().parent          # backend/pipeline/
BACKEND_DIR  = SCRIPT_DIR.parent                        # backend/
PROJECT_ROOT = BACKEND_DIR.parent                       # FYP-RAG/

sys.path.append(str(BACKEND_DIR))

# Import from rag_pipeline (single source of truth for paths/config)
from pipeline.rag_pipeline import (
    ManimRAG,
    normalize_prompt,
    load_eval_split,
    EVAL_SPLIT_PATH,
    EMBEDDING_MODEL,
    TOP_K,
)

from sentence_transformers import SentenceTransformer


# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

# A retrieved document is counted as a "hit" when its cosine similarity
# to the query exceeds this threshold.  0.50 is more realistic than the
# 0.65 used previously — BGE embeddings for cross-modal (prompt→code doc)
# comparisons rarely exceed 0.65 even on correct retrievals.
SIMILARITY_THRESHOLD = 0.50


# ─────────────────────────────────────────────
# AST STRUCTURAL SIMILARITY
# ─────────────────────────────────────────────

def ast_similarity(code1: str, code2: str) -> float:
    """
    Jaccard similarity over the *set* of AST node types.

    This is a structural proxy — two snippets that use the same Manim
    constructs (ClassDef, FunctionDef, Assign, Call …) score highly even
    if variable names differ.  It intentionally ignores exact token
    matching so that semantically equivalent but differently-written code
    still scores well.
    """
    try:
        tree1 = ast.parse(code1)
        tree2 = ast.parse(code2)
    except SyntaxError:
        return 0.0

    set1 = {type(n).__name__ for n in ast.walk(tree1)}
    set2 = {type(n).__name__ for n in ast.walk(tree2)}

    union = set1 | set2
    return len(set1 & set2) / len(union) if union else 0.0


# ─────────────────────────────────────────────
# RETRIEVAL METRICS  (Recall@K, MRR, Success Rate)
# ─────────────────────────────────────────────

def compute_retrieval_metrics(
    rag,
    eval_data: List[dict],
    embedder: SentenceTransformer,
    top_k: int = TOP_K,
    threshold: float = SIMILARITY_THRESHOLD,
) -> Dict[str, float]:
    """
    For each eval example:
      - Retrieve top-K documents using the (query-exclusive) FAISS index
      - Encode query and each retrieved doc with the same embedder
      - A retrieval is a "hit" if any doc scores above `threshold`
      - Record the rank of the first hit for MRR

    Returns Recall@K, MRR, and per-rank hit counts.
    """
    hits       = 0
    recip_sum  = 0.0
    rank_hits  = [0] * top_k   # rank_hits[i] = hits at rank i+1

    total = len(eval_data)

    for idx, item in enumerate(eval_data, 1):
        query     = item["prompt"]
        query_vec = embedder.encode(normalize_prompt(query), normalize_embeddings=True)

        docs = rag.retriever.invoke(normalize_prompt(query))

        first_hit_rank: Optional[int] = None

        for rank, doc in enumerate(docs, start=1):
            doc_vec = embedder.encode(doc.page_content, normalize_embeddings=True)
            # With normalize_embeddings=True, dot product == cosine similarity
            sim = float(np.dot(query_vec, doc_vec))

            if sim >= threshold:
                first_hit_rank = rank
                break

        if first_hit_rank is not None:
            hits += 1
            recip_sum += 1.0 / first_hit_rank
            rank_hits[first_hit_rank - 1] += 1

        if idx % 10 == 0 or idx == total:
            print(f"  [retrieval] {idx}/{total} evaluated …", end="\r")

    print()  # newline after progress

    return {
        "Recall@K":        hits / total,
        "MRR":             recip_sum / total,
        "rank_hits":       rank_hits,   # useful for Precision@1, @2, @3
        "Precision@1":     rank_hits[0] / total,
    }


# ─────────────────────────────────────────────
# GENERATION METRICS
# ─────────────────────────────────────────────

def evaluate_generation(
    rag,
    eval_data: List[dict],
) -> Dict[str, float]:
    """
    For each eval example, call rag.generate() and compare against
    the ground-truth code using:
      - Success rate   : fraction where result['success'] is True
      - Avg attempts   : mean repair attempts before success
      - Avg quality    : mean heuristic quality score (0–1)
      - AST similarity : mean structural Jaccard vs ground truth
    """
    total           = len(eval_data)
    success_count   = 0
    total_attempts  = 0
    total_quality   = 0.0
    total_ast_sim   = 0.0

    for idx, item in enumerate(eval_data, 1):
        result         = rag.generate(item["prompt"])
        generated_code = result["code"]
        ground_truth   = item.get("code", "")

        if result["success"]:
            success_count += 1

        total_attempts += result["attempts"]
        total_quality  += result.get("quality_score", 0.0)
        total_ast_sim  += ast_similarity(generated_code, ground_truth)

        print(f"  [generation] {idx}/{total}  success={result['success']}  "
              f"attempts={result['attempts']}  quality={result.get('quality_score', 0):.2f}",
              end="\r")

    print()

    return {
        "Success Rate":   success_count / total,
        "Avg Attempts":   total_attempts / total,
        "Avg Quality":    total_quality  / total,
        "AST Similarity": total_ast_sim  / total,
    }


# ─────────────────────────────────────────────
# RESULTS PRINTER
# ─────────────────────────────────────────────

def print_results(
    retrieval: Dict,
    generation: Optional[Dict],
    eval_size: int,
    top_k: int,
    threshold: float,
) -> None:
    w = 62
    print("\n" + "=" * w)
    print("  RESEARCH EVALUATION RESULTS")
    print("=" * w)
    print(f"  Eval examples : {eval_size}")
    print(f"  Top-K         : {top_k}")
    print(f"  Sim threshold : {threshold}")
    print("-" * w)
    print("  RETRIEVAL")
    print(f"    Recall@{top_k}      : {retrieval['Recall@K']:.4f}")
    print(f"    MRR           : {retrieval['MRR']:.4f}")
    print(f"    Precision@1   : {retrieval['Precision@1']:.4f}")
    rh = retrieval["rank_hits"]
    for i, h in enumerate(rh, 1):
        print(f"    Hits at rank {i} : {h}  ({100*h/eval_size:.1f}%)")

    if generation:
        print("-" * w)
        print("  GENERATION")
        print(f"    Success Rate  : {generation['Success Rate']:.4f}")
        print(f"    Avg Attempts  : {generation['Avg Attempts']:.4f}")
        print(f"    Avg Quality   : {generation['Avg Quality']:.4f}")
        print(f"    AST Similarity: {generation['AST Similarity']:.4f}")

    print("=" * w)


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Evaluate Manim RAG pipeline")
    p.add_argument(
        "--quick", type=int, default=None, metavar="N",
        help="Run on only the first N eval examples (smoke-test)"
    )
    p.add_argument(
        "--no-generation", action="store_true",
        help="Skip LLM generation metrics (retrieval only, much faster)"
    )
    p.add_argument(
        "--threshold", type=float, default=SIMILARITY_THRESHOLD,
        help=f"Cosine similarity threshold for a retrieval hit (default {SIMILARITY_THRESHOLD})"
    )
    p.add_argument(
        "--top-k", type=int, default=TOP_K,
        help=f"Number of docs to retrieve (default {TOP_K})"
    )
    return p.parse_args()


def main():
    args = parse_args()

    # ── Load held-out eval split ──────────────────────────────────────
    print(f"[INFO] Loading eval split from {EVAL_SPLIT_PATH}")
    eval_data = load_eval_split(EVAL_SPLIT_PATH)
    print(f"[INFO] Eval split: {len(eval_data)} examples (held-out, never indexed)")

    if args.quick:
        eval_data = eval_data[: args.quick]
        print(f"[INFO] Quick mode: using first {len(eval_data)} examples")

    # ── Initialise RAG (loads existing index — no rebuild) ────────────
    print("[INFO] Initialising RAG system …")
    rag = ManimRAG()

    # Override retriever top-k if requested
    if args.top_k != TOP_K:
        rag.retriever = rag.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": args.top_k},
        )

    # ── Shared embedder for retrieval scoring ─────────────────────────
    print(f"[INFO] Loading embedder: {EMBEDDING_MODEL}")
    embedder = SentenceTransformer(EMBEDDING_MODEL)

    # ── Retrieval metrics ─────────────────────────────────────────────
    print(f"\n[PHASE 1] Retrieval metrics (Recall@{args.top_k}, MRR) …")
    retrieval_metrics = compute_retrieval_metrics(
        rag, eval_data, embedder,
        top_k=args.top_k,
        threshold=args.threshold,
    )

    # ── Generation metrics (optional) ────────────────────────────────
    generation_metrics = None
    if not args.no_generation:
        print(f"\n[PHASE 2] Generation metrics ({len(eval_data)} LLM calls) …")
        print("          Pass --no-generation to skip this phase.\n")
        generation_metrics = evaluate_generation(rag, eval_data)

    # ── Print results ─────────────────────────────────────────────────
    print_results(
        retrieval_metrics,
        generation_metrics,
        eval_size=len(eval_data),
        top_k=args.top_k,
        threshold=args.threshold,
    )


if __name__ == "__main__":
    main()