from __future__ import annotations

import httpx


class DblpSource:
    name = "dblp"

    def __init__(self, timeout: float = 30.0):
        self.client = httpx.Client(timeout=timeout, headers={"User-Agent": "SyntheticImageForensicsAtlas/2.0"})

    def search(self, query: str, limit: int = 100) -> list[dict]:
        response = self.client.get("https://dblp.org/search/publ/api", params={"q": query, "h": min(limit, 1000), "format": "json"})
        response.raise_for_status()
        hits = response.json().get("result", {}).get("hits", {}).get("hit", [])
        return [item.get("info", {}) for item in hits]
