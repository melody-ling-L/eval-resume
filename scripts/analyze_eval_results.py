from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
METRICS = ["规则_反捏造", "语义_诚实度", "岗位_贴合度", "表达_专业度"]


def provider_label(result: dict) -> str:
    provider = result.get("provider")
    if isinstance(provider, dict):
        return provider.get("label") or provider.get("id") or "unknown"
    return str(provider or "unknown")


def short_provider(label: str) -> str:
    if "GPT" in label:
        return "GPT-5.4"
    if "Claude" in label:
        return "Claude Sonnet 4.6"
    if "Gemini" in label:
        return "Gemini 3 Flash Preview"
    return label


def load_results(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["results"]["results"]


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def pct(numerator: int, denominator: int) -> str:
    return f"{(numerator / denominator * 100):.1f}%" if denominator else "0.0%"


def summarize(results: list[dict], report_path: Path, rows_path: Path) -> None:
    flat_rows = []
    by_provider: dict[str, list[dict]] = defaultdict(list)
    by_category_provider: dict[tuple[str, str], list[dict]] = defaultdict(list)

    for result in results:
        metadata = result.get("metadata") or result.get("testCase", {}).get("metadata") or {}
        label = short_provider(provider_label(result))
        row = {
            "case_id": metadata.get("case_id", ""),
            "category": metadata.get("category", ""),
            "provider": label,
            "success": bool(result.get("success")),
            "score": float(result.get("score") or 0),
            "failure_reason": result.get("failureReason") or result.get("error") or "",
        }
        named = result.get("namedScores") or result.get("gradingResult", {}).get("namedScores") or {}
        for metric in METRICS:
            row[metric] = float(named.get(metric, 0))
        flat_rows.append(row)
        by_provider[label].append(row)
        by_category_provider[(row["category"], label)].append(row)

    rows_path.parent.mkdir(parents=True, exist_ok=True)
    with rows_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["case_id", "category", "provider", "success", "score", *METRICS, "failure_reason"],
        )
        writer.writeheader()
        writer.writerows(flat_rows)

    lines = [
        "# ResumeRewriteBench Eval Analysis",
        "",
        f"- Total result rows: {len(flat_rows)}",
        f"- Cases: {len({r['case_id'] for r in flat_rows})}",
        f"- Providers: {len(by_provider)}",
        "",
        "## Provider Summary",
        "",
        "| provider | rows | pass rate | avg score | 规则_反捏造 | 语义_诚实度 | 岗位_贴合度 | 表达_专业度 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for provider, rows in sorted(by_provider.items()):
        passed = sum(1 for r in rows if r["success"])
        lines.append(
            "| {provider} | {rows} | {pass_rate} | {score:.3f} | {rule:.3f} | {honesty:.3f} | {fit:.3f} | {pro:.3f} |".format(
                provider=provider,
                rows=len(rows),
                pass_rate=pct(passed, len(rows)),
                score=mean([r["score"] for r in rows]),
                rule=mean([r["规则_反捏造"] for r in rows]),
                honesty=mean([r["语义_诚实度"] for r in rows]),
                fit=mean([r["岗位_贴合度"] for r in rows]),
                pro=mean([r["表达_专业度"] for r in rows]),
            )
        )

    lines.extend(
        [
            "",
            "## Category Pass Rate",
            "",
            "| category | provider | rows | pass rate | avg score |",
            "|---|---|---:|---:|---:|",
        ]
    )
    for (category, provider), rows in sorted(by_category_provider.items()):
        passed = sum(1 for r in rows if r["success"])
        lines.append(
            f"| {category} | {provider} | {len(rows)} | {pct(passed, len(rows))} | {mean([r['score'] for r in rows]):.3f} |"
        )

    lines.extend(["", "## Initial Model Difference Read", ""])
    provider_rows = {provider: rows for provider, rows in by_provider.items()}
    if provider_rows:
        ranked_honesty = sorted(
            ((provider, mean([r["语义_诚实度"] for r in rows])) for provider, rows in provider_rows.items()),
            key=lambda item: item[1],
            reverse=True,
        )
        ranked_fit = sorted(
            ((provider, mean([r["岗位_贴合度"] for r in rows])) for provider, rows in provider_rows.items()),
            key=lambda item: item[1],
            reverse=True,
        )
        lines.append(
            "- Honesty ranking: "
            + " > ".join(f"{provider} ({score:.3f})" for provider, score in ranked_honesty)
        )
        lines.append(
            "- JD-fit ranking: " + " > ".join(f"{provider} ({score:.3f})" for provider, score in ranked_fit)
        )
        lines.append(
            "- Interpretation: compare honesty against JD-fit. A model with lower honesty but higher fit is behaving more aggressively."
        )

    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {report_path}")
    print(f"Wrote {rows_path}")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: analyze_eval_results.py <promptfoo-output.json> [report.md] [rows.csv]", file=sys.stderr)
        return 2
    input_path = Path(argv[1])
    stem = input_path.stem
    report_path = Path(argv[2]) if len(argv) > 2 else ROOT / "reports" / f"{stem}_analysis.md"
    rows_path = Path(argv[3]) if len(argv) > 3 else ROOT / "reports" / f"{stem}_rows.csv"
    summarize(load_results(input_path), report_path, rows_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
