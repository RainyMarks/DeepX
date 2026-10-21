from __future__ import annotations

from urllib.parse import quote

import httpx

from atlas.sources.base import get_with_retry

# Every date field is needed to place future-issue articles in the year they
# appeared (see atlas.builder.crossref_year).
SELECT_FIELDS = (
    "DOI,title,author,published,published-online,published-print,issued,created,"
    "container-title,type,URL,is-referenced-by-count,ISSN,abstract"
)


def _date_year(value: object) -> int | None:
    """Year of a Crossref date object such as ``{"date-parts": [[2025, 9, 20]]}``."""
    try:
        return int(value["date-parts"][0][0])  # type: ignore[index]
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def crossref_year(record: dict) -> int | None:
    """Publication year of a Crossref work.

    Articles in future issues carry the issue date as ``published-print``
    (2027) and often no ``published-online``. The earliest of
    ``published-online``, ``published-print`` and ``issued`` is used, and a
    year after the DOI registration (``created``) falls back to that year.
    Records collected before the date fields were requested only have
    ``published``.
    """
    years = [year for key in ("published-online", "published-print", "issued") if (year := _date_year(record.get(key)))]
    year = min(years) if years else _date_year(record.get("published"))
    created = _date_year(record.get("created"))
    if year and created and year > created:
        return created
    return year or created


class CrossrefSource:
    name = "crossref"

    def __init__(self, mailto: str = "", timeout: float = 30.0):
        self.mailto = mailto
        self.client = httpx.Client(timeout=timeout, headers={"User-Agent": f"SyntheticImageForensicsAtlas/2.0 (mailto:{mailto or 'n/a'})"})

    def search(self, query: str, limit: int = 100) -> list[dict]:
        params = {"query.bibliographic": query, "rows": min(limit, 1000), "select": SELECT_FIELDS}
        if self.mailto:
            params["mailto"] = self.mailto
        response = get_with_retry(self.client, "https://api.crossref.org/works", params)
        return response.json().get("message", {}).get("items", [])

    def search_in_venue(self, query: str, venue: str, limit: int = 100) -> list[dict]:
        """Search topic and container independently for high-precision venue sweeps."""

        params = {
            "query.title": query,
            "query.container-title": venue,
            "rows": min(limit, 1000),
            "select": SELECT_FIELDS,
        }
        if self.mailto:
            params["mailto"] = self.mailto
        response = get_with_retry(self.client, "https://api.crossref.org/works", params)
        return response.json().get("message", {}).get("items", [])

    def work(self, doi: str) -> dict:
        """One work by DOI, trimmed to the searched fields (this route has no ``select``)."""

        params = {"mailto": self.mailto} if self.mailto else None
        response = get_with_retry(self.client, f"https://api.crossref.org/works/{quote(doi, safe='/')}", params)
        message = response.json().get("message", {})
        return {key: message[key] for key in SELECT_FIELDS.split(",") if key in message}
