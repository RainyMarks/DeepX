from __future__ import annotations

import time
from typing import Iterable

import httpx


DEFAULT_QUERIES = [
    # AI-generated / synthetic-image detection and attribution
    "AI generated image detection",
    "AI generated image forensics",
    "fake image detection generative AI",
    "synthetic image detection forensics",
    "synthetic image detector generalization",
    "GAN generated image detection",
    "GAN image forensics",
    "diffusion generated image detection",
    "diffusion image forensics",
    "text to image detection forensics",
    "universal fake image detection",
    "generalizable AI generated image detection",
    "AI generated image detection benchmark",
    "AIGC image detection",
    "generated image source attribution",
    "generator attribution synthetic images",
    "generated image model attribution",
    "diffusion model attribution images",
    "GAN source identification images",
    "origin attribution generated images",
    "generative model fingerprint images",
    "synthetic image provenance verification",

    # Face manipulation and general image tampering
    "deepfake image detection",
    "deepfake image forensics",
    "face manipulation detection",
    "facial image manipulation detection",
    "face swap image detection",
    "face morphing attack detection",
    "image forgery detection",
    "image forgery localization",
    "image manipulation detection localization",
    "copy move image forgery detection",
    "image splicing detection",
    "image inpainting detection forensics",
    "object removal image forgery detection",
    "image retouching detection forensics",

    # Scene text and document-image tampering
    "scene text image forgery detection",
    "scene text tampering detection localization",
    "text tampering localization image",
    "image text manipulation detection",
    "document image text tampering detection",
    "document image forgery detection",
    "text replacement image forgery detection",

    # Provenance and credentials
    "image provenance watermark verification",
    "image provenance verification",
    "C2PA image verification",
    "content credentials image authenticity",

    # Image steganalysis
    "image steganalysis detection",
    "deep learning image steganalysis",
    "image steganography detection benchmark",
    "cover stego image classification",
    "JPEG image steganalysis",
    "spatial image steganalysis",
    "adaptive image steganalysis",

    # Digital image watermarking
    "digital image watermarking authentication",
    "image watermark detection robustness",
    "fragile watermark image tamper localization",
    "deep learning image watermarking",
    "neural image watermarking",
    "robust invisible image watermarking",
    "invisible watermark generated image detection",
    "diffusion model watermarking provenance",
    "generative image watermarking provenance",
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
            response = None
            for attempt in range(7):
                response = self.client.get(self.endpoint, params=params)
                if response.status_code != 429:
                    response.raise_for_status()
                    break
                retry_after = response.headers.get("retry-after", "")
                try:
                    delay = float(retry_after)
                except ValueError:
                    delay = min(30.0, 1.5 * (2**attempt))
                # A multi-hour Retry-After means the anonymous daily budget is
                # exhausted. Let the collector record the failed query instead
                # of making an interactive run appear hung until midnight UTC.
                if delay > 120:
                    response.raise_for_status()
                time.sleep(max(1.5, delay))
            else:
                assert response is not None
                response.raise_for_status()
            assert response is not None
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
            time.sleep(0.4)

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
