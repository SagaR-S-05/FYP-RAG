"""
Manim RAG — Evaluation Script
==============================
Evaluates retrieval and generation quality using the held-out eval split
produced by rag_pipeline.py during index construction.

Why the previous results (Recall@3: 1.0, MRR: 1.0) were inflated
------------------------------------------------------------------
The old retrieval metric computed cosine similarity between the query
vector and the *retrieved document* vector using the same embedder that
built the index.  Since the eval prompts are semantically very close to
the training prompts (same Manim domain, similar phrasing), this always
scored above threshold — it was measuring embedding space proximity, not
whether the *correct* document was actually retrieved.

The correct approach for Recall@K / MRR in a RAG system is:
  - A retrieval is a HIT only if the retrieved document contains the
    *ground-truth code* for that eval query (exact code hash match).
  - This is the standard definition used in information retrieval research
    (e.g. MS-MARCO, BEIR benchmarks).

For AST Similarity, the old script compared generated code against ground
truth correctly — that metric is retained unchanged.

Usage
-----
    python rag_eval.py                   # full eval
    python rag_eval.py --quick 30        # smoke-test on 30 samples
    python rag_eval.py --no-generation   # retrieval metrics only (no LLM)
    python rag_eval.py --top-k 5         # evaluate with TOP_K=5
"""

import sys
import json
import ast
import argparse
import hashlib
import numpy as np
from pathlib import Path
from typing import List, Dict, Optional

# ─────────────────────────────────────────────
# PATH SETUP
# ─────────────────────────────────────────────

SCRIPT_DIR   = Path(__file__).resolve().parent   # backend/services/
BACKEND_DIR  = SCRIPT_DIR.parent                 # backend/
PROJECT_ROOT = BACKEND_DIR.parent                # FYP-RAG/

sys.path.append(str(BACKEND_DIR))

from pipeline.rag_pipeline import (
    ManimRAG,
    normalize_prompt,
    load_eval_split,
    EVAL_SPLIT_PATH,
    EMBEDDING_MODEL,
    TOP_K,
)


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _code_hash(code: str) -> str:
    """Stable MD5 hash of normalised code — mirrors rag_pipeline._code_hash."""
    return hashlib.md5(code.strip().encode()).hexdigest()


# ─────────────────────────────────────────────
# AST STRUCTURAL SIMILARITY
# ─────────────────────────────────────────────

def ast_similarity(code1: str, code2: str) -> float:
    """
    Jaccard similarity over the set of AST node types present in each
    code snippet.

    Rationale
    ---------
    Two Manim snippets that address the same concept will share the same
    high-level constructs (ClassDef, FunctionDef, For, Call, Assign …)
    even if variable names, colours, or exact API calls differ.  Jaccard
    over node-type *sets* (not multisets) captures structural similarity
    without penalising stylistic variation.

    Returns 0.0 if either snippet fails to parse.
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
# RETRIEVAL METRICS
# ─────────────────────────────────────────────

def compute_retrieval_metrics(
    rag,
    eval_data: List[dict],
    top_k: int = TOP_K,
) -> Dict:
    """
    Compute Recall@K, MRR, and Precision@1 using ground-truth code
    hash matching.

    Methodology
    -----------
    For each eval example:
      1. Retrieve the top-K documents from the FAISS index.
      2. Compute the MD5 hash of the ground-truth code for that example.
      3. A retrieval is a HIT at rank R if the document at rank R contains
         code whose hash matches the ground-truth hash.
      4. Record the rank of the first hit.

    This is the standard IR definition of Recall@K and MRR and avoids
    the embedding-similarity proxy used previously, which inflated scores
    because semantically similar (but incorrect) documents were counted
    as hits.

    Note on expected scores
    -----------------------
    Because the eval set contains code groups that are entirely absent
    from the FAISS index (by design — see rag_pipeline.deduplicate_and_split),
    a perfect Recall@K score is *impossible* by construction.  The retriever
    must surface a *different* but topically relevant document, which will
    not hash-match the ground truth.  Realistic scores for this setup are
    in the range 0.0–0.3 for Recall@K and 0.0–0.2 for MRR, reflecting
    genuine cross-topic generalisation difficulty.
    """
    hits      = 0
    recip_sum = 0.0
    rank_hits = [0] * top_k

    total = len(eval_data)

    for idx, item in enumerate(eval_data, 1):
        query          = item["prompt"]
        gt_hash        = _code_hash(item.get("code", ""))

        docs = rag.retriever.invoke(normalize_prompt(query))

        first_hit_rank: Optional[int] = None

        for rank, doc in enumerate(docs, start=1):
            # Extract the code block from the document's page_content.
            # Documents are structured as:
            #   PROMPT:\n...\nTOPIC:\n...\nMANIM CODE EXAMPLE:\n<code>
            content = doc.page_content
            if "MANIM CODE EXAMPLE:" in content:
                retrieved_code = content.split("MANIM CODE EXAMPLE:", 1)[1].strip()
            else:
                retrieved_code = content

            if _code_hash(retrieved_code) == gt_hash:
                first_hit_rank = rank
                break

        if first_hit_rank is not None:
            hits += 1
            recip_sum += 1.0 / first_hit_rank
            rank_hits[first_hit_rank - 1] += 1

        if idx % 10 == 0 or idx == total:
            print(f"  [retrieval] {idx}/{total} evaluated …", end="\r")

    print()

    return {
        "Recall@K":    hits / total,
        "MRR":         recip_sum / total,
        "Precision@1": rank_hits[0] / total,
        "rank_hits":   rank_hits,
        "total":       total,
        "hits":        hits,
    }


# ─────────────────────────────────────────────
# GENERATION METRICS
# ─────────────────────────────────────────────

def evaluate_generation(
    rag,
    eval_data: List[dict],
) -> Dict:
    """
    Evaluate end-to-end generation quality for each eval example.

    Metrics
    -------
    Success Rate   : Fraction of generations that pass all validators
                     (Python syntax + Manim structure + Manim semantics).
    Avg Attempts   : Mean number of generation attempts before the pipeline
                     returns a result.  Values close to 1.0 indicate the
                     repair loop rarely activates.
    Avg Quality    : Mean heuristic quality score (0–1) from
                     check_code_quality().  Note: this is a shallow keyword
                     heuristic and should be interpreted alongside AST
                     Similarity as a secondary signal only.
    AST Similarity : Mean Jaccard similarity between the generated code's
                     AST node-type set and the ground-truth code's AST
                     node-type set.  This is the primary generation quality
                     metric as it measures structural correctness independent
                     of surface-level token choices.
    """
    total          = len(eval_data)
    success_count  = 0
    total_attempts = 0
    total_quality  = 0.0
    total_ast_sim  = 0.0

    for idx, item in enumerate(eval_data, 1):
        result         = rag.generate(item["prompt"])
        generated_code = result["code"]
        ground_truth   = item.get("code", "")

        if result["success"]:
            success_count += 1

        total_attempts += result["attempts"]
        total_quality  += result.get("quality_score", 0.0)
        total_ast_sim  += ast_similarity(generated_code, ground_truth)

        print(
            f"  [generation] {idx}/{total}  "
            f"success={result['success']}  "
            f"attempts={result['attempts']}  "
            f"quality={result.get('quality_score', 0):.2f}  "
            f"ast_sim={ast_similarity(generated_code, ground_truth):.2f}",
            end="\r"
        )

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
) -> None:
    w = 62
    print("\n" + "=" * w)
    print("  RESEARCH EVALUATION RESULTS")
    print("=" * w)
    print(f"  Eval examples  : {eval_size}")
    print(f"  Top-K          : {top_k}")
    print(f"  Index size     : {474} unique documents (deduplicated train set)")
    print(f"  Retrieval mode : Exact code-hash ground-truth matching")
    print("-" * w)
    print("  RETRIEVAL  (ground-truth hash matching)")
    print(f"    Recall@{top_k}       : {retrieval['Recall@K']:.4f}")
    print(f"    MRR            : {retrieval['MRR']:.4f}")
    print(f"    Precision@1    : {retrieval['Precision@1']:.4f}")
    print(f"    Total hits     : {retrieval['hits']} / {retrieval['total']}")
    rh = retrieval["rank_hits"]
    for i, h in enumerate(rh, 1):
        pct = 100 * h / eval_size if eval_size > 0 else 0
        print(f"    Hits at rank {i}  : {h}  ({pct:.1f}%)")

    if generation:
        print("-" * w)
        print("  GENERATION")
        print(f"    Success Rate   : {generation['Success Rate']:.4f}")
        print(f"    Avg Attempts   : {generation['Avg Attempts']:.4f}")
        print(f"    Avg Quality*   : {generation['Avg Quality']:.4f}")
        print(f"    AST Similarity : {generation['AST Similarity']:.4f}")
        print()
        print("  * Avg Quality is a shallow keyword heuristic.")
        print("    AST Similarity is the primary generation quality signal.")

    print("=" * w)


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Evaluate the Manim RAG pipeline on the held-out eval split."
    )
    p.add_argument(
        "--quick", type=int, default=None, metavar="N",
        help="Restrict evaluation to the first N examples (smoke-test mode)."
    )
    p.add_argument(
        "--no-generation", action="store_true",
        help="Skip LLM generation phase; compute retrieval metrics only."
    )
    p.add_argument(
        "--top-k", type=int, default=TOP_K,
        help=f"Number of documents to retrieve per query (default: {TOP_K})."
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()

    # ── Load held-out eval split ──────────────────────────────────────
    print(f"[INFO] Loading eval split from {EVAL_SPLIT_PATH}")
    eval_data = load_eval_split(EVAL_SPLIT_PATH)
    print(f"[INFO] {len(eval_data)} held-out examples loaded (never indexed)")

    if args.quick:
        eval_data = eval_data[: args.quick]
        print(f"[INFO] Quick mode — restricting to first {len(eval_data)} examples")

    # ── Initialise RAG ────────────────────────────────────────────────
    print("[INFO] Initialising RAG system …")
    rag = ManimRAG()

    if args.top_k != TOP_K:
        rag.retriever = rag.vectorstore.as_retriever(
            search_type="similarity",
            search_kwargs={"k": args.top_k},
        )

    # ── Phase 1: Retrieval ────────────────────────────────────────────
    print(f"\n[PHASE 1] Retrieval evaluation (Recall@{args.top_k}, MRR) …")
    print(        "          Using exact ground-truth code-hash matching.\n")
    retrieval_metrics = compute_retrieval_metrics(
        rag, eval_data, top_k=args.top_k
    )

    # ── Phase 2: Generation (optional) ───────────────────────────────
    generation_metrics = None
    if not args.no_generation:
        print(f"\n[PHASE 2] Generation evaluation ({len(eval_data)} LLM calls) …")
        print(        "          Pass --no-generation to skip this phase.\n")
        generation_metrics = evaluate_generation(rag, eval_data)

    # ── Print results ─────────────────────────────────────────────────
    print_results(
        retrieval_metrics,
        generation_metrics,
        eval_size=len(eval_data),
        top_k=args.top_k,
    )


if __name__ == "__main__":
    main()