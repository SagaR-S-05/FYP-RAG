import json
from collections import Counter, defaultdict

REPORT_PATH = "baseline_report.json"


def categorize_failure(error_msg: str) -> str:
    msg = error_msg.lower()

    if "structural" in msg:
        return "STRUCTURAL"
    if "syntax" in msg:
        return "SYNTAX"
    if "semantic" in msg:
        return "SEMANTIC_MANIM"
    if "attempts" in msg:
        return "COMPLEXITY"

    return "OUT_OF_SCOPE"


def main():
    with open(REPORT_PATH, "r", encoding="utf-8") as f:
        report = json.load(f)

    failures = [r for r in report["details"] if r["status"] == "FAIL"]

    category_counts = Counter()
    category_examples = defaultdict(list)

    for f in failures:
        category = categorize_failure(f["error"])
        category_counts[category] += 1
        category_examples[category].append(f["prompt"])

    print("\n📉 FAILURE BREAKDOWN\n")

    total_failures = sum(category_counts.values())
    for cat, count in category_counts.most_common():
        percent = (count / total_failures) * 100 if total_failures else 0
        print(f"{cat:20s}: {count} ({percent:.1f}%)")

    print("\n📌 SAMPLE FAILURES PER CATEGORY\n")
    for cat, prompts in category_examples.items():
        print(f"\n--- {cat} ---")
        for p in prompts[:3]:
            print(f"- {p}")

    # Save structured failure report
    with open("failure_analysis.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "summary": dict(category_counts),
                "examples": dict(category_examples),
            },
            f,
            indent=2
        )

    print("\n✅ failure_analysis.json saved")


if __name__ == "__main__":
    main()
