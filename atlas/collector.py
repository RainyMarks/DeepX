from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx

from atlas.jsonl import iter_jsonl
from atlas.models import utc_now
from atlas.sources import ArxivSource, CrossrefSource, DblpSource, OpenAlexSource, SemanticScholarSource
from atlas.sources.crossref import crossref_year
from atlas.sources.openalex import (
    COLLECTION_QUERIES,
    DEFAULT_QUERIES,
    PRIORITY_VENUE_QUERIES,
    PRIORITY_VENUE_TASKS,
)

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"

SECONDARY_QUERIES = [
    "AI generated image detection",
    "synthetic image detection forensics",
    "fake image detection generative AI",
    "universal fake image detection",
    "generalizable AI generated image detection",
    "AI generated image detection benchmark",
    "AIGC image detection",
    "NPR fake image detection",
    "diffusion generated image detection",
    "GAN generated image detection",
    "generated image source attribution",
    "generative model fingerprint images",
    "diffusion model attribution images",
    "GAN source identification images",
    "origin attribution generated images",
    "deepfake image detection",
    "facial image manipulation detection",
    "face morphing attack detection",
    "image forgery detection localization",
    "image manipulation detection localization",
    "copy move image forgery detection",
    "image splicing detection",
    "image inpainting detection forensics",
    "scene text image forgery detection",
    "scene text tampering detection localization",
    "document image text tampering detection",
    "text tampering localization image",
    "image text manipulation detection",
    "image provenance verification",
    "C2PA image verification",
    "image steganalysis detection",
    "JPEG image steganalysis",
    "spatial image steganalysis",
    "digital image watermarking authentication",
    "fragile watermark image tamper localization",
    "neural image watermarking",
    "diffusion model watermarking provenance",
]

# Crossref, Semantic Scholar and DBLP benefit from venue-qualified searches.
# arXiv has no final venue metadata, so it keeps the general topic vocabulary.
SECONDARY_QUERIES = list(dict.fromkeys([*SECONDARY_QUERIES, *DEFAULT_QUERIES, *PRIORITY_VENUE_QUERIES]))


MAX_CONSECUTIVE_ERRORS = 5


def _out_of_time() -> bool:
    """True once ATLAS_COLLECT_DEADLINE (Unix seconds) has passed; collectors then save and stop."""
    deadline = float(os.getenv("ATLAS_COLLECT_DEADLINE", "0") or 0)
    return bool(deadline) and time.time() >= deadline


def _existing_openalex_records() -> dict[str, dict]:
    """Keep existing candidates when the query vocabulary is expanded."""

    records: dict[str, dict] = {}
    paths = [RAW_DIR / "openalex_candidates.jsonl", RAW_DIR / "openalex_candidates.partial.jsonl"]
    for path in paths:
        if not path.exists():
            continue
        for envelope in iter_jsonl(path):
            row = envelope.get("record", envelope)
            source_id = str(row.get("id") or row.get("doi") or row.get("title"))
            if source_id:
                records[source_id] = envelope
    return records


def _secondary_record_key(envelope: dict) -> str:
    source = envelope.get("source", "")
    row = envelope.get("record") or {}
    if source == "crossref":
        identity = row.get("DOI") or row.get("URL") or row.get("title")
    elif source == "arxiv":
        identity = row.get("id") or row.get("title")
    elif source == "semantic_scholar":
        identity = row.get("paperId") or row.get("title")
    elif source == "dblp":
        identity = row.get("key") or row.get("doi") or row.get("title")
    else:
        identity = row.get("id") or row.get("title")
    if isinstance(identity, list):
        identity = identity[0] if identity else ""
    return f"{source}:{str(identity).strip().lower()}"


def _store_secondary(records: dict[str, dict], envelope: dict) -> None:
    """Add a candidate, or refresh the fields of one collected earlier.

    The first query and retrieval date are kept: they are the provenance of
    the published record, and a changed value would list the source twice.
    """
    key = _secondary_record_key(envelope)
    previous = records.get(key)
    if previous is None:
        records[key] = envelope
    else:
        previous["record"] = {**(previous.get("record") or {}), **(envelope.get("record") or {})}


DATE_LOOKUP_LIMIT = 200


def refresh_undated_crossref_records(
    records: dict[str, dict], source: CrossrefSource, limit: int = DATE_LOOKUP_LIMIT
) -> dict:
    """Look up by DOI the Crossref candidates collected before the date fields were requested.

    Their only date is ``published``, the issue date, so an article in a
    future issue looks like a paper of next year; the full record adds
    ``published-online``, ``issued`` and ``created`` (see crossref_year).
    At most ``limit`` per run, latest year first; a DOI that Crossref no
    longer resolves is marked and not asked again.
    """
    undated = [
        envelope for envelope in records.values()
        if envelope.get("source") == "crossref"
        and (envelope.get("record") or {}).get("DOI")
        and "created" not in envelope["record"]
        and not envelope.get("date_lookup")
    ]
    undated.sort(key=lambda envelope: -(crossref_year(envelope["record"]) or 0))
    refreshed = 0
    errors: list[dict] = []
    for envelope in undated[:limit]:
        if _out_of_time() or len(errors) >= MAX_CONSECUTIVE_ERRORS:
            break
        doi = envelope["record"]["DOI"]
        try:
            envelope["record"] = {**envelope["record"], **source.work(doi)}
            refreshed += 1
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                envelope["date_lookup"] = "not found"
            else:
                errors.append({"source": source.name, "doi": doi, "error": str(exc)[:300]})
        except Exception as exc:  # noqa: BLE001 - a failed lookup keeps the stored record
            errors.append({"source": source.name, "doi": doi, "error": str(exc)[:300]})
        time.sleep(0.35)
    return {"undated": len(undated), "refreshed": refreshed, "errors": errors}


def _existing_secondary_records() -> dict[str, dict]:
    path = RAW_DIR / "secondary_candidates.jsonl"
    records: dict[str, dict] = {}
    if not path.exists():
        return records
    for envelope in iter_jsonl(path):
        key = _secondary_record_key(envelope)
        if key.rsplit(":", 1)[-1]:
            records[key] = envelope
    return records


def collect_openalex(max_records: int = 3200) -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    source = OpenAlexSource(api_key=os.getenv("OPENALEX_API_KEY", ""), mailto=os.getenv("CROSSREF_MAILTO", ""))
    # Keep enough depth per topic for long-tail venue papers. Existing records
    # are merged first, so expanding the vocabulary never discards old finds.
    per_query = max(100, (max_records + len(COLLECTION_QUERIES) - 1) // len(COLLECTION_QUERIES))
    records = _existing_openalex_records()
    existing_count = len(records)
    query_hits: dict[str, int] = {}
    errors: list[dict] = []
    partial_path = RAW_DIR / "openalex_candidates.partial.jsonl"
    retrieved_at = utc_now()
    consecutive_errors = 0
    stopped = ""
    for query in COLLECTION_QUERIES:
        if _out_of_time():
            stopped = "deadline"
            break
        if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
            stopped = "repeated errors"
            break
        count = 0
        newly_found: list[dict] = []
        try:
            for row in source.iter_search(query, per_query):
                source_id = str(row.get("id") or row.get("doi") or row.get("title"))
                if source_id not in records:
                    envelope = {"query": query, "retrieved_at": retrieved_at, "record": row}
                    records[source_id] = envelope
                    newly_found.append(envelope)
                count += 1
            consecutive_errors = 0
        except Exception as exc:  # noqa: BLE001 - a failed query must not abort the collection batch
            errors.append({"query": query, "error": str(exc)[:500]})
            consecutive_errors += 1
        if newly_found:
            with partial_path.open("a", encoding="utf-8") as handle:
                handle.write("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in newly_found))
        query_hits[query] = count
        time.sleep(0.35)
    # ``max_records`` is the approximate network budget for this run. Keep all
    # unique hits after merging with the existing pool; otherwise truncation by
    # query order would systematically drop the later steganalysis/watermark
    # tracks.
    ordered = list(records.values())
    temp = RAW_DIR / "openalex_candidates.jsonl.tmp"
    temp.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in ordered), encoding="utf-8")
    temp.replace(RAW_DIR / "openalex_candidates.jsonl")
    partial_path.unlink(missing_ok=True)

    institution_ids = sorted({
        str(inst.get("id"))
        for item in ordered
        for authorship in item["record"].get("authorships") or []
        for inst in authorship.get("institutions") or []
        if inst.get("id")
    })
    institution_path = RAW_DIR / "openalex_institutions.json"
    existing_institutions = json.loads(institution_path.read_text(encoding="utf-8")) if institution_path.exists() else []
    try:
        fetched_institutions = source.fetch_institutions(institution_ids) if institution_ids else []
    except Exception as exc:  # noqa: BLE001 - institution enrichment is optional
        errors.append({"stage": "institutions", "error": str(exc)[:500]})
        fetched_institutions = []
    institutions_by_id = {
        str(row.get("id") or row.get("display_name")): row
        for row in [*existing_institutions, *fetched_institutions]
        if row.get("id") or row.get("display_name")
    }
    institution_rows = list(institutions_by_id.values())
    institution_path.write_text(json.dumps(institution_rows, ensure_ascii=False), encoding="utf-8")
    report = {
        "source": "openalex",
        "existing_records": existing_count,
        "requested_query_budget": max_records,
        "unique_records": len(ordered),
        "new_records": max(0, len(ordered) - existing_count),
        "institutions": len(institution_rows),
        "query_hits": query_hits,
        "query_count": len(COLLECTION_QUERIES),
        "priority_query_count": len(PRIORITY_VENUE_QUERIES),
        "errors": errors,
        "stopped_early": stopped,
        "retrieved_at": retrieved_at,
    }
    (RAW_DIR / "openalex_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def collect_secondary(max_per_query: int = 40, source_names: set[str] | None = None) -> dict:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    sources = [
        CrossrefSource(mailto=os.getenv("CROSSREF_MAILTO", "")),
        ArxivSource(),
        SemanticScholarSource(api_key=os.getenv("SEMANTIC_SCHOLAR_API_KEY", "")),
        DblpSource(),
    ]
    if source_names:
        sources = [source for source in sources if source.name in source_names]
    records = _existing_secondary_records()
    existing_count = len(records)
    errors: list[dict] = []
    stopped: dict[str, str] = {}
    crossref = next((source for source in sources if source.name == "crossref"), None)
    dates = refresh_undated_crossref_records(records, crossref) if crossref else {"undated": 0, "refreshed": 0, "errors": []}
    errors.extend(dates["errors"])
    for source in sources:
        queries = DEFAULT_QUERIES if source.name == "arxiv" else SECONDARY_QUERIES
        consecutive_errors = 0
        for query in queries:
            if _out_of_time():
                stopped[source.name] = "deadline"
                break
            if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                # A rate-limited or unavailable source must not stall the others.
                stopped[source.name] = "repeated errors"
                break
            try:
                for row in source.search(query, max_per_query):
                    _store_secondary(records, {"source": source.name, "query": query, "retrieved_at": utc_now(), "record": row})
                consecutive_errors = 0
            except Exception as exc:  # noqa: BLE001 - adapters are optional and independently recoverable
                errors.append({"source": source.name, "query": query, "error": str(exc)[:300]})
                consecutive_errors += 1
            time.sleep(3.1 if source.name == "arxiv" else 0.35)
    output = list(records.values())
    temp = RAW_DIR / "secondary_candidates.jsonl.tmp"
    temp.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in output), encoding="utf-8")
    temp.replace(RAW_DIR / "secondary_candidates.jsonl")
    source_counts: dict[str, int] = {}
    for envelope in output:
        name = envelope.get("source", "unknown")
        source_counts[name] = source_counts.get(name, 0) + 1
    report = {
        "existing_records": existing_count,
        "records": len(output),
        "new_records": max(0, len(output) - existing_count),
        "source_counts": source_counts,
        "refreshed_crossref_dates": dates["refreshed"],
        "undated_crossref_records": dates["undated"] - dates["refreshed"],
        "query_count": len(SECONDARY_QUERIES),
        "priority_query_count": len(PRIORITY_VENUE_QUERIES),
        "errors": errors,
        "stopped_early": stopped,
        "retrieved_at": utc_now(),
    }
    (RAW_DIR / "secondary_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def collect_crossref_venues(max_per_query: int = 300) -> dict:
    """Run a high-precision Crossref sweep with topic and venue in separate fields."""

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    source = CrossrefSource(mailto=os.getenv("CROSSREF_MAILTO", ""))
    records = _existing_secondary_records()
    existing_count = len(records)
    errors: list[dict] = []
    query_hits: dict[str, int] = {}
    consecutive_errors = 0
    stopped = ""
    for venue, tasks in PRIORITY_VENUE_TASKS.items():
        # The acronym is useful in free-text search but less useful in the
        # dedicated container-title field.
        container = venue.removesuffix(" TIFS")
        for query in tasks:
            if _out_of_time() or consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                stopped = "deadline" if _out_of_time() else "repeated errors"
                break
            label = f"{query} @ {container}"
            try:
                rows = source.search_in_venue(query, container, max_per_query)
                query_hits[label] = len(rows)
                for row in rows:
                    envelope = {
                        "source": source.name,
                        "query": label,
                        "query_tier": "priority_venue",
                        "retrieved_at": utc_now(),
                        "record": row,
                    }
                    _store_secondary(records, envelope)
                consecutive_errors = 0
            except Exception as exc:  # noqa: BLE001 - one venue query must not abort the sweep
                errors.append({"source": source.name, "query": label, "error": str(exc)[:300]})
                consecutive_errors += 1
            time.sleep(0.35)
        if stopped:
            break

    output = list(records.values())
    temp = RAW_DIR / "secondary_candidates.jsonl.tmp"
    temp.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in output), encoding="utf-8")
    temp.replace(RAW_DIR / "secondary_candidates.jsonl")
    report = {
        "source": "crossref",
        "mode": "venue_scoped",
        "existing_records": existing_count,
        "records": len(output),
        "new_records": max(0, len(output) - existing_count),
        "query_count": len(query_hits),
        "query_hits": query_hits,
        "errors": errors,
        "stopped_early": stopped,
        "retrieved_at": utc_now(),
    }
    (RAW_DIR / "crossref_venue_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report
