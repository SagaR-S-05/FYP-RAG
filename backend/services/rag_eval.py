"""
=============================================================================
rag_eval.py  —  Manim RAG  :  Comprehensive Research Evaluation Suite
=============================================================================

Produces publication-ready metrics across four evaluation dimensions:

  PHASE 1 — RETRIEVAL QUALITY
      Recall@K, MRR, Precision@{1,2,3} using ground-truth code-hash
      matching (standard BEIR / MS-MARCO definition).

  PHASE 2 — RAG GENERATION QUALITY
      BLEU-4, CodeBLEU, AST Similarity (Jaccard), Cyclomatic Complexity
      Delta, Manim Animation API Coverage, Manim Mobject API Coverage,
      Syntax Validity Rate, Avg Repair Attempts.

  PHASE 3 — BASELINE COMPARISON  (plain LLM, no retrieval)
      Same metrics as Phase 2 but with retrieval disabled.
      The delta quantifies the contribution of RAG over a vanilla LLM —
      the core empirical claim of any RAG research paper.

  PHASE 4 — ABLATION STUDY
      Recall@K curve for K ∈ {1, 3, 5} to justify the chosen TOP_K.

  OUTPUT FILES  (saved to --output-dir, default: FYP-RAG/eval_results/)
      eval_<timestamp>.json   machine-readable full report
      eval_<timestamp>.csv    RAG vs baseline comparison table

Usage
-----
    python rag_eval.py                          # full evaluation
    python rag_eval.py --quick 20               # smoke-test (20 examples)
    python rag_eval.py --no-baseline            # skip baseline phase
    python rag_eval.py --no-ablation            # skip ablation phase
    python rag_eval.py --retrieval-only         # retrieval metrics only
    python rag_eval.py --output-dir ./results   # custom output directory

Metric Definitions
------------------
BLEU-4
    Bilingual Evaluation Understudy (Papineni et al., 2002).
    4-gram overlap between generated and reference code, with brevity
    penalty and add-1 smoothing.  Range [0,1]; higher is better.

CodeBLEU
    Wei et al. (2020). arXiv:2009.10297.
    Composite: 0.25·BLEU + 0.25·token_match + 0.50·ast_subtree_match.
    Weights emphasise structural correctness for code.  Range [0,1].

AST Similarity
    Jaccard similarity over AST node-type sets (Jiang et al., 2007).
    Structural equivalence measure independent of token choice.

Cyclomatic Complexity Delta
    |CC(generated) - CC(reference)| where CC = McCabe complexity.
    Measures structural proportionality.  Lower (→ 0) is better.

Recall@K / MRR
    Standard IR metrics using exact ground-truth code-hash matching.
    A hit occurs only when the retrieved document contains the exact
    reference code.  Embedding-similarity proxies are NOT used.
=============================================================================
"""

from __future__ import annotations

import sys
import json
import ast
import csv
import argparse
import hashlib
import textwrap
import datetime
from pathlib import Path
from typing import List, Dict, Optional
from collections import Counter

import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# PATH SETUP
# ─────────────────────────────────────────────────────────────────────────────

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
    LLM_MODEL,
    GENERATION_PROMPT,
    SYSTEM_RULES,
    extract_code,
)
from langchain_ollama import OllamaLLM


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

ABLATION_K_VALUES  = [1, 3, 5]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "eval_results"
_TS                = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")


# =============================================================================
# METRIC IMPLEMENTATIONS
# =============================================================================

def _code_hash(code: str) -> str:
    return hashlib.md5(code.strip().encode()).hexdigest()


def _tokenize(code: str) -> List[str]:
    import re
    return re.findall(r"[A-Za-z_]\w*|[0-9]+|[^\s\w]", code)


# ─────────────────────────────────────────────
# BLEU-4
# ─────────────────────────────────────────────

def bleu_4(hypothesis: str, reference: str) -> float:
    """
    Sentence-level BLEU-4 with add-1 (Laplace) smoothing and brevity penalty.
    Reference: Papineni et al. (2002), ACL.
    """
    hyp = _tokenize(hypothesis)
    ref = _tokenize(reference)
    if not hyp or not ref:
        return 0.0

    precisions = []
    for n in range(1, 5):
        hyp_ng = Counter(tuple(hyp[i:i+n]) for i in range(len(hyp)-n+1))
        ref_ng = Counter(tuple(ref[i:i+n]) for i in range(len(ref)-n+1))
        matches = sum(min(c, ref_ng[g]) for g, c in hyp_ng.items())
        total   = max(1, sum(hyp_ng.values()))
        precisions.append((matches + 1) / (total + 1))   # add-1 smoothing

    bp    = min(1.0, float(np.exp(1 - len(ref) / max(1, len(hyp)))))
    score = bp * float(np.exp(np.mean(np.log(precisions))))
    return float(np.clip(score, 0.0, 1.0))


# ─────────────────────────────────────────────
# AST SIMILARITY  (Jaccard over node-type sets)
# ─────────────────────────────────────────────

def ast_similarity(code1: str, code2: str) -> float:
    """
    Jaccard similarity over the set of AST node types.
    Reference: Deckard clone detection (Jiang et al., 2007).
    """
    try:
        t1 = ast.parse(code1)
        t2 = ast.parse(code2)
    except SyntaxError:
        return 0.0
    s1 = {type(n).__name__ for n in ast.walk(t1)}
    s2 = {type(n).__name__ for n in ast.walk(t2)}
    u  = s1 | s2
    return len(s1 & s2) / len(u) if u else 0.0


# ─────────────────────────────────────────────
# CODEBLEU
# ─────────────────────────────────────────────

def _ast_ngrams(code: str, n: int = 2) -> Counter:
    try:
        nodes = [type(nd).__name__ for nd in ast.walk(ast.parse(code))]
    except SyntaxError:
        return Counter()
    return Counter(tuple(nodes[i:i+n]) for i in range(len(nodes)-n+1))


def _token_match(hyp: str, ref: str) -> float:
    h = Counter(_tokenize(hyp))
    r = Counter(_tokenize(ref))
    if not h:
        return 0.0
    return sum(min(c, r[t]) for t, c in h.items()) / max(1, sum(h.values()))


def _ast_match(hyp: str, ref: str) -> float:
    h = _ast_ngrams(hyp)
    r = _ast_ngrams(ref)
    if not h:
        return 0.0
    return sum(min(c, r[g]) for g, c in h.items()) / max(1, sum(h.values()))


def code_bleu(hypothesis: str, reference: str) -> float:
    """
    CodeBLEU = 0.25*BLEU + 0.25*token_match + 0.50*ast_subtree_match.
    Reference: Wei et al. (2020), arXiv:2009.10297.
    """
    return (
        0.25 * bleu_4(hypothesis, reference)
        + 0.25 * _token_match(hypothesis, reference)
        + 0.50 * _ast_match(hypothesis, reference)
    )


# ─────────────────────────────────────────────
# CYCLOMATIC COMPLEXITY
# ─────────────────────────────────────────────

def cyclomatic_complexity(code: str) -> int:
    """
    McCabe cyclomatic complexity.
    Reference: McCabe (1976), IEEE TSE 2(4).
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return 0
    _DECISION = (ast.If, ast.For, ast.While, ast.ExceptHandler,
                 ast.With, ast.Assert, ast.comprehension)
    cc = 1
    for node in ast.walk(tree):
        if isinstance(node, _DECISION):
            cc += 1
        if isinstance(node, ast.BoolOp):
            cc += len(node.values) - 1
    return cc


def complexity_delta(gen: str, ref: str) -> float:
    return float(abs(cyclomatic_complexity(gen) - cyclomatic_complexity(ref)))


# ─────────────────────────────────────────────
# MANIM API COVERAGE
# ─────────────────────────────────────────────

_ANIMATIONS = [
    "Create", "Write", "FadeIn", "FadeOut", "Transform",
    "ReplacementTransform", "MoveAlongPath", "LaggedStart",
    "DrawBorderThenFill", "GrowFromCenter", "Rotate", "Indicate",
]
_MOBJECTS = [
    "Circle", "Square", "Rectangle", "Triangle", "Line", "Arrow",
    "Dot", "Text", "MathTex", "Tex", "VGroup", "Axes", "NumberPlane",
]


def manim_api_coverage(gen: str, ref: str) -> Dict[str, float]:
    """
    Fraction of Manim API calls present in the reference that also
    appear in the generated code.  Separate scores for animations and
    mobjects, the two primary API surface areas in Manim CE.
    """
    def _cov(gen, ref, api_list):
        used = [a for a in api_list if a in ref]
        if not used:
            return 1.0
        return len([a for a in used if a in gen]) / len(used)

    return {
        "animation_coverage": _cov(gen, ref, _ANIMATIONS),
        "mobject_coverage":   _cov(gen, ref, _MOBJECTS),
    }


# =============================================================================
# EVALUATION PHASES
# =============================================================================

def _mean(lst): return float(np.mean(lst)) if lst else 0.0
def _std(lst):  return float(np.std(lst))  if lst else 0.0


# ─────────────────────────────────────────────
# PHASE 1 — RETRIEVAL
# ─────────────────────────────────────────────

def evaluate_retrieval(rag, eval_data: List[dict], top_k: int) -> Dict:
    """
    Recall@K, MRR, Precision@{1,2,3} via ground-truth code-hash matching.

    A hit occurs at rank R iff the document at rank R contains code whose
    MD5 hash equals the ground-truth hash.  Embedding-similarity proxies
    are intentionally avoided — they inflate scores by treating topically
    similar (but incorrect) documents as hits.

    Because the eval split contains code groups entirely absent from the
    FAISS index (by construction), a perfect score is impossible and scores
    reflect genuine cross-topic generalisation.
    """
    hits = 0
    recip_sum = 0.0
    rank_hits = [0] * top_k
    total = len(eval_data)

    for idx, item in enumerate(eval_data, 1):
        gt_hash = _code_hash(item.get("code", ""))
        docs    = rag.retriever.invoke(normalize_prompt(item["prompt"]))

        first_hit: Optional[int] = None
        for rank, doc in enumerate(docs, start=1):
            content = doc.page_content
            retrieved_code = (
                content.split("MANIM CODE EXAMPLE:", 1)[1].strip()
                if "MANIM CODE EXAMPLE:" in content else content
            )
            if _code_hash(retrieved_code) == gt_hash:
                first_hit = rank
                break

        if first_hit is not None:
            hits += 1
            recip_sum += 1.0 / first_hit
            rank_hits[first_hit - 1] += 1

        if idx % 5 == 0 or idx == total:
            print(f"  [retrieval] {idx}/{total}", end="\r")
    print()

    result = {
        f"Recall@{top_k}": hits / total,
        "MRR":              recip_sum / total,
        "hits":             hits,
        "total":            total,
        "rank_hits":        rank_hits,
    }
    for i in range(min(3, top_k)):
        result[f"Precision@{i+1}"] = rank_hits[i] / total
    return result


# ─────────────────────────────────────────────
# PHASE 2 — RAG GENERATION
# ─────────────────────────────────────────────

def evaluate_generation(rag, eval_data: List[dict], label: str = "RAG") -> Dict:
    """
    Full generation quality evaluation against ground-truth code.
    Computes BLEU-4, CodeBLEU, AST Similarity, CC Delta, API Coverage,
    Syntax Validity Rate, and Avg Repair Attempts.
    """
    total = len(eval_data)
    syntax_valid = 0
    bleu, cb, asim, ccd, anim, mob, attempts = [], [], [], [], [], [], []

    for idx, item in enumerate(eval_data, 1):
        result = rag.generate(item["prompt"])
        gen    = result["code"]
        ref    = item.get("code", "")

        try:
            ast.parse(gen)
            syntax_valid += 1
            valid = True
        except SyntaxError:
            valid = False

        b4  = bleu_4(gen, ref)              if valid else 0.0
        c   = code_bleu(gen, ref)           if valid else 0.0
        a   = ast_similarity(gen, ref)      if valid else 0.0
        cc  = complexity_delta(gen, ref)    if valid else 10.0
        cov = manim_api_coverage(gen, ref)  if valid else \
              {"animation_coverage": 0.0, "mobject_coverage": 0.0}

        bleu.append(b4);  cb.append(c);   asim.append(a)
        ccd.append(cc);   anim.append(cov["animation_coverage"])
        mob.append(cov["mobject_coverage"])
        attempts.append(result["attempts"])

        print(
            f"  [{label}] {idx}/{total}  "
            f"bleu={b4:.3f}  codebleu={c:.3f}  ast={a:.3f}  "
            f"cc_delta={cc:.1f}  attempts={result['attempts']}",
            end="\r"
        )
    print()

    return {
        "Syntax Validity Rate":        syntax_valid / total,
        "BLEU-4":                      _mean(bleu),
        "BLEU-4 (std)":                _std(bleu),
        "CodeBLEU":                    _mean(cb),
        "CodeBLEU (std)":              _std(cb),
        "AST Similarity":              _mean(asim),
        "AST Similarity (std)":        _std(asim),
        "Cyclomatic Complexity Delta":  _mean(ccd),
        "CC Delta (std)":              _std(ccd),
        "Animation API Coverage":      _mean(anim),
        "Mobject API Coverage":        _mean(mob),
        "Avg Repair Attempts":         _mean(attempts),
        "n":                           total,
    }


# ─────────────────────────────────────────────
# PHASE 3 — BASELINE  (plain LLM, no retrieval)
# ─────────────────────────────────────────────

def evaluate_baseline(eval_data: List[dict]) -> Dict:
    """
    Plain LLM evaluation — same model and system prompt as the RAG
    pipeline, but the REFERENCES field is replaced with a stub string
    so the model receives no retrieved examples.

    The performance delta (RAG - baseline) across CodeBLEU, AST
    Similarity, and API Coverage isolates the contribution of retrieval
    augmentation.  This is the core empirical comparison required by
    research publications.
    """
    llm   = OllamaLLM(model=LLM_MODEL, temperature=0.2)
    chain = GENERATION_PROMPT | llm
    total = len(eval_data)

    syntax_valid = 0
    bleu, cb, asim, ccd, anim, mob = [], [], [], [], [], []

    for idx, item in enumerate(eval_data, 1):
        raw = chain.invoke({
            "question":     item["prompt"],
            "references":   "[No reference examples — baseline evaluation]",
            "error":        "None",
            "system_rules": SYSTEM_RULES,
        })
        gen = extract_code(raw)
        ref = item.get("code", "")

        try:
            ast.parse(gen)
            syntax_valid += 1
            valid = True
        except SyntaxError:
            valid = False

        b4  = bleu_4(gen, ref)              if valid else 0.0
        c   = code_bleu(gen, ref)           if valid else 0.0
        a   = ast_similarity(gen, ref)      if valid else 0.0
        cc  = complexity_delta(gen, ref)    if valid else 10.0
        cov = manim_api_coverage(gen, ref)  if valid else \
              {"animation_coverage": 0.0, "mobject_coverage": 0.0}

        bleu.append(b4);  cb.append(c);   asim.append(a)
        ccd.append(cc);   anim.append(cov["animation_coverage"])
        mob.append(cov["mobject_coverage"])

        print(
            f"  [baseline] {idx}/{total}  "
            f"bleu={b4:.3f}  codebleu={c:.3f}  ast={a:.3f}",
            end="\r"
        )
    print()

    return {
        "Syntax Validity Rate":        syntax_valid / total,
        "BLEU-4":                      _mean(bleu),
        "BLEU-4 (std)":                _std(bleu),
        "CodeBLEU":                    _mean(cb),
        "CodeBLEU (std)":              _std(cb),
        "AST Similarity":              _mean(asim),
        "AST Similarity (std)":        _std(asim),
        "Cyclomatic Complexity Delta":  _mean(ccd),
        "CC Delta (std)":              _std(ccd),
        "Animation API Coverage":      _mean(anim),
        "Mobject API Coverage":        _mean(mob),
        "Avg Repair Attempts":         1.0,
        "n":                           total,
    }


# ─────────────────────────────────────────────
# PHASE 4 — ABLATION  (TOP_K sensitivity)
# ─────────────────────────────────────────────

def evaluate_retrieval_ablation(
    rag, eval_data: List[dict], k_values: List[int] = ABLATION_K_VALUES
) -> Dict[int, Dict]:
    """
    Recall@K curve across multiple K values.  Standard in IR papers to
    justify the choice of retrieval depth and demonstrate diminishing
    returns beyond the chosen K.
    """
    results = {}
    for k in k_values:
        print(f"  [ablation] K={k} …")
        rag.retriever = rag.vectorstore.as_retriever(
            search_type="similarity", search_kwargs={"k": k}
        )
        results[k] = evaluate_retrieval(rag, eval_data, top_k=k)

    # Restore default retriever
    rag.retriever = rag.vectorstore.as_retriever(
        search_type="similarity", search_kwargs={"k": TOP_K}
    )
    return results


# =============================================================================
# REPORTING
# =============================================================================

def print_report(
    retrieval:      Optional[Dict],
    rag_gen:        Optional[Dict],
    baseline:       Optional[Dict],
    ablation:       Optional[Dict],
    eval_size:      int,
    top_k:          int,
) -> None:

    W = 72

    def sep(char="="):  return char * W
    def row(label, *vals):
        label_str = f"  {label:<38}"
        val_strs  = "".join(f"{v:>10}" for v in vals)
        print(label_str + val_strs)

    print("\n" + sep())
    print("  MANIM RAG — RESEARCH EVALUATION REPORT")
    print(f"  Timestamp  : {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Eval set   : {eval_size} held-out examples  |  Model: {LLM_MODEL}")
    print(f"  Embedder   : {EMBEDDING_MODEL}  |  TOP_K: {top_k}")
    print(sep())

    # ── Section 1: Retrieval ─────────────────────────────────────────
    if retrieval:
        print(f"\n  {'[ SECTION 1 ]  RETRIEVAL QUALITY':}")
        print(sep("-"))
        row(f"Recall@{top_k}",    f"{retrieval[f'Recall@{top_k}']:.4f}")
        row("MRR",                f"{retrieval['MRR']:.4f}")
        for k in range(1, min(4, top_k+1)):
            key = f"Precision@{k}"
            if key in retrieval:
                row(key, f"{retrieval[key]:.4f}")
        row(f"Total hits / queries",
            f"{retrieval['hits']} / {retrieval['total']}")
        rh = retrieval.get("rank_hits", [])
        for i, h in enumerate(rh, 1):
            row(f"  Hits at rank {i}",
                f"{h}  ({100*h/eval_size:.1f}%)")

    # ── Section 2: RAG Generation ────────────────────────────────────
    if rag_gen:
        print(f"\n  {'[ SECTION 2 ]  GENERATION QUALITY  —  RAG Pipeline':}")
        print(sep("-"))
        print(f"  {'Metric':<38} {'Mean':>10}  {'Std':>8}")
        print(sep("-"))
        gen_rows = [
            ("Syntax Validity Rate",        "Syntax Validity Rate",       None),
            ("BLEU-4",                       "BLEU-4",                     "BLEU-4 (std)"),
            ("CodeBLEU",                     "CodeBLEU",                   "CodeBLEU (std)"),
            ("AST Similarity",               "AST Similarity",             "AST Similarity (std)"),
            ("Cyclomatic Complexity Delta",  "Cyclomatic Complexity Delta","CC Delta (std)"),
            ("Animation API Coverage",       "Animation API Coverage",     None),
            ("Mobject API Coverage",         "Mobject API Coverage",       None),
            ("Avg Repair Attempts",          "Avg Repair Attempts",        None),
        ]
        for label, mk, sk in gen_rows:
            mv  = rag_gen.get(mk, 0.0)
            sv  = rag_gen.get(sk, None) if sk else None
            ss  = f"{sv:>8.4f}" if sv is not None else "        "
            print(f"  {label:<38} {mv:>10.4f}  {ss}")

    # ── Section 3: RAG vs Baseline ───────────────────────────────────
    if rag_gen and baseline:
        print(f"\n  {'[ SECTION 3 ]  BASELINE COMPARISON  —  RAG vs Plain LLM':}")
        print(sep("-"))
        print(f"  {'Metric':<38} {'RAG':>8}  {'Base':>8}  {'Δ':>8}  {'':>2}")
        print(sep("-"))
        cmp_keys = [
            ("Syntax Validity Rate",        False),
            ("BLEU-4",                       False),
            ("CodeBLEU",                     False),
            ("AST Similarity",               False),
            ("Cyclomatic Complexity Delta",  True),   # lower is better
            ("Animation API Coverage",       False),
            ("Mobject API Coverage",         False),
        ]
        for key, lower_better in cmp_keys:
            rv = rag_gen.get(key, 0.0)
            bv = baseline.get(key, 0.0)
            d  = rv - bv
            if lower_better:
                arrow = "▲ better" if d < 0 else ("▼ worse " if d > 0 else "  –     ")
            else:
                arrow = "▲ better" if d > 0 else ("▼ worse " if d < 0 else "  –     ")
            print(f"  {key:<38} {rv:>8.4f}  {bv:>8.4f}  {d:>+8.4f}  {arrow}")

    # ── Section 4: Ablation ──────────────────────────────────────────
    if ablation:
        print(f"\n  {'[ SECTION 4 ]  ABLATION  —  Retrieval Depth (TOP_K)':}")
        print(sep("-"))
        print(f"  {'K':<6} {'Recall@K':>10}  {'MRR':>10}  {'P@1':>10}")
        print(sep("-"))
        for k, m in sorted(ablation.items()):
            print(
                f"  {k:<6} {m.get(f'Recall@{k}', 0.0):>10.4f}  "
                f"{m.get('MRR', 0.0):>10.4f}  "
                f"{m.get('Precision@1', 0.0):>10.4f}"
            )

    print("\n" + sep())
    print("  ▲ better = RAG improves over baseline   ▼ worse = baseline leads")
    print("  Primary signals: CodeBLEU, AST Similarity, Animation API Coverage")
    print("  BLEU-4 included for cross-paper comparability only.")
    print(sep() + "\n")


# ─────────────────────────────────────────────
# SAVE JSON + CSV
# ─────────────────────────────────────────────

def save_outputs(
    output_dir: Path,
    retrieval:  Optional[Dict],
    rag_gen:    Optional[Dict],
    baseline:   Optional[Dict],
    ablation:   Optional[Dict],
    eval_size:  int,
    top_k:      int,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    report = {
        "metadata": {
            "timestamp":       _TS,
            "eval_size":       eval_size,
            "top_k":           top_k,
            "model":           LLM_MODEL,
            "embedding_model": EMBEDDING_MODEL,
        },
        "retrieval":  retrieval,
        "rag_gen":    rag_gen,
        "baseline":   baseline,
        "ablation":   {str(k): v for k, v in ablation.items()} if ablation else None,
    }

    json_path = output_dir / f"eval_{_TS}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"[INFO] JSON saved → {json_path}")

    csv_path = output_dir / f"eval_{_TS}.csv"
    cmp_keys = [
        "Syntax Validity Rate", "BLEU-4", "CodeBLEU",
        "AST Similarity", "Cyclomatic Complexity Delta",
        "Animation API Coverage", "Mobject API Coverage",
    ]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Metric", "RAG", "Baseline", "Delta"])
        for key in cmp_keys:
            rv = rag_gen.get(key, "") if rag_gen else ""
            bv = baseline.get(key, "") if baseline else ""
            dv = (rv - bv) if isinstance(rv, float) and isinstance(bv, float) else ""
            w.writerow([key, rv, bv, dv])
    print(f"[INFO] CSV  saved → {csv_path}")


# =============================================================================
# CLI
# =============================================================================

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Manim RAG — Comprehensive Research Evaluation Suite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""
            Examples
            --------
            Full run:
              python rag_eval.py

            Quick smoke-test (20 examples, skip baseline):
              python rag_eval.py --quick 20 --no-baseline

            Retrieval only (no LLM calls):
              python rag_eval.py --retrieval-only
        """)
    )
    p.add_argument("--quick",          type=int,  default=None, metavar="N")
    p.add_argument("--retrieval-only", action="store_true")
    p.add_argument("--no-baseline",    action="store_true")
    p.add_argument("--no-ablation",    action="store_true")
    p.add_argument("--top-k",          type=int,  default=TOP_K)
    p.add_argument("--output-dir",     type=Path, default=DEFAULT_OUTPUT_DIR)
    p.add_argument("--no-save",        action="store_true")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    print(f"[INFO] Loading eval split: {EVAL_SPLIT_PATH}")
    eval_data = load_eval_split(EVAL_SPLIT_PATH)
    print(f"[INFO] {len(eval_data)} held-out examples loaded")

    if args.quick:
        eval_data = eval_data[:args.quick]
        print(f"[INFO] Quick mode — {len(eval_data)} examples")

    print("[INFO] Initialising RAG …")
    rag = ManimRAG()
    if args.top_k != TOP_K:
        rag.retriever = rag.vectorstore.as_retriever(
            search_type="similarity", search_kwargs={"k": args.top_k}
        )

    retrieval_m = rag_gen_m = baseline_m = ablation_m = None

    # Phase 1
    print(f"\n{'='*60}\n  PHASE 1 / 4  —  Retrieval  (Recall@{args.top_k}, MRR)\n{'='*60}")
    retrieval_m = evaluate_retrieval(rag, eval_data, top_k=args.top_k)

    if not args.retrieval_only:

        # Phase 2
        print(f"\n{'='*60}\n  PHASE 2 / 4  —  RAG Generation  ({len(eval_data)} LLM calls)\n{'='*60}")
        rag_gen_m = evaluate_generation(rag, eval_data, label="RAG")

        # Phase 3
        if not args.no_baseline:
            print(f"\n{'='*60}\n  PHASE 3 / 4  —  Baseline LLM  ({len(eval_data)} LLM calls)\n{'='*60}")
            baseline_m = evaluate_baseline(eval_data)
        else:
            print("\n[INFO] Baseline phase skipped (--no-baseline)")

        # Phase 4
        if not args.no_ablation:
            print(f"\n{'='*60}\n  PHASE 4 / 4  —  Ablation  (K ∈ {ABLATION_K_VALUES})\n{'='*60}")
            ablation_m = evaluate_retrieval_ablation(rag, eval_data)
        else:
            print("\n[INFO] Ablation phase skipped (--no-ablation)")

    print_report(retrieval_m, rag_gen_m, baseline_m, ablation_m,
                 len(eval_data), args.top_k)

    if not args.no_save and not args.retrieval_only:
        save_outputs(args.output_dir, retrieval_m, rag_gen_m,
                     baseline_m, ablation_m, len(eval_data), args.top_k)


if __name__ == "__main__":
    main()