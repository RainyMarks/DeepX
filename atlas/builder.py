from __future__ import annotations

import hashlib
import html
import json
import re
from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime

from atlas.dedupe import canonical_arxiv, canonical_doi, normalized_title, stable_id
from atlas.jsonl import iter_jsonl
from atlas.models import (
    AuthorRef,
    DatasetManifest,
    Institution,
    Paper,
    Provenance,
    Venue,
    VenueRanking,
)
from atlas.release import (
    PUBLIC_DIR,
    ROOT,
    SCHEMA_VERSION,
    build_stats,
    normalize_institution_countries,
    pack_catalog,
    read_catalog,
    read_details,
    unify_authors,
    write_catalog_and_details,
    write_json,
)
from atlas.sources.crossref import crossref_year
from atlas.sources.openalex import inverted_abstract
from atlas.taxonomy import TASK_LABELS, classify, classify_tasks, contribution_type, is_in_scope

AUTHORIZED_DIR = ROOT / "data" / "authorized"
CURATED_DIR = ROOT / "data" / "curated"
RAW_DIR = ROOT / "data" / "raw"

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


PREPRINT_VENUE = re.compile(
    r"\b(?:arxiv|corr|ssrn|research square|researchsquare|techrxiv|preprints?|zenodo|biorxiv|medrxiv|authorea|osf)\b"
)
PREPRINT_DOI_PREFIXES = ("10.48550/", "10.2139/", "10.21203/", "10.36227/", "10.20944/", "10.5281/", "10.31219/", "10.1101/", "10.22541/")
CONFERENCE_VENUE = re.compile(
    r"\b(?:conference|symposium|workshop|workshops|congress|summit|colloquium|annual meeting|spie|lecture notes"
    r"|communications in computer and information science|advances in intelligent systems and computing"
    r"|smart innovation systems and technologies|ifip advances|advances in neural information processing systems)\b"
)
JOURNAL_VENUE = re.compile(r"\b(?:journal|transactions|letters|magazine|reviews?|annals|bulletin|quarterly|archives|acta|access|reports)\b")
VENUE_TYPES = {"conference", "journal", "preprint", "book"}


def infer_venue_type(name: str, given: str = "unknown") -> str:
    """Venue type from its name, correcting sources that file proceedings as journals."""
    normalized = normalized_title(name)
    if not normalized:
        return given if given in VENUE_TYPES else "unknown"
    if PREPRINT_VENUE.search(normalized):
        return "preprint"
    journal_name = re.search(r"\b(?:journal|transactions|letters|magazine)\b", normalized)
    if CONFERENCE_VENUE.search(normalized) and not journal_name:
        return "conference"
    if journal_name:
        return "journal"
    if given in VENUE_TYPES:
        return given
    return "journal" if JOURNAL_VENUE.search(normalized) else "unknown"


def is_preprint(paper: Paper) -> bool:
    venue_type = paper.venue.type if paper.venue else ""
    return venue_type == "preprint" or canonical_doi(paper.doi).startswith(PREPRINT_DOI_PREFIXES)


def is_formal(paper: Paper) -> bool:
    return bool(paper.venue) and paper.venue.type in {"journal", "conference", "book"} and not is_preprint(paper)


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
    rankings: list[dict] = []
    for name in ("venue_rankings.json", "journal_rankings.json"):
        path = CURATED_DIR / name
        if path.exists():
            rankings.extend(json.loads(path.read_text(encoding="utf-8")))
    return rankings


MEDIUM_SUFFIX = re.compile(r"\((?:print|online|electronic|internet)\)", re.IGNORECASE)


def _name_variants(name: str) -> set[str]:
    """Normalized forms of a venue name, including each half of OpenAlex's
    "Title/Title (Print)" display names."""
    parts = [name, *name.split("/")] if "/" in name else [name]
    return {variant for part in parts if (variant := normalized_title(MEDIUM_SUFFIX.sub(" ", part)))}


SATELLITE_MARKERS = frozenset({"workshop", "workshops", "findings", "companion"})
# Words that proceedings titles put around a conference's own name:
# "Proceedings of the Thirty-Seventh AAAI ...", "2004 IEEE ... (IEEE Cat. No.04TH8763)".
WRAPPER_WORDS = frozenset({
    "proceedings", "proceeding", "proc", "of", "on", "the", "ieee", "acm", "cvf", "cat", "no", "annual", "volume", "vol",
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
    "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
    "eighteenth", "nineteenth", "twentieth", "thirtieth", "fortieth", "fiftieth",
    "twenty", "thirty", "forty", "fifty", "sixty",
})


# Older IEEE Xplore proceedings put the topic first:
# "Multimedia and Expo, 2007 IEEE International Conference on".
INVERTED_NAME = re.compile(
    r"^(?P<topic>[^,]+),(?P<rest>.*?)\b(?P<head>(?:IEEE\s+)?International\s+(?:Conference|Symposium|Workshop)\s+on)\W*$",
    re.IGNORECASE,
)


def _uninverted(name: str) -> str:
    """Reorder "Topic, 2007 IEEE International Conference on" as "2007 IEEE International Conference on Topic"."""
    match = INVERTED_NAME.match(name)
    return f"{match['rest']} {match['head']} {match['topic']}" if match else name


def _acronym_tokens(item: dict) -> set[str]:
    """Words of a ranked venue's acronyms and short aliases, also joined:
    "S&P" gives s, p and sp; "ACM Multimedia" gives acm and multimedia."""
    tokens: set[str] = set()
    for alias in [item.get("short_name", ""), *item.get("aliases", [])]:
        words = normalized_title(alias).split()
        if alias == item.get("short_name") or len(words) <= 2:
            tokens.update(words)
            tokens.add("".join(words))
    return tokens


def _embeds_name(tokens: list[str], alias: list[str], acronyms: set[str]) -> bool:
    """True when ``alias`` occurs in ``tokens`` and everything around it is
    proceedings wrapping (years, ordinals, publisher, acronym). "International
    Conference on Image Processing, Computer Vision and Machine Learning"
    contains ICIP's name but is a different conference.

    The text around the name is split at the match, so a glued typo such as
    "Thirty-ThirdInternational Joint Conference ..." still leaves "third".
    """
    text, needle = " ".join(tokens), " ".join(alias)
    start = text.find(needle)
    while start != -1:
        rest = f"{text[:start]} {text[start + len(needle):]}".split()
        if all(word in WRAPPER_WORDS or word in acronyms or any(char.isdigit() for char in word) for word in rest):
            return True
        start = text.find(needle, start + 1)
    return False


def apply_venue_ranking(name: str, venue_type: str = "unknown", issn: str = "") -> Venue | None:
    # Some sources deliver escaped names: "IH&amp;MMSec", "Theory, Tools &amp;amp; Applications".
    name = " ".join(html.unescape(html.unescape(name or "")).split())
    if not name:
        return None
    normalized = normalized_title(name)
    tokens = normalized.split()
    variants = _name_variants(name)
    uninverted = _uninverted(name)
    forms = [tokens] if uninverted == name else [tokens, normalized_title(uninverted).split()]
    variants |= {" ".join(form) for form in forms}
    venue_type = infer_venue_type(name, venue_type)
    venue_id = _slug(normalized, "venue")
    known_short_name = VENUE_SHORT_NAMES.get(normalized, "")
    # Workshops, findings and companion volumes do not inherit the main venue's
    # rank; only a ranked venue whose own name has the marker (IH&MMSec) matches.
    markers = SATELLITE_MARKERS.intersection(tokens)
    for item in load_rankings():
        item_type = item.get("type", venue_type)
        if venue_type in {"conference", "journal"} and item_type in {"conference", "journal"} and item_type != venue_type:
            continue
        aliases = [item["name"], item.get("short_name", ""), *item.get("aliases", [])]
        item_issns = {value.lower() for value in [item.get("issn", ""), *item.get("issns", [])] if value}
        if issn and issn.lower() in item_issns and not markers:
            matched = True
        else:
            matched = False
            acronyms = _acronym_tokens(item) if item_type == "conference" else set()
            for alias in aliases:
                alias_tokens = normalized_title(alias).split()
                if not alias_tokens or not tokens or not markers <= set(alias_tokens):
                    continue
                if " ".join(alias_tokens) in variants:
                    matched = True
                    break
                # Conference names of three or more words may be embedded in
                # strings such as "Proceedings of the 2025 ..." or "ACM
                # Multimedia Asia 2023", with only proceedings wrapping around
                # them. Journal titles must match exactly: "International
                # Journal of Computer Vision and Image Processing" is not IJCV.
                # Acronyms and two-word names must match exactly to avoid
                # assigning CVPR to Pattern Recognition or NeurIPS to Information.
                if item_type == "conference" and len(alias_tokens) >= 3 and any(
                    _embeds_name(form, alias_tokens, acronyms) for form in forms
                ):
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
    return Venue(id=venue_id, name=name, short_name=known_short_name, type=venue_type, issn=issn)


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
            year = crossref_year(row)
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
        # A shared title and year is weaker than identifiers: two formal records
        # with different DOIs ("Digital Image Forgery Detection", a book and an
        # unrelated article) stay apart.
        existing_id = next(
            (
                keys[key] for key in strong_keys
                if key in keys and not (key.startswith("title:") and _different_works(merged[keys[key]], paper))
            ),
            "",
        )
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
        _prefer_formal_version(current, paper)
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


def _different_works(left: Paper, right: Paper) -> bool:
    """True when both records carry different DOIs, neither of them a preprint DOI."""
    left_doi, right_doi = canonical_doi(left.doi), canonical_doi(right.doi)
    return bool(left_doi and right_doi and left_doi != right_doi) and not (
        left_doi.startswith(PREPRINT_DOI_PREFIXES) or right_doi.startswith(PREPRINT_DOI_PREFIXES)
    )


def _prefer_formal_version(current: Paper, other: Paper) -> None:
    """Take the formal venue, year and DOI when ``other`` is the published version."""
    if is_formal(other) and not is_formal(current):
        current.venue = other.venue
        current.year = other.year or current.year
        current.publication_date = other.publication_date or current.publication_date
        if other.doi and (not current.doi or is_preprint(current)):
            current.doi = other.doi
            current.primary_url = other.primary_url or current.primary_url
    elif current.venue is None and other.venue is not None:
        current.venue = other.venue
    if current.year is None:
        current.year = other.year


def crossref_years() -> dict[str, int]:
    """First formal appearance per DOI, from Crossref candidates that carry
    their registration date (``created``). Candidates collected before the
    date fields were requested only have the issue date and do not count."""
    path = RAW_DIR / "secondary_candidates.jsonl"
    years: dict[str, int] = {}
    if not path.exists():
        return years
    for envelope in iter_jsonl(path):
        row = envelope.get("record") or {}
        if envelope.get("source") != "crossref" or "created" not in row:
            continue
        doi, year = canonical_doi(row.get("DOI", "")), crossref_year(row)
        if doi and year:
            years[doi] = year
    return years


def apply_crossref_years(papers: list[Paper], years: dict[str, int]) -> int:
    """The Crossref year decides the year of the paper with that DOI.

    Other sources are less reliable here: Semantic Scholar reports the arXiv
    year of papers that also have a preprint, and releases built before the
    Crossref date rule carry issue years such as 2027. Applied once after
    merging, so the result does not depend on the order records merge in.
    """
    changed = 0
    for paper in papers:
        year = years.get(canonical_doi(paper.doi)) if paper.doi else None
        if year and year != paper.year:
            paper.year = year
            if not paper.publication_date.startswith(str(year)):
                paper.publication_date = ""
            changed += 1
    return changed


def _version_key(paper: Paper) -> str:
    title = normalized_title(paper.title)
    return title if len(title) >= 25 and len(title.split()) >= 4 else ""


def _same_venue(left: Paper, right: Paper) -> bool:
    return bool(left.venue and right.venue) and normalized_title(left.venue.name) == normalized_title(right.venue.name)


def _merge_versions(papers: list[Paper]) -> list[Paper]:
    """Merge preprint/published (or online-first/final) versions with an identical title.

    Two different formal venues with the same title stay separate: a workshop
    paper and its journal extension are distinct publications.
    """
    groups: dict[str, list[Paper]] = defaultdict(list)
    output: list[Paper] = []
    for paper in papers:
        key = _version_key(paper)
        if key:
            groups[key].append(paper)
        else:
            output.append(paper)
    for group in groups.values():
        # Formal, ranked, better-cited versions first.
        group.sort(key=lambda item: (not is_formal(item), not (item.venue and item.venue.rankings), -item.citation_count, item.id))
        kept: list[Paper] = []
        for paper in group:
            target = next(
                (
                    item for item in kept
                    if (item.year is None or paper.year is None or abs(item.year - paper.year) <= 2)
                    and (is_preprint(paper) or paper.venue is None or _same_venue(item, paper) or not is_formal(item))
                ),
                None,
            )
            if target is None:
                kept.append(paper)
                continue
            _prefer_formal_version(target, paper)
            for field in ("abstract", "doi", "arxiv_id", "openalex_id", "semantic_scholar_id", "primary_url", "publication_date"):
                if not getattr(target, field) and getattr(paper, field):
                    setattr(target, field, getattr(paper, field))
            if not target.authors:
                target.authors = paper.authors
            if paper.review_status == "verified":
                target.review_status = "verified"
            target.institution_ids = sorted(set(target.institution_ids + paper.institution_ids))
            target.citation_count = max(target.citation_count, paper.citation_count)
            target.provenance.extend(item for item in paper.provenance if item not in target.provenance)
        output.extend(kept)
    return output


def released_papers() -> list[Paper]:
    """The current public release, used as the baseline of every build."""
    if not (PUBLIC_DIR / "catalog.json").exists():
        return []
    output = []
    for record in read_details():
        try:
            output.append(Paper(**record))
        except ValueError:
            continue
    return output


def released_institutions() -> dict[str, Institution]:
    path = PUBLIC_DIR / "institutions.json"
    if not path.exists():
        return {}
    output = {}
    for record in json.loads(path.read_text(encoding="utf-8")):
        try:
            output[record["id"]] = Institution(**record)
        except ValueError:
            continue
    return output


def _previous_quality() -> dict:
    path = PUBLIC_DIR / "quality.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _authorized_curation() -> dict[str, dict]:
    """Curated task/entry-type facts from the authorized seed, keyed like _merge_exact."""
    path = AUTHORIZED_DIR / "reference_papers.json"
    if not path.exists():
        return {}
    output: dict[str, dict] = {}
    for row in json.loads(path.read_text(encoding="utf-8")).get("records", []):
        facts = {}
        if row.get("task") == "source_attribution":
            facts["task"] = "source_attribution"
        if row.get("entry_type") in {"method", "dataset", "benchmark", "survey", "analysis"}:
            facts["entry_type"] = row["entry_type"]
        if not facts:
            continue
        for key in (
            "doi:" + canonical_doi(row.get("doi", "")) if row.get("doi") else "",
            "arxiv:" + canonical_arxiv(row.get("arxiv_id", "")) if row.get("arxiv_id") else "",
            f"title:{normalized_title(row.get('title', ''))}",
        ):
            if key:
                output[key] = facts
    return output


def _curation_for(paper: Paper, curation: dict[str, dict]) -> dict:
    for key in (
        "doi:" + canonical_doi(paper.doi) if paper.doi else "",
        "arxiv:" + canonical_arxiv(paper.arxiv_id) if paper.arxiv_id else "",
        f"title:{normalized_title(paper.title)}",
    ):
        if key and key in curation:
            return curation[key]
    return {}


def _human_verified(decisions: dict[str, dict]) -> set[str]:
    """Individually reviewed papers; the bulk pass is automated and gets no exemption."""
    return {
        paper_id
        for paper_id, decision in decisions.items()
        if decision.get("status") == "verified" and not decision.get("note", "").startswith("快速批量核验")
    }


def _classify_papers(papers: list[Paper], decisions: dict[str, dict]) -> tuple[list[Paper], Counter[str]]:
    """Re-derive scope, research directions and contribution type for every paper."""
    curation = _authorized_curation()
    protected = _human_verified(decisions)
    kept: list[Paper] = []
    dropped: Counter[str] = Counter()
    for paper in papers:
        result = classify(paper.title, paper.abstract)
        facts = _curation_for(paper, curation)
        if not result.in_scope and paper.id not in protected:
            dropped[result.reason] += 1
            continue
        tasks = set(result.tasks or paper.task_tags)
        if facts.get("task"):
            tasks.add(facts["task"])
        paper.task_tags = [task for task in TASK_LABELS if task in tasks]
        if not paper.task_tags:
            dropped["no task"] += 1
            continue
        paper.contribution_type = facts.get("entry_type") or contribution_type(paper.title, paper.abstract)
        kept.append(paper)
    return kept, dropped


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


def refresh_public_rankings() -> dict[str, int]:
    """Refresh ranking badges without rebuilding the collected publication corpus."""
    if not (PUBLIC_DIR / "catalog.json").exists():
        raise FileNotFoundError("公开数据尚未生成，请先运行 python -m atlas.cli publish")

    def update_papers(papers: list[dict]) -> None:
        for paper in papers:
            venue = paper.get("venue")
            if not venue:
                continue
            ranked = apply_venue_ranking(
                venue.get("name", ""),
                venue.get("type", "unknown"),
                venue.get("issn", ""),
            )
            if not ranked:
                continue
            venue["rankings"] = [item.model_dump(mode="json") for item in ranked.rankings]
            if ranked.rankings:
                venue["type"] = ranked.type
            if ranked.short_name:
                venue["short_name"] = ranked.short_name

    catalog = read_catalog()
    details = read_details()
    # Packed venues are shared by every paper, so a detail record with ISSN
    # metadata decides the ranking for the whole venue.
    detail_venues = {record["venue"]["id"]: record["venue"] for record in details if record.get("venue")}
    for paper in catalog:
        if paper.get("venue") and paper["venue"]["id"] in detail_venues:
            paper["venue"]["issn"] = detail_venues[paper["venue"]["id"]].get("issn", "")
    update_papers(catalog)
    update_papers(details)
    shards = write_catalog_and_details(catalog, details)

    rankings = [ranking for venue in pack_catalog(catalog)["venues"] for ranking in venue["rankings"]]
    paper_rankings = [
        ranking
        for paper in catalog
        for ranking in (paper.get("venue") or {}).get("rankings", [])
    ]
    cas = [ranking for ranking in paper_rankings if ranking["system"] == "CAS"]
    jcr = [ranking for ranking in paper_rankings if ranking["system"] == "JCR"]
    ranked_papers = sum(bool((paper.get("venue") or {}).get("rankings")) for paper in catalog)

    quality_path = PUBLIC_DIR / "quality.json"
    quality = json.loads(quality_path.read_text(encoding="utf-8"))
    quality["dataset_version"] = str(datetime.now(UTC).date())
    quality["venue_ranking_badge_count"] = len(paper_rankings)
    write_json(quality_path, quality)

    manifest_path = PUBLIC_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["schema_version"] = SCHEMA_VERSION
    manifest["dataset_version"] = str(datetime.now(UTC).date())
    manifest["generated_at"] = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest["detail_shards"] = shards
    write_json(manifest_path, manifest)

    return {
        "paper_count": len(catalog),
        "ranked_paper_count": ranked_papers,
        "ranking_badge_count": len(paper_rankings),
        "ranked_venue_badge_count": len(rankings),
        "cas_count": len(cas),
        "cas_zone_1_count": sum(ranking["level"] == "1" for ranking in cas),
        "cas_top_count": sum(ranking["is_top"] for ranking in cas),
        "jcr_count": len(jcr),
        "jcr_q1_count": sum(ranking["level"] == "Q1" for ranking in jcr),
    }


def build_public(include_release: bool = True) -> DatasetManifest:
    """Merge the public release with newly collected candidates and rewrite it.

    The current release is the baseline, so a checkout without the local
    candidate cache (``data/raw``) never shrinks the corpus; ``include_release``
    = False rebuilds from the raw candidates alone.
    """
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    baseline = released_papers() if include_release else []
    previous_quality = _previous_quality() if include_release else {}
    decisions = _load_decisions()
    # Old records get the current venue rules (ranking files, venue types) and
    # the Crossref year before merging, so merge decisions do not depend on
    # which build first published a record and publishing twice changes nothing.
    for paper in baseline:
        if paper.venue:
            paper.venue = apply_venue_ranking(paper.venue.name, paper.venue.type, paper.venue.issn)
    years = crossref_years()
    candidates = [*baseline, *authorized_papers(), *openalex_papers(), *secondary_papers()]
    apply_crossref_years(candidates, years)
    merged = _merge_versions(_merge_exact(candidates))
    apply_crossref_years(merged, years)
    papers, dropped = _classify_papers(_apply_decisions(merged), decisions)
    # Collectors favor recall; the public release requires a stated task and a link.
    papers = [paper for paper in papers if paper.primary_url]
    papers.sort(key=lambda item: (-(item.year or 0), item.title.lower()))

    institutions = released_institutions() if include_release else {}
    seeded, _ = authorized_institutions()
    institutions.update(seeded)
    institutions.update(openalex_institutions())
    for institution in institutions.values():
        institution.paper_ids = []
    for paper in papers:
        for institution_id in paper.institution_ids:
            if institution_id in institutions:
                institutions[institution_id].paper_ids.append(paper.id)
    institutions = {key: value for key, value in institutions.items() if value.paper_ids}

    catalog = []
    details = []
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
        details.append(paper.model_dump(mode="json"))

    institution_records = [item.model_dump(mode="json") for item in sorted(institutions.values(), key=lambda x: (-len(x.paper_ids), x.name))]
    normalize_institution_countries(institution_records)
    source_counts = Counter(source for paper in papers for source in {item.source for item in paper.provenance})
    ranking_count = sum(len(paper.venue.rankings) for paper in papers if paper.venue)
    mapped = [item for item in institution_records if item["latitude"] is not None and item["longitude"] is not None]
    excluded = Counter(dropped)
    if not (RAW_DIR / "openalex_candidates.jsonl").exists():
        # Without the collected pool (e.g. a local publish after the workflow)
        # only released and seed records are re-checked; like candidate_count,
        # keep the breakdown of the last build that saw the pool.
        for reason, count in (previous_quality.get("excluded_by_scope_rules") or {}).items():
            excluded[reason] = max(excluded[reason], int(count))
    quality = {
        "dataset_version": str(datetime.now(UTC).date()),
        # The candidate pool only grows; a build without the local cache keeps the last known size.
        "candidate_count": max(raw_candidate_count(), int(previous_quality.get("candidate_count") or 0), len(papers)),
        "public_paper_count": len(papers),
        "verified_paper_count": sum(paper.review_status == "verified" for paper in papers),
        "auto_review_count": sum(paper.review_status == "auto" for paper in papers),
        "source_counts": dict(sorted(source_counts.items())),
        "venue_ranking_badge_count": ranking_count,
        "mapped_institution_count": len(mapped),
        "strong_identifier_duplicate_policy": "DOI → arXiv → OpenAlex → 标题+年份（DOI 不同的正式记录不按标题合并）；同名的预印本/正式版合并，不同正式渠道不合并；模糊匹配不自动合并",
        "excluded_by_scope_rules": dict(sorted(excluded.items())),
        "scope_policy": "仅公开具有明确图像取证任务证据的记录；宽召回噪声保留在本地候选池",
    }
    quality["quality_targets"] = {
        "candidate_2000": quality["candidate_count"] >= 2000,
        "public_1000": len(papers) >= 1000,
        "human_verified_300": quality["verified_paper_count"] >= 300,
    }
    quality["warnings"] = [] if quality["quality_targets"]["human_verified_300"] else ["人工核验核心集尚未达到 300；自动记录不会冒充人工核验"]

    if not include_release:
        # A rebuild from raw source ids starts a new alias history.
        (PUBLIC_DIR / "author_aliases.json").unlink(missing_ok=True)
    authors = unify_authors(catalog, details)
    quality["merged_author_id_count"] = authors["total_aliases"]
    shard_names = write_catalog_and_details(catalog, details)
    write_json(PUBLIC_DIR / "institutions.json", institution_records)
    write_json(PUBLIC_DIR / "stats.json", build_stats(catalog, institution_records))
    write_json(PUBLIC_DIR / "quality.json", quality)

    manifest = DatasetManifest(
        schema_version=SCHEMA_VERSION,
        dataset_version=str(datetime.now(UTC).date()), paper_count=len(papers), verified_paper_count=quality["verified_paper_count"],
        author_count=authors["author_count"], institution_count=len(institution_records), mapped_institution_count=len(mapped),
        country_count=len({item["country_code"] for item in institution_records if item["country_code"]}),
        candidate_count=quality["candidate_count"], detail_shards=shard_names,
    )
    write_json(PUBLIC_DIR / "manifest.json", manifest.model_dump(mode="json"))
    return manifest
