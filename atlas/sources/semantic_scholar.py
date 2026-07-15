from __future__ import annotations

import httpx


class SemanticScholarSource:
    name = "semantic_scholar"

    def __init__(self, api_key: str = "", timeout: float = 30.0):
        headers = {"User-Agent": "SyntheticImageForensicsAtlas/2.0"}
        if api_key:
            headers["x-api-key"] = api_key
        self.client = httpx.Client(timeout=timeout, headers=headers)

    def search(self, query: str, limit: int = 100) -> list[dict]:
        fields = "paperId,title,abstract,year,authors,venue,publicationTypes,externalIds,url,citationCount"
        response = self.client.get("https://api.semanticscholar.org/graph/v1/paper/search/bulk", params={"query": query, "fields": fields})
        response.raise_for_status()
        return response.json().get("data", [])[:limit]
