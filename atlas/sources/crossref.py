from __future__ import annotations

import httpx


class CrossrefSource:
    name = "crossref"

    def __init__(self, mailto: str = "", timeout: float = 30.0):
        self.mailto = mailto
        self.client = httpx.Client(timeout=timeout, headers={"User-Agent": f"SyntheticImageForensicsAtlas/2.0 (mailto:{mailto or 'n/a'})"})

    def search(self, query: str, limit: int = 100) -> list[dict]:
        params = {"query.bibliographic": query, "rows": min(limit, 1000), "select": "DOI,title,author,published,container-title,type,URL,is-referenced-by-count,ISSN"}
        if self.mailto:
            params["mailto"] = self.mailto
        response = self.client.get("https://api.crossref.org/works", params=params)
        response.raise_for_status()
        return response.json().get("message", {}).get("items", [])
