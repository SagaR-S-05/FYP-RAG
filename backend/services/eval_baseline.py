import json
import time
from collections import Counter

from manim_rag_langgraph import ManimRAG, validate_code


EVAL_PROMPTS_PATH = "eval_prompts.json"
OUTPUT_REPORT_PATH = "baseline_report.json"


def load_prompts(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    rag = ManimRAG()
    prompts = load_prompts(EVAL_PROMPTS_PATH)

    results = []
    stats = Counter()

    print(f"Running baseline evaluation on {len(prompts)} prompts...\n")

    for i, prompt in enumerate(prompts, start=1):
        print(f"[{i}/{len(prompts)}] Evaluating prompt:")
        print(f"  → {prompt}")

        start = time.time()

        try:
            code = rag.generate(prompt)
            valid, error_type, error = validate_code(code)

            elapsed = time.time() - start

            results.append({
                "prompt": prompt,
                "status": "PASS",
                "error": None,
                "time_sec": round(elapsed, 2)
            })

            stats["pass"] += 1
            print("  ✅ PASS\n")


        except Exception as e:
            elapsed = time.time() - start

            results.append({
                "prompt": prompt,
                "status": "FAIL",
                "error": str(e),
                "time_sec": round(elapsed, 2)
            })

            stats["fail"] += 1
            print(f"  ❌ FAIL → {e}\n")

    total = stats["pass"] + stats["fail"]
    accuracy = (stats["pass"] / total) * 100 if total else 0

    summary = {
        "total_prompts": total,
        "passed": stats["pass"],
        "failed": stats["fail"],
        "baseline_accuracy_percent": round(accuracy, 2)
    }

    report = {
        "summary": summary,
        "details": results
    }

    with open(OUTPUT_REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("=" * 50)
    print("BASELINE EVALUATION COMPLETE")
    print(f"Accuracy: {summary['baseline_accuracy_percent']}%")
    print(f"Report saved to: {OUTPUT_REPORT_PATH}")
    print("=" * 50)


if __name__ == "__main__":
    main()
