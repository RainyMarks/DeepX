"""Reading and writing the static public release consumed by the web atlas.

Release layout (schema 2):

- ``catalog.json``: ``{"venues": [...], "authors": [...], "papers": [...]}``.
  Each venue (with its ranking badges) and each author is stored once; papers
  refer to venues by ``venue_id`` and to authors by their index in
  ``authors``. The legacy layout repeated full venue objects and opaque
  author ids on every paper, which made up about a third of the payload.
- ``details/<xx>.json``: full paper records sharded by the last two hex digits
  of the paper id, so opening one record downloads ~1/256 of the corpus.
- ``authors.json``: one entry per resolved author identity (see
  ``atlas/identity.py``); ``author_aliases.json`` records every id that was
  merged into another and the evidence for it.
- ``institutions.json``, ``stats.json``, ``quality.json``, ``manifest.json``.

Readers accept both the legacy and the current layout so that maintenance
commands keep working on an unmigrated checkout.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from atlas.identity import IdentityResolution, apply_author_identities, resolve_author_identities
from atlas.taxonomy import TASK_LABELS

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "web" / "public" / "data" / "v1"
SCHEMA_VERSION = "2.0.0"
DETAIL_SHARD_LENGTH = 2


def detail_shard(paper_id: str) -> str:
    return paper_id[-DETAIL_SHARD_LENGTH:]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _canonical_venue(variants: list[dict]) -> dict:
    """Merge the per-paper copies of one venue id into a single record.

    Venue ids are derived from the normalized name, so copies only disagree on
    name casing or on a ``type`` that some sources leave as ``unknown``. A
    known type wins over ``unknown``; otherwise the most common value wins.
    Rankings are assigned per venue and are identical across copies.
    """
    names = Counter(item.get("name", "") for item in variants)
    types = Counter(item.get("type") or "unknown" for item in variants)
    known = Counter({key: count for key, count in types.items() if key != "unknown"})
    first = variants[0]
    return {
        "id": first["id"],
        "name": names.most_common(1)[0][0],
        "short_name": next((item["short_name"] for item in variants if item.get("short_name")), ""),
        "type": (known or types).most_common(1)[0][0],
        "rankings": max((item.get("rankings", []) for item in variants), key=len),
    }


def pack_catalog(entries: list[dict]) -> dict:
    """Split embedded venues and authors out of catalog entries."""
    variants: dict[str, list[dict]] = defaultdict(list)
    # Keyed by (id, name): sources occasionally spell the same author id
    # differently and the catalog keeps each paper's spelling.
    author_index: dict[tuple[str, str], int] = {}
    authors: list[dict] = []
    papers = []
    for entry in entries:
        paper = {key: value for key, value in entry.items() if key != "venue"}
        venue = entry.get("venue")
        if venue:
            variants[venue["id"]].append(venue)
        paper["venue_id"] = venue["id"] if venue else None
        refs = []
        for author in entry.get("authors", []):
            key = (author["id"], author["name"])
            if key not in author_index:
                author_index[key] = len(authors)
                authors.append({"id": author["id"], "name": author["name"]})
            refs.append(author_index[key])
        paper["authors"] = refs
        if not paper.get("title_zh"):
            paper.pop("title_zh", None)
        papers.append(paper)
    venues = [_canonical_venue(items) for _, items in sorted(variants.items())]
    return {"venues": venues, "authors": authors, "papers": papers}


def unpack_catalog(raw: dict | list) -> list[dict]:
    """Return catalog entries with embedded venues and authors from either layout."""
    if isinstance(raw, list):
        return raw
    venues = {venue["id"]: venue for venue in raw.get("venues", [])}
    authors = raw.get("authors", [])
    entries = []
    for paper in raw.get("papers", []):
        entry = {key: value for key, value in paper.items() if key != "venue_id"}
        entry.setdefault("title_zh", "")
        entry["authors"] = [dict(authors[index]) for index in paper.get("authors", [])]
        venue = venues.get(paper.get("venue_id") or "")
        entry["venue"] = {**venue, "rankings": list(venue.get("rankings", []))} if venue else None
        entries.append(entry)
    return entries


def read_catalog(public_dir: Path = PUBLIC_DIR) -> list[dict]:
    return unpack_catalog(read_json(public_dir / "catalog.json"))


def read_details(public_dir: Path = PUBLIC_DIR) -> list[dict]:
    records: list[dict] = []
    for path in sorted((public_dir / "details").glob("*.json")):
        records.extend(read_json(path))
    return records


def write_catalog_and_details(
    catalog: list[dict],
    details: list[dict],
    public_dir: Path = PUBLIC_DIR,
) -> list[str]:
    """Write the packed catalog and the detail shards; return the shard names."""
    write_json(public_dir / "catalog.json", pack_catalog(catalog))
    shards: dict[str, list[dict]] = defaultdict(list)
    for record in details:
        shards[detail_shard(record["id"])].append(record)
    detail_dir = public_dir / "details"
    detail_dir.mkdir(parents=True, exist_ok=True)
    for old in detail_dir.glob("*.json"):
        old.unlink()
    for shard, records in sorted(shards.items()):
        write_json(detail_dir / f"{shard}.json", records)
    return sorted(shards)


def normalize_institution_countries(institutions: list[dict]) -> None:
    """Replace bare ISO codes used as country names with the common full name.

    Some sources report ``country = "US"`` while others report
    ``"United States"`` for the same code, which split country statistics.
    """
    names: dict[str, Counter[str]] = defaultdict(Counter)
    for item in institutions:
        code, country = item.get("country_code") or "", item.get("country") or ""
        if code and country and country.upper() != code.upper():
            names[code.upper()][country] += 1
    for item in institutions:
        code, country = (item.get("country_code") or "").upper(), item.get("country") or ""
        if code and (not country or country.upper() == code) and names.get(code):
            item["country"] = names[code].most_common(1)[0][0]


def build_stats(catalog: list[dict], institutions: list[dict]) -> dict:
    task_counts = Counter(task for paper in catalog for task in paper.get("task_tags", []))
    year_counts = Counter(str(paper["year"]) for paper in catalog if paper.get("year"))
    review_counts = Counter(paper.get("review_status") for paper in catalog)
    country_names: dict[str, str] = {}
    country_counts: Counter[str] = Counter()
    for item in institutions:
        key = item.get("country_code") or item.get("country")
        if not key:
            continue
        country_names.setdefault(key, item.get("country") or key)
        country_counts[key] += 1
    return {
        "tasks": [{"id": key, "label": label, "count": task_counts.get(key, 0)} for key, label in TASK_LABELS.items()],
        "years": dict(sorted(year_counts.items())),
        "reviews": dict(review_counts),
        "countries": [[country_names[key], count] for key, count in country_counts.most_common(20)],
    }


def build_author_index(details: list[dict]) -> list[dict]:
    """authors.json records built from (already resolved) detail records."""
    entries: dict[str, dict] = {}
    names: dict[str, Counter[str]] = defaultdict(Counter)
    orcids: dict[str, set[str]] = defaultdict(set)
    for record in details:
        for author in record.get("authors", []):
            entry = entries.setdefault(author["id"], {
                "id": author["id"], "name": "", "orcid": "", "institution_ids": [], "paper_ids": [], "task_counts": {},
            })
            names[author["id"]][author["name"]] += 1
            if author.get("orcid"):
                orcids[author["id"]].add(author["orcid"])
            entry["institution_ids"] = sorted(set(entry["institution_ids"]) | set(author.get("institution_ids") or []))
            if record["id"] not in entry["paper_ids"]:
                entry["paper_ids"].append(record["id"])
                for task in record.get("task_tags", []):
                    entry["task_counts"][task] = entry["task_counts"].get(task, 0) + 1
    for author_id, entry in entries.items():
        entry["name"] = names[author_id].most_common(1)[0][0]
        # An identity with conflicting ORCIDs is ambiguous; publish none.
        entry["orcid"] = next(iter(orcids[author_id])) if len(orcids[author_id]) == 1 else ""
    return sorted(entries.values(), key=lambda item: (-len(item["paper_ids"]), item["name"], item["id"]))


def unify_authors(catalog: list[dict], details: list[dict], public_dir: Path = PUBLIC_DIR) -> dict:
    """Merge duplicate author ids in place and write authors.json and author_aliases.json."""
    alias_path = public_dir / "author_aliases.json"
    previous = read_json(alias_path) if alias_path.exists() else {"aliases": {}, "evidence": []}
    # Ids merged by an earlier release stay merged when a source re-delivers them.
    history = IdentityResolution(aliases=previous["aliases"], names={}, merges=[])
    apply_author_identities(details, history, rename=False)
    apply_author_identities(catalog, history, rename=False)

    # Merged identities pool their coauthors and institutions, which can
    # expose further evidence; iterate until no merge is added.
    merged: dict[str, str] = {}
    edges: list[list[str]] = []
    for _ in range(10):
        resolution = resolve_author_identities(details)
        if not resolution.aliases:
            break
        apply_author_identities(details, resolution, rename=False)
        apply_author_identities(catalog, resolution, rename=False)
        merged = {alias: resolution.aliases.get(target, target) for alias, target in merged.items()}
        merged.update(resolution.aliases)
        edges += [list(edge) for edge in resolution.merges]
    apply_author_identities(catalog, resolution, rename=True)

    aliases = {alias: merged.get(target, target) for alias, target in previous["aliases"].items()}
    aliases.update(merged)
    evidence = previous["evidence"] + edges
    write_json(alias_path, {"aliases": dict(sorted(aliases.items())), "evidence": evidence})

    authors = build_author_index(details)
    write_json(public_dir / "authors.json", authors)
    return {"author_count": len(authors), "merged_author_ids": len(merged), "total_aliases": len(aliases)}


def repack_public(public_dir: Path = PUBLIC_DIR) -> dict:
    """Rewrite an existing release in the current layout without re-collecting."""
    catalog = read_catalog(public_dir)
    details = read_details(public_dir)
    institutions = read_json(public_dir / "institutions.json")
    normalize_institution_countries(institutions)
    write_json(public_dir / "institutions.json", institutions)
    authors = unify_authors(catalog, details, public_dir)
    shards = write_catalog_and_details(catalog, details, public_dir)
    write_json(public_dir / "stats.json", build_stats(catalog, institutions))
    manifest = read_json(public_dir / "manifest.json")
    manifest.update({
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "country_count": len({item["country_code"] for item in institutions if item.get("country_code")}),
        "author_count": authors["author_count"],
        "detail_shards": shards,
    })
    write_json(public_dir / "manifest.json", manifest)
    quality = read_json(public_dir / "quality.json")
    quality["merged_author_id_count"] = authors["total_aliases"]
    write_json(public_dir / "quality.json", quality)
    return {
        **authors,
        "paper_count": len(catalog),
        "venue_count": len({paper["venue"]["id"] for paper in catalog if paper.get("venue")}),
        "detail_shard_count": len(shards),
    }
