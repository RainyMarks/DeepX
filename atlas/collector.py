from __future__ import annotations

import json
import os
from pathlib import Path

from atlas.models import utc_now
from atlas.sources import ArxivSource, CrossrefSource, DblpSource, OpenAlexSource, SemanticScholarSource
from atlas.sources.openalex import DEFAULT_QUERIES


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"


def collect_openalex(max_records: int = 3200) -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    source = OpenAlexSource(api_key=os.getenv("OPENALEX_API_KEY", ""), mailto=os.getenv("CROSSREF_MAILTO", ""))
    per_query = max(50, (max_records + len(DEFAULT_QUERIES) - 1) // len(DEFAULT_QUERIES))
    records: dict[str, dict] = {}
    query_hits: dict[str, int] = {}
    retrieved_at = utc_now()
    for query in DEFAULT_QUERIES:
        count = 0
        for row in source.iter_search(query, per_query):
            source_id = str(row.get("id") or row.get("doi") or row.get("title"))
            if source_id not in records:
                records[source_id] = {"query": query, "retrieved_at": retrieved_at, "record": row}
            count += 1
        query_hits[query] = count
        if len(records) >= max_records:
            break
    ordered = list(records.values())[:max_records]
    temp = RAW_DIR / "openalex_candidates.jsonl.tmp"
    temp.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in ordered), encoding="utf-8")
    temp.replace(RAW_DIR / "openalex_candidates.jsonl")

    institution_ids = sorted({
        str(inst.get("id"))
        for item in ordered
        for authorship in item["record"].get("authorships") or []
        for inst in authorship.get("institutions") or []
        if inst.get("id")
    })
    institution_rows = source.fetch_institutions(institution_ids) if institution_ids else []
    (RAW_DIR / "openalex_institutions.json").write_text(json.dumps(institution_rows, ensure_ascii=False), encoding="utf-8")
    report = {"source": "openalex", "unique_records": len(ordered), "institutions": len(institution_rows), "query_hits": query_hits, "retrieved_at": retrieved_at}
    (RAW_DIR / "openalex_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def collect_secondary(max_per_query: int = 40) -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    queries = [
        "AI generated image detection",
        "image forgery detection localization",
        "generated image source attribution",
        "scene text image forgery detection",
    ]
    sources = [
        CrossrefSource(mailto=os.getenv("CROSSREF_MAILTO", "")),
        ArxivSource(),
        SemanticScholarSource(api_key=os.getenv("SEMANTIC_SCHOLAR_API_KEY", "")),
        DblpSource(),
    ]
    output: list[dict] = []
    errors: list[dict] = []
    for source in sources:
        for query in queries:
            try:
                for row in source.search(query, max_per_query):
                    output.append({"source": source.name, "query": query, "retrieved_at": utc_now(), "record": row})
            except Exception as exc:  # adapters remain optional and independently recoverable
                errors.append({"source": source.name, "query": query, "error": str(exc)[:300]})
    (RAW_DIR / "secondary_candidates.jsonl").write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in output), encoding="utf-8")
    report = {"records": len(output), "errors": errors, "retrieved_at": utc_now()}
    (RAW_DIR / "secondary_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report
