from __future__ import annotations

import httpx

from atlas.sources.base import get_with_retry


class SemanticScholarSource:
    name = "semantic_scholar"

    def __init__(self, api_key: str = "", timeout: float = 30.0):
        headers = {"User-Agent": "SyntheticImageForensicsAtlas/2.0"}
        if api_key:
            headers["x-api-key"] = api_key
        self.client = httpx.Client(timeout=timeout, headers=headers)

    def search(self, query: str, limit: int = 100) -> list[dict]:
        fields = "paperId,title,abstract,year,authors,venue,publicationTypes,externalIds,url,citationCount"
        response = get_with_retry(self.client, "https://api.semanticscholar.org/graph/v1/paper/search/bulk", {"query": query, "fields": fields}, attempts=3)
        return response.json().get("data", [])[:limit]
