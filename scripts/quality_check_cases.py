from __future__ import annotations

import csv
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = ROOT / "data" / "cases.csv"
REPORT_PATH = ROOT / "reports" / "data_quality_report.md"

PII_PATTERNS = {
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "cn_mobile": re.compile(r"(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)"),
    "long_digit": re.compile(r"(?<!\d)\d{10,}(?!\d)"),
    "known_names": re.compile(
        r"贺常志|He Changzhi|刘楚焕|Lucky|丁屹涵|巩山虹|樊瑞琪|洪永昊|洪赫|王旭|修丹阳|陈召基|陈宇锐|黄天立|黎前|大春"
    ),
    "known_address": re.compile(r"天誉花园|林和中路"),
}


def load_text(ref: str) -> str:
    if not ref.startswith("file://"):
        raise ValueError(f"Expected file:// reference, got {ref}")
    path = ROOT / ref.removeprefix("file://")
    return path.read_text(encoding="utf-8")


def private_chars(text: str) -> list[str]:
    chars = sorted({ch for ch in text if 0xE000 <= ord(ch) <= 0xF8FF or ch == "\ufffd"})
    return [f"U+{ord(ch):04X}" for ch in chars]


def terms_present(terms: str, text: str) -> list[str]:
    lower = text.lower()
    return [term for term in (t.strip() for t in terms.split(",")) if term and term.lower() in lower]


def pii_hits(text: str) -> list[str]:
    hits = []
    for name, pattern in PII_PATTERNS.items():
        if pattern.search(text):
            hits.append(name)
    return hits


def quality_status(resume: str, jd: str) -> tuple[str, list[str]]:
    notes = []
    compact_resume = re.sub(r"\s+", "", resume)
    compact_jd = re.sub(r"\s+", "", jd)
    if len(compact_resume) < 250:
        notes.append("resume_too_short")
    if len(compact_jd) < 180:
        notes.append("jd_too_short")
    if len(set(compact_resume)) < 35:
        notes.append("low_character_variety")
    if private_chars(resume):
        notes.append("private_use_chars")
    if "�" in resume:
        notes.append("replacement_char")
    return ("PASS" if not notes else "WARN", notes)


def main() -> int:
    rows = list(csv.DictReader(CASES_PATH.open(encoding="utf-8")))
    failures: list[str] = []
    report_rows: list[dict[str, str]] = []

    if len(rows) != 20:
        failures.append(f"Expected 20 cases, found {len(rows)}")

    for row in rows:
        case_id = row["__metadata:case_id"]
        resume = load_text(row["resume"])
        jd = load_text(row["jd"])
        pii = pii_hits(resume)
        privacy = row.get("__metadata:privacy", "")
        hard_pii = pii if privacy != "synthetic" else []
        forbidden_hits = terms_present(row["forbidden_terms"], resume)
        priv = private_chars(resume)
        status, notes = quality_status(resume, jd)

        if hard_pii:
            failures.append(f"{case_id}: PII hit(s): {', '.join(hard_pii)}")
        if forbidden_hits:
            failures.append(f"{case_id}: forbidden_terms already in resume: {', '.join(forbidden_hits)}")
        if priv:
            failures.append(f"{case_id}: private-use chars remain: {', '.join(priv)}")

        report_rows.append(
            {
                "case_id": case_id,
                "category": row["__metadata:category"],
                "status": "FAIL" if hard_pii or forbidden_hits or priv else status,
                "resume_chars": str(len(resume)),
                "jd_chars": str(len(jd)),
                "pii": ", ".join(pii) or "-",
                "forbidden_in_resume": ", ".join(forbidden_hits) or "-",
                "notes": ", ".join(notes) or "-",
            }
        )

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Step 8 Data Quality Report",
        "",
        f"- Cases: {len(rows)}",
        f"- Hard failures: {len(failures)}",
        "",
        "| case | category | status | resume chars | JD chars | PII | forbidden in resume | notes |",
        "|---|---|---:|---:|---:|---|---|---|",
    ]
    for row in report_rows:
        lines.append(
            "| {case_id} | {category} | {status} | {resume_chars} | {jd_chars} | {pii} | {forbidden_in_resume} | {notes} |".format(
                **row
            )
        )
    if failures:
        lines.extend(["", "## Failures", ""])
        lines.extend(f"- {failure}" for failure in failures)
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Wrote {REPORT_PATH}")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
