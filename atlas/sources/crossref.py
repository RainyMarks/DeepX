from __future__ import annotations

import httpx

from atlas.sources.base import get_with_retry


class CrossrefSource:
    name = "crossref"

    def __init__(self, mailto: str = "", timeout: float = 30.0):
        self.mailto = mailto
        self.client = httpx.Client(timeout=timeout, headers={"User-Agent": f"SyntheticImageForensicsAtlas/2.0 (mailto:{mailto or 'n/a'})"})

    def search(self, query: str, limit: int = 100) -> list[dict]:
        params = {"query.bibliographic": query, "rows": min(limit, 1000), "select": "DOI,title,author,published,container-title,type,URL,is-referenced-by-count,ISSN,abstract"}
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
            "select": "DOI,title,author,published,container-title,type,URL,is-referenced-by-count,ISSN,abstract",
        }
        if self.mailto:
            params["mailto"] = self.mailto
        response = get_with_retry(self.client, "https://api.crossref.org/works", params)
        return response.json().get("message", {}).get("items", [])
