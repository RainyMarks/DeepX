from __future__ import annotations

import hashlib
import re
import unicodedata

from rapidfuzz.fuzz import ratio

from atlas.models import Paper


def canonical_doi(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"^https?://(dx\.)?doi\.org/", "", value)
    return value.removeprefix("doi:").strip().rstrip(".")


def canonical_arxiv(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"^https?://arxiv\.org/(abs|pdf)/", "", value)
    value = value.removesuffix(".pdf")
    return re.sub(r"v\d+$", "", value)


def normalized_title(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def stable_id(title: str, year: int | None = None, doi: str = "", arxiv_id: str = "") -> str:
    if canonical_doi(doi):
        basis = f"doi:{canonical_doi(doi)}"
    elif canonical_arxiv(arxiv_id):
        basis = f"arxiv:{canonical_arxiv(arxiv_id)}"
    else:
        basis = f"title:{normalized_title(title)}:{year or ''}"
    return "paper-" + hashlib.sha1(basis.encode("utf-8")).hexdigest()[:16]


def likely_duplicate(left: Paper, right: Paper) -> bool:
    if canonical_doi(left.doi) and canonical_doi(left.doi) == canonical_doi(right.doi):
        return True
    if canonical_arxiv(left.arxiv_id) and canonical_arxiv(left.arxiv_id) == canonical_arxiv(right.arxiv_id):
        return True
    if left.openalex_id and left.openalex_id == right.openalex_id:
        return True
    if left.semantic_scholar_id and left.semantic_scholar_id == right.semantic_scholar_id:
        return True
    if left.year and right.year and abs(left.year - right.year) > 1:
        return False
    return ratio(normalized_title(left.title), normalized_title(right.title)) >= 96


def merge_papers(primary: Paper, incoming: Paper) -> Paper:
    if incoming.review_status == "verified" and primary.review_status != "verified":
        primary, incoming = incoming, primary
    for field in ("title_zh", "publication_date", "abstract", "doi", "arxiv_id", "openalex_id", "semantic_scholar_id", "primary_url"):
        if not getattr(primary, field) and getattr(incoming, field):
            setattr(primary, field, getattr(incoming, field))
    if primary.year is None:
        primary.year = incoming.year
    if primary.venue is None and incoming.venue is not None:
        primary.venue = incoming.venue
    primary.task_tags = sorted(set(primary.task_tags + incoming.task_tags))
    primary.institution_ids = sorted(set(primary.institution_ids + incoming.institution_ids))
    primary.provenance.extend(item for item in incoming.provenance if item not in primary.provenance)
    known_authors = {author.id for author in primary.authors}
    primary.authors.extend(author for author in incoming.authors if author.id not in known_authors)
    primary.citation_count = max(primary.citation_count, incoming.citation_count)
    return primary
