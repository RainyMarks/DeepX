from __future__ import annotations

import time
from typing import Iterable

import httpx


DEFAULT_QUERIES = [
    "AI generated image detection",
    "synthetic image detection forensics",
    "GAN generated image detection",
    "diffusion generated image detection",
    "generated image source attribution",
    "generator attribution synthetic images",
    "deepfake image detection",
    "face manipulation detection",
    "image forgery detection",
    "image forgery localization",
    "copy move image forgery detection",
    "image splicing detection",
    "scene text image forgery detection",
    "document image text tampering detection",
    "image provenance watermark verification",
    "C2PA image verification",
]


class OpenAlexSource:
    name = "openalex"
    endpoint = "https://api.openalex.org/works"

    def __init__(self, api_key: str = "", mailto: str = "", timeout: float = 30.0):
        self.api_key = api_key
        self.mailto = mailto
        self.client = httpx.Client(timeout=timeout, follow_redirects=True, headers={"User-Agent": "SyntheticImageForensicsAtlas/2.0"})

    def search(self, query: str, limit: int = 100) -> list[dict]:
        return list(self.iter_search(query, limit))

    def iter_search(self, query: str, limit: int = 100) -> Iterable[dict]:
        cursor = "*"
        received = 0
        while received < limit:
            per_page = min(200, limit - received)
            params = {"search": query, "per-page": per_page, "cursor": cursor}
            if self.mailto:
                params["mailto"] = self.mailto
            if self.api_key:
                params["api_key"] = self.api_key
            response = self.client.get(self.endpoint, params=params)
            response.raise_for_status()
            payload = response.json()
            results = payload.get("results", [])
            if not results:
                break
            for record in results:
                yield record
                received += 1
                if received >= limit:
                    break
            cursor = payload.get("meta", {}).get("next_cursor")
            if not cursor:
                break
            time.sleep(0.12)

    def fetch_institutions(self, openalex_ids: list[str]) -> list[dict]:
        output: list[dict] = []
        for start in range(0, len(openalex_ids), 50):
            batch = openalex_ids[start : start + 50]
            ids = "|".join(item.rsplit("/", 1)[-1] for item in batch)
            params = {"filter": f"openalex_id:{ids}", "per-page": 200}
            if self.mailto:
                params["mailto"] = self.mailto
            if self.api_key:
                params["api_key"] = self.api_key
            response = self.client.get("https://api.openalex.org/institutions", params=params)
            response.raise_for_status()
            output.extend(response.json().get("results", []))
            time.sleep(0.12)
        return output


def inverted_abstract(value: dict | None) -> str:
    if not value:
        return ""
    positions: list[tuple[int, str]] = []
    for word, indices in value.items():
        positions.extend((index, word) for index in indices)
    return " ".join(word for _, word in sorted(positions))
