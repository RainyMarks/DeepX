from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Iterable

from atlas.dedupe import canonical_arxiv, canonical_doi, normalized_title, stable_id
from atlas.jsonl import iter_jsonl
from atlas.models import AuthorIndex, AuthorRef, DatasetManifest, Institution, Paper, Provenance, Venue, VenueRanking
from atlas.sources.openalex import inverted_abstract
from atlas.taxonomy import TASK_LABELS, classify_tasks, contribution_type, is_in_scope


ROOT = Path(__file__).resolve().parents[1]
AUTHORIZED_DIR = ROOT / "data" / "authorized"
CURATED_DIR = ROOT / "data" / "curated"
RAW_DIR = ROOT / "data" / "raw"
PUBLIC_DIR = ROOT / "web" / "public" / "data" / "v1"

VENUE_SHORT_NAMES = {
    "ieee transactions on information forensics and security": "TIFS",
    "ieee transactions on image processing": "TIP",
    "ieee transactions on pattern analysis and machine intelligence": "TPAMI",
    "ieee transactions on multimedia": "TMM",
    "ieee transactions on circuits and systems for video technology": "TCSVT",
    "ieee transactions on dependable and secure computing": "TDSC",
    "international journal of computer vision": "IJCV",
    "information fusion": "IF",
    "journal of visual communication and image representation": "JVCIR",
    "acm transactions on multimedia computing communications and applications": "TOMM",
    "ieee signal processing letters": "SPL",
    "ieee signal processing magazine": "SPM",
    "pattern recognition": "PR",
    "signal processing image communication": "SPIC",
    "expert systems with applications": "ESWA",
    "multimedia tools and applications": "MTAP",
    "computer vision and image understanding": "CVIU",
}

COUNTRY_NAMES = {
    "US": "美国", "CN": "中国", "GB": "英国", "DE": "德国", "FR": "法国", "IT": "意大利",
    "CA": "加拿大", "AU": "澳大利亚", "JP": "日本", "KR": "韩国", "SG": "新加坡", "CH": "瑞士",
    "NL": "荷兰", "ES": "西班牙", "AT": "奥地利", "BE": "比利时", "SE": "瑞典", "FI": "芬兰",
    "IN": "印度", "IL": "以色列", "AE": "阿联酋", "HK": "中国香港", "MO": "中国澳门", "TW": "中国台湾",
}


def _slug(value: str, prefix: str) -> str:
    digest = hashlib.sha1((value or "unknown").strip().lower().encode("utf-8")).hexdigest()[:14]
    return f"{prefix}-{digest}"


def _year_from_date(value: str) -> int | None:
    match = re.search(r"(?:19|20)\d{2}", value or "")
    return int(match.group(0)) if match else None


def _author(name: str, source_id: str = "", orcid: str = "", institutions: list[str] | None = None) -> AuthorRef:
    return AuthorRef(
        id=source_id.rsplit("/", 1)[-1].lower() if source_id else _slug(name, "author"),
        name=" ".join((name or "未知作者").split()),
        orcid=(orcid or "").replace("https://orcid.org/", ""),
        institution_ids=sorted(set(institutions or [])),
    )


def load_rankings() -> list[dict]:
    path = CURATED_DIR / "venue_rankings.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def apply_venue_ranking(name: str, venue_type: str = "unknown", issn: str = "") -> Venue | None:
    name = " ".join((name or "").split())
    if not name:
        return None
    normalized = normalized_title(name)
    known_short_name = VENUE_SHORT_NAMES.get(normalized, "")
    if any(marker in normalized.split() for marker in ("workshop", "workshops", "findings", "companion")):
        return Venue(
            id=_slug(name, "venue"),
            name=name,
            type=venue_type if venue_type in {"conference", "journal", "preprint", "book"} else "unknown",
            issn=issn,
        )
    for item in load_rankings():
        item_type = item.get("type", venue_type)
        if venue_type in {"conference", "journal"} and item_type in {"conference", "journal"} and item_type != venue_type:
            continue
        aliases = [item["name"], item.get("short_name", ""), *item.get("aliases", [])]
        if issn and item.get("issn") and issn.lower() == item["issn"].lower():
            matched = True
        else:
            matched = False
            for alias in aliases:
                normalized_alias = normalized_title(alias)
                if not normalized_alias or not normalized:
                    continue
                if normalized_alias == normalized:
                    matched = True
                    break
                # Long canonical names may be embedded in strings such as
                # "Proceedings of the 2025 ...". Short acronyms and partial
                # titles must match exactly to avoid assigning CVPR to
                # Pattern Recognition or NeurIPS to Information.
                if len(normalized_alias.split()) >= 4 and normalized_alias in normalized:
                    matched = True
                    break
        if matched:
            rankings = []
            for rank in item.get("rankings", []):
                system = rank.get("system")
                if system == "CCF" and item_type != "conference":
                    continue
                if system in {"CAS", "JCR"} and item_type != "journal":
                    continue
                rankings.append(VenueRanking(**rank))
            return Venue(id=item["id"], name=name, short_name=item.get("short_name", "") or known_short_name, type=item_type, issn=issn, rankings=rankings)
    return Venue(id=_slug(name, "venue"), name=name, short_name=known_short_name, type=venue_type if venue_type in {"conference", "journal", "preprint", "book"} else "unknown", issn=issn)


def authorized_institutions() -> tuple[dict[str, Institution], dict[str, set[str]]]:
    path = AUTHORIZED_DIR / "reference_map.json"
    if not path.exists():
        return {}, defaultdict(set)
    payload = json.loads(path.read_text(encoding="utf-8"))
    institutions: dict[str, Institution] = {}
    paper_map: dict[str, set[str]] = defaultdict(set)
    for row in payload.get("records", []):
        raw_id = str(row.get("institution_id") or row.get("institution") or row.get("canonical_name") or "")
        institution_id = raw_id.rsplit("/", 1)[-1].lower() if raw_id else _slug(row.get("institution", ""), "inst")
        latitude = row.get("latitude")
        longitude = row.get("longitude")
        status = "verified" if row.get("resolution_confidence") == "high" and latitude is not None and longitude is not None else "auto"
        institutions[institution_id] = Institution(
            id=institution_id,
            name=row.get("canonical_institution_name") or row.get("canonical_name") or row.get("institution") or "未知机构",
            country=row.get("country") or COUNTRY_NAMES.get(row.get("country_code", ""), row.get("country_code", "")),
            country_code=row.get("country_code", ""),
            city=row.get("city", ""), latitude=latitude, longitude=longitude,
            openalex_id=raw_id if str(raw_id).startswith("https://openalex.org/") else "",
            coordinate_source=row.get("resolution_method", "authorized_seed"), review_status=status,
        )
        paper_key = canonical_doi(row.get("doi", "")) or canonical_arxiv(row.get("arxiv_id", "")) or f"{normalized_title(row.get('title',''))}:{row.get('year','')}"
        paper_map[paper_key].add(institution_id)
    return institutions, paper_map


def authorized_papers() -> list[Paper]:
    path = AUTHORIZED_DIR / "reference_papers.json"
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    _, paper_map = authorized_institutions()
    output: list[Paper] = []
    for row in payload.get("records", []):
        title = row.get("title", "")
        year = row.get("publication_year") or row.get("year")
        doi = canonical_doi(row.get("doi", ""))
        arxiv_id = canonical_arxiv(row.get("arxiv_id", ""))
        paper_key = doi or arxiv_id or f"{normalized_title(title)}:{year or ''}"
        authors = []
        for item in row.get("authors") or []:
            name = item.get("name", "") if isinstance(item, dict) else str(item)
            if name:
                authors.append(_author(name))
        manually_confirmed = row.get("review_status") == "reviewed" or row.get("curation_status") in {"manually_confirmed", "corrected_by_admin", "manually_added"}
        source_task = row.get("task", "")
        task_tags = classify_tasks(title, row.get("abstract", ""))
        if source_task == "source_attribution" and "source_attribution" not in task_tags:
            task_tags.append("source_attribution")
        venue_name = row.get("venue_name") or row.get("venue") or ""
        publication_type = row.get("publication_type") or "unknown"
        venue_type = "preprint" if row.get("is_arxiv_preprint") else publication_type if publication_type in {"conference", "journal", "book"} else "unknown"
        output.append(Paper(
            id=stable_id(title, year, doi, arxiv_id), title=title, year=year,
            publication_date=row.get("publication_date") or "", abstract=row.get("abstract") or "", authors=authors,
            institution_ids=sorted(paper_map.get(paper_key, [])), venue=apply_venue_ranking(venue_name, venue_type),
            task_tags=task_tags, contribution_type=row.get("entry_type") if row.get("entry_type") in {"method", "dataset", "benchmark", "survey", "analysis"} else contribution_type(title),
            review_status="verified" if manually_confirmed else "auto", doi=doi, arxiv_id=arxiv_id,
            openalex_id=str(row.get("openalex_url", "")).rsplit("/", 1)[-1],
            primary_url=row.get("primary_url") or row.get("paper_url") or row.get("url") or "",
            provenance=[Provenance(source="authorized_seed", source_id=row.get("paper_id", ""), url=row.get("openalex_url") or row.get("url") or "", retrieved_at="2026-07-15T00:00:00Z")],
        ))
    return output


def openalex_institutions() -> dict[str, Institution]:
    path = RAW_DIR / "openalex_institutions.json"
    if not path.exists():
        return {}
    output: dict[str, Institution] = {}
    for row in json.loads(path.read_text(encoding="utf-8")):
        raw_id = str(row.get("id", ""))
        institution_id = raw_id.rsplit("/", 1)[-1].lower()
        geo = row.get("geo") or {}
        country_code = row.get("country_code") or ""
        output[institution_id] = Institution(
            id=institution_id, name=row.get("display_name") or "未知机构", country=geo.get("country") or COUNTRY_NAMES.get(country_code, ""),
            country_code=country_code, city=geo.get("city") or "", latitude=geo.get("latitude"), longitude=geo.get("longitude"),
            ror=row.get("ror") or "", openalex_id=raw_id, coordinate_source="OpenAlex institution metadata", review_status="auto",
        )
    return output


def openalex_papers() -> list[Paper]:
    path = RAW_DIR / "openalex_candidates.jsonl"
    if not path.exists():
        return []
    output: list[Paper] = []
    for envelope in iter_jsonl(path):
        row = envelope.get("record", envelope)
        title = row.get("title") or row.get("display_name") or ""
        abstract = inverted_abstract(row.get("abstract_inverted_index"))
        if not title or not is_in_scope(title, abstract):
            continue
        year = row.get("publication_year") or _year_from_date(row.get("publication_date", ""))
        ids = row.get("ids") or {}
        doi = canonical_doi(ids.get("doi") or row.get("doi") or "")
        arxiv_id = ""
        for location in [row.get("primary_location") or {}, *(row.get("locations") or [])]:
            url = str(location.get("landing_page_url") or "")
            if "arxiv.org/" in url:
                arxiv_id = canonical_arxiv(url)
                break
        institution_ids: list[str] = []
        authors: list[AuthorRef] = []
        for authorship in row.get("authorships") or []:
            author_data = authorship.get("author") or {}
            author_institutions = [str(item.get("id", "")).rsplit("/", 1)[-1].lower() for item in authorship.get("institutions") or [] if item.get("id")]
            institution_ids.extend(author_institutions)
            authors.append(_author(author_data.get("display_name", ""), author_data.get("id", ""), author_data.get("orcid", ""), author_institutions))
        source = (row.get("primary_location") or {}).get("source") or {}
        venue_name = source.get("display_name", "")
        venue_type = source.get("type") or ("preprint" if source.get("is_in_doaj") is False and "arxiv" in venue_name.lower() else "unknown")
        if venue_type == "repository" and "arxiv" in venue_name.lower():
            venue_type = "preprint"
        openalex_id = str(row.get("id", "")).rsplit("/", 1)[-1]
        primary_url = (row.get("primary_location") or {}).get("landing_page_url") or ids.get("doi") or row.get("id") or ""
        output.append(Paper(
            id=stable_id(title, year, doi, arxiv_id), title=title, year=year, publication_date=row.get("publication_date") or "", abstract=abstract,
            authors=authors, institution_ids=sorted(set(institution_ids)), venue=apply_venue_ranking(venue_name, venue_type),
            task_tags=classify_tasks(title, abstract), contribution_type=contribution_type(title), review_status="auto",
            doi=doi, arxiv_id=arxiv_id, openalex_id=openalex_id, primary_url=primary_url,
            citation_count=int(row.get("cited_by_count") or 0),
            provenance=[Provenance(source="openalex", source_id=openalex_id, url=row.get("id", ""), query=envelope.get("query", ""), retrieved_at=envelope.get("retrieved_at") or "")],
        ))
    return output


def secondary_papers() -> list[Paper]:
    path = RAW_DIR / "secondary_candidates.jsonl"
    if not path.exists():
        return []
    output: list[Paper] = []
    for envelope in iter_jsonl(path):
        source_name = envelope.get("source", "")
        row = envelope.get("record") or {}
        title = ""
        year = None
        abstract = ""
        doi = ""
        arxiv_id = ""
        primary_url = ""
        venue_name = ""
        venue_type = "unknown"
        issn = ""
        citation_count = 0
        authors: list[AuthorRef] = []
        source_id = ""
        if source_name == "crossref":
            title_value = row.get("title") or []
            title = (title_value[0] if title_value else "") if isinstance(title_value, list) else str(title_value)
            date_parts = ((row.get("published") or {}).get("date-parts") or [[]])[0]
            year = int(date_parts[0]) if date_parts else None
            abstract = re.sub(r"<[^>]+>", " ", row.get("abstract", ""))
            doi = canonical_doi(row.get("DOI", ""))
            primary_url = row.get("URL", "")
            venue_value = row.get("container-title") or []
            venue_name = (venue_value[0] if venue_value else "") if isinstance(venue_value, list) else str(venue_value)
            issn_value = row.get("ISSN") or []
            issn = (issn_value[0] if issn_value else "") if isinstance(issn_value, list) else str(issn_value)
            venue_type = "journal" if "journal" in row.get("type", "") else "conference" if "proceedings" in row.get("type", "") else "unknown"
            citation_count = int(row.get("is-referenced-by-count") or 0)
            source_id = doi
            for item in row.get("author") or []:
                name = " ".join(part for part in [item.get("given", ""), item.get("family", "")] if part)
                if name:
                    authors.append(_author(name, orcid=item.get("ORCID", "")))
        elif source_name == "arxiv":
            title = row.get("title", "")
            abstract = row.get("summary", "")
            year = _year_from_date(row.get("published", ""))
            arxiv_id = canonical_arxiv(row.get("id", ""))
            primary_url = row.get("id", "")
            venue_name, venue_type, source_id = "arXiv", "preprint", arxiv_id
            authors = [_author(name) for name in row.get("authors") or [] if name]
        elif source_name == "semantic_scholar":
            title, abstract, year = row.get("title", ""), row.get("abstract") or "", row.get("year")
            external = row.get("externalIds") or {}
            doi, arxiv_id = canonical_doi(external.get("DOI", "")), canonical_arxiv(external.get("ArXiv", ""))
            primary_url, venue_name, source_id = row.get("url", ""), row.get("venue", ""), row.get("paperId", "")
            citation_count = int(row.get("citationCount") or 0)
            authors = [_author(item.get("name", ""), item.get("authorId", "")) for item in row.get("authors") or [] if item.get("name")]
        elif source_name == "dblp":
            title, year = re.sub(r"<[^>]+>", "", row.get("title", "")), _year_from_date(str(row.get("year", "")))
            doi, primary_url, venue_name = canonical_doi(row.get("doi", "")), row.get("url", ""), row.get("venue", "")
            source_id = row.get("key", "")
            author_value = (row.get("authors") or {}).get("author", [])
            if isinstance(author_value, dict):
                author_value = [author_value]
            authors = [_author(item.get("text", "") if isinstance(item, dict) else str(item)) for item in author_value]
        if not title or not is_in_scope(title, abstract):
            continue
        output.append(Paper(
            id=stable_id(title, year, doi, arxiv_id), title=title, year=year, abstract=abstract, authors=authors,
            venue=apply_venue_ranking(venue_name, venue_type, issn), task_tags=classify_tasks(title, abstract), contribution_type=contribution_type(title),
            review_status="auto", doi=doi, arxiv_id=arxiv_id, semantic_scholar_id=source_id if source_name == "semantic_scholar" else "",
            primary_url=primary_url or (f"https://doi.org/{doi}" if doi else ""), citation_count=citation_count,
            provenance=[Provenance(source=source_name, source_id=source_id, url=primary_url, query=envelope.get("query", ""), retrieved_at=envelope.get("retrieved_at", ""))],
        ))
    return output


def _merge_exact(papers: Iterable[Paper], _depth: int = 0) -> list[Paper]:
    paper_list = list(papers)
    merged: dict[str, Paper] = {}
    keys: dict[str, str] = {}
    for paper in paper_list:
        strong_keys = []
        if paper.doi:
            strong_keys.append("doi:" + canonical_doi(paper.doi))
        if paper.arxiv_id:
            strong_keys.append("arxiv:" + canonical_arxiv(paper.arxiv_id))
        if paper.openalex_id:
            strong_keys.append("openalex:" + paper.openalex_id.lower())
        strong_keys.append(f"title:{normalized_title(paper.title)}:{paper.year or ''}")
        existing_id = next((keys[key] for key in strong_keys if key in keys), "")
        if not existing_id:
            merged[paper.id] = paper
            for key in strong_keys:
                keys[key] = paper.id
            continue
        current = merged[existing_id]
        if paper.review_status == "verified" and current.review_status != "verified":
            current.review_status = "verified"
        for field in ("abstract", "doi", "arxiv_id", "openalex_id", "primary_url"):
            if not getattr(current, field) and getattr(paper, field):
                setattr(current, field, getattr(paper, field))
        if not current.authors and paper.authors:
            current.authors = paper.authors
        current.institution_ids = sorted(set(current.institution_ids + paper.institution_ids))
        current.task_tags = sorted(set(current.task_tags + paper.task_tags))
        current.citation_count = max(current.citation_count, paper.citation_count)
        current.provenance.extend(item for item in paper.provenance if item not in current.provenance)
        for key in strong_keys:
            keys[key] = existing_id
    result = list(merged.values())
    # A later source can attach a strong identifier to an already merged paper.
    # Re-run a bounded pass so this newly discovered DOI/arXiv bridge also merges
    # an earlier formal/preprint pair; no fuzzy title decision is introduced.
    if len(result) < len(paper_list) and _depth < 4:
        return _merge_exact(result, _depth + 1)
    return result


def _load_decisions() -> dict[str, dict]:
    path = CURATED_DIR / "review_decisions.jsonl"
    output: dict[str, dict] = {}
    if path.exists():
        for decision in iter_jsonl(path):
            output[decision["paper_id"]] = decision
    return output


def raw_candidate_count() -> int:
    """Count the full local candidate pool across independently fetched sources."""

    paths = [RAW_DIR / "openalex_candidates.jsonl", RAW_DIR / "secondary_candidates.jsonl"]
    return sum(sum(1 for line in path.open(encoding="utf-8") if line.strip()) for path in paths if path.exists())


def _apply_decisions(papers: list[Paper]) -> list[Paper]:
    decisions = _load_decisions()
    output = []
    for paper in papers:
        decision = decisions.get(paper.id)
        if decision:
            paper.review_status = decision.get("status", paper.review_status)
            paper.notes = decision.get("note", "")
            if decision.get("task_tags"):
                paper.task_tags = decision["task_tags"]
        if paper.review_status != "rejected":
            output.append(paper)
    return output


def build_public() -> DatasetManifest:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    papers = _apply_decisions(_merge_exact([*authorized_papers(), *openalex_papers(), *secondary_papers()]))
    # Collectors deliberately favor recall, but the public release favors
    # precision: explicit image-forensics evidence is required here.
    papers = [
        paper
        for paper in papers
        if paper.task_tags and paper.primary_url and is_in_scope(paper.title, paper.abstract)
    ]
    papers.sort(key=lambda item: (-(item.year or 0), item.title.lower()))

    institutions, _ = authorized_institutions()
    institutions.update(openalex_institutions())
    for institution in institutions.values():
        institution.paper_ids = []
    for paper in papers:
        for institution_id in paper.institution_ids:
            if institution_id in institutions:
                institutions[institution_id].paper_ids.append(paper.id)
    institutions = {key: value for key, value in institutions.items() if value.paper_ids}

    author_index: dict[str, AuthorIndex] = {}
    for paper in papers:
        for author in paper.authors:
            entry = author_index.setdefault(author.id, AuthorIndex(id=author.id, name=author.name, orcid=author.orcid))
            entry.paper_ids.append(paper.id)
            entry.institution_ids = sorted(set(entry.institution_ids + author.institution_ids))
            for task in paper.task_tags:
                entry.task_counts[task] = entry.task_counts.get(task, 0) + 1

    catalog = []
    details: dict[str, list[dict]] = defaultdict(list)
    for paper in papers:
        rankings = [item.model_dump(mode="json") for item in (paper.venue.rankings if paper.venue else [])]
        catalog.append({
            "id": paper.id, "title": paper.title, "title_zh": paper.title_zh, "year": paper.year,
            "authors": [{"id": author.id, "name": author.name} for author in paper.authors],
            "institution_ids": [item for item in paper.institution_ids if item in institutions],
            "venue": {"id": paper.venue.id, "name": paper.venue.name, "short_name": paper.venue.short_name, "type": paper.venue.type, "rankings": rankings} if paper.venue else None,
            "task_tags": paper.task_tags, "contribution_type": paper.contribution_type,
            "review_status": paper.review_status, "primary_url": paper.primary_url,
            "citation_count": paper.citation_count, "sources": sorted({item.source for item in paper.provenance}),
            "abstract_excerpt": paper.abstract[:240],
        })
        shard = paper.id[-1]
        details[shard].append(paper.model_dump(mode="json"))

    task_counts = Counter(task for paper in papers for task in paper.task_tags)
    year_counts = Counter(str(paper.year) for paper in papers if paper.year)
    review_counts = Counter(paper.review_status for paper in papers)
    country_counts = Counter(item.country or item.country_code for item in institutions.values() if item.country or item.country_code)
    stats = {
        "tasks": [{"id": key, "label": TASK_LABELS[key], "count": task_counts.get(key, 0)} for key in TASK_LABELS],
        "years": dict(sorted(year_counts.items())), "reviews": dict(review_counts),
        "countries": country_counts.most_common(20),
    }
    source_counts = Counter(source for paper in papers for source in {item.source for item in paper.provenance})
    ranking_count = sum(len(paper.venue.rankings) for paper in papers if paper.venue)
    quality = {
        "dataset_version": str(date.today()),
        "candidate_count": raw_candidate_count() or len(papers),
        "public_paper_count": len(papers),
        "verified_paper_count": sum(paper.review_status == "verified" for paper in papers),
        "auto_review_count": sum(paper.review_status == "auto" for paper in papers),
        "source_counts": dict(sorted(source_counts.items())),
        "venue_ranking_badge_count": ranking_count,
        "mapped_institution_count": sum(item.latitude is not None and item.longitude is not None for item in institutions.values()),
        "strong_identifier_duplicate_policy": "DOI → arXiv → OpenAlex → 标题+年份；模糊匹配不自动合并",
        "scope_policy": "仅公开具有明确图像取证任务证据的记录；宽召回噪声保留在本地候选池",
    }

    def write(name: str, value: object) -> None:
        (PUBLIC_DIR / name).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    write("catalog.json", catalog)
    write("authors.json", [item.model_dump(mode="json") for item in sorted(author_index.values(), key=lambda x: (-len(x.paper_ids), x.name))])
    write("institutions.json", [item.model_dump(mode="json") for item in sorted(institutions.values(), key=lambda x: (-len(x.paper_ids), x.name))])
    write("stats.json", stats)
    quality["quality_targets"] = {
        "candidate_2000": quality["candidate_count"] >= 2000,
        "public_1000": len(papers) >= 1000,
        "human_verified_300": quality["verified_paper_count"] >= 300,
    }
    quality["warnings"] = [] if quality["quality_targets"]["human_verified_300"] else ["人工核验核心集尚未达到 300；自动记录不会冒充人工核验"]
    write("quality.json", quality)
    detail_dir = PUBLIC_DIR / "details"
    detail_dir.mkdir(exist_ok=True)
    for old in detail_dir.glob("*.json"):
        old.unlink()
    shard_names = []
    for shard, values in sorted(details.items()):
        name = f"details/{shard}.json"
        write(name, values)
        shard_names.append(shard)

    candidate_count = raw_candidate_count() or len(papers)
    mapped = [item for item in institutions.values() if item.latitude is not None and item.longitude is not None]
    manifest = DatasetManifest(
        dataset_version=str(date.today()), paper_count=len(papers), verified_paper_count=sum(p.review_status == "verified" for p in papers),
        author_count=len(author_index), institution_count=len(institutions), mapped_institution_count=len(mapped),
        country_count=len({item.country_code for item in institutions.values() if item.country_code}), candidate_count=candidate_count,
        detail_shards=shard_names,
    )
    write("manifest.json", manifest.model_dump(mode="json"))
    return manifest
