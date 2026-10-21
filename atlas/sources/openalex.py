from __future__ import annotations

import time
from collections.abc import Iterable

import httpx

from atlas.sources.base import get_with_retry

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
    "AI generated image detector robustness",
    "AI generated image detector generalization",
    "AI generated image detection in the wild",
    "AI generated image detection adversarial attack",
    "AI generated image detection survey",
    "multimodal AI generated image detection",
    "GAN fingerprint image attribution",
    "diffusion fingerprint source attribution",
    "generator identification generated images",
    "which generator created this image",

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
    "image resampling detection forensics",
    "double JPEG compression detection forensics",
    "contrast enhancement image forensics",
    "image seam carving detection",
    "image composition harmonization detection forensics",
    "face morphing attack detection benchmark",
    "partial face manipulation detection",

    # Scene text and document-image tampering
    "scene text image forgery detection",
    "scene text tampering detection localization",
    "text tampering localization image",
    "image text manipulation detection",
    "document image text tampering detection",
    "document image forgery detection",
    "text replacement image forgery detection",
    "scene text editing detection forensics",
    "scene text erasure detection forensics",
    "text insertion deletion image tampering detection",
    "document text replacement forgery localization",

    # Provenance and credentials
    "image provenance watermark verification",
    "image provenance verification",
    "C2PA image verification",
    "content credentials image authenticity",
    "content authenticity initiative image provenance",
    "media provenance image authenticity verification",
    "image provenance graph verification",
    "image content credential tamper detection",

    # Image steganalysis
    "image steganalysis detection",
    "deep learning image steganalysis",
    "image steganography detection benchmark",
    "cover stego image classification",
    "JPEG image steganalysis",
    "spatial image steganalysis",
    "adaptive image steganalysis",
    "rich model image steganalysis",
    "cover source mismatch image steganalysis",
    "deep residual network image steganalysis",
    "adversarial image steganalysis",
    "steganalysis spatial rich models",
    "steganalysis WOW S UNIWARD J UNIWARD",

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
    "reversible data hiding image authentication",
    "zero watermark image authentication",
    "watermark removal attack image",
    "watermark detection generated images",
    "semantic image watermarking authentication",
    "image watermarking survey",

    # 2024-2026 vocabulary and under-covered tracks
    "AIGI detection",
    "AI-generated image detection CLIP",
    "AI-generated image detection vision language model",
    "multimodal large language model AI-generated image detection",
    "explainable AI-generated image detection",
    "zero-shot AI-generated image detection",
    "training-free AI-generated image detection",
    "AI-generated image detection frequency artifacts",
    "diffusion generated image detection reconstruction error",
    "latent diffusion generated image detection",
    "detecting images generated by text-to-image models",
    "fake image detection unseen generators generalization",
    "AI-generated face image detection",
    "synthetic image detection robustness compression social media",
    "partially AI-generated image localization",
    "AIGC image forgery localization",
    "human perception of AI-generated images detection",
    "text-to-image model attribution",
    "open-set model attribution generated images",
    "generative model fingerprinting",
    "diffusion model fingerprint attribution",
    "face forgery detection generalization",
    "face forgery localization",
    "deepfake detection frequency domain",
    "deepfake image detection vision transformer",
    "single image morphing attack detection",
    "differential morphing attack detection",
    "deepfake detection adversarial robustness",
    "multimodal large language model deepfake detection",
    "explainable face forgery detection",
    "image manipulation localization transformer",
    "image forgery localization noise inconsistency",
    "copy-move forgery localization deep learning",
    "image tampering localization dataset",
    "diffusion-based image editing detection",
    "explainable image forgery detection multimodal large language model",
    "image forensics social network robustness",
    "scientific image manipulation detection",
    "medical image tampering detection",
    "document tampering detection localization",
    "tampered text detection document images",
    "receipt forgery detection",
    "certificate forgery detection image",
    "identity document forgery detection",
    "text image forgery localization",
    "image provenance analysis",
    "AI-generated image watermark verification",
    "diffusion model watermarking",
    "tree-ring watermark diffusion",
    "watermark removal attack generative",
    "content provenance authenticity generative AI",
    "deep learning image steganalysis network",
    "JPEG steganalysis deep learning",
    "generative image steganography",
    "coverless image steganography",
    "adversarial image steganography",
    "deep learning image steganography",
    "screen-shooting resilient image watermarking",
    "print-camera resilient watermarking",
    "invertible neural network image watermarking",
    "semi-fragile watermarking tamper localization",
    "robust zero-watermarking image",
    "medical image watermarking",
]


# High-quality venue sweeps are deliberately represented as search queries, not
# as ranking assertions. Conference badges come only from the curated CCF file;
# CAS/JCR badges still require an authorized year-specific import.
PRIORITY_VENUE_TASKS = {
    # CCF-A conferences relevant to vision, multimedia and security.
    "CVPR": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
        "image watermarking", "image steganalysis",
    ),
    "ICCV": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
        "image watermarking", "image steganalysis",
    ),
    "AAAI": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
        "image watermarking", "image steganalysis",
    ),
    "NeurIPS": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "image provenance verification", "generative image watermarking",
    ),
    "ICML": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "image provenance verification", "generative image watermarking",
    ),
    "ICLR": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "image provenance verification", "generative image watermarking",
    ),
    "ACM Multimedia": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
        "image watermarking", "image steganalysis",
    ),
    "ACM CCS": (
        "AI generated image detection", "deepfake image detection", "image provenance verification",
        "content credentials image", "image watermarking", "image steganalysis",
    ),
    "IEEE Symposium on Security and Privacy": (
        "AI generated image detection", "deepfake image detection", "image provenance verification",
        "content credentials image", "image watermarking", "image steganalysis",
    ),
    "USENIX Security": (
        "AI generated image detection", "deepfake image detection", "image provenance verification",
        "content credentials image", "image watermarking", "image steganalysis",
    ),
    "NDSS": (
        "AI generated image detection", "deepfake image detection", "image provenance verification",
        "content credentials image", "image watermarking", "image steganalysis",
    ),
    "SIGGRAPH": (
        "AI generated image detection", "generated image source attribution", "image provenance verification",
        "image watermarking",
    ),

    # Priority journal sweeps. These names improve recall only and do not imply
    # a CAS or JCR value in the public dataset.
    "IEEE Transactions on Information Forensics and Security TIFS": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
        "image watermarking", "image steganalysis",
    ),
    "IEEE Transactions on Pattern Analysis and Machine Intelligence": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
    ),
    "IEEE Transactions on Image Processing": (
        "AI generated image detection", "deepfake image detection", "image forgery localization",
        "scene text image forgery", "image provenance verification", "image watermarking", "image steganalysis",
    ),
    "IEEE Transactions on Multimedia": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
        "image watermarking", "image steganalysis",
    ),
    "IEEE Transactions on Circuits and Systems for Video Technology": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
        "image watermarking", "image steganalysis",
    ),
    "IEEE Transactions on Dependable and Secure Computing": (
        "AI generated image detection", "deepfake image detection", "image provenance verification",
        "content credentials image", "image watermarking", "image steganalysis",
    ),
    "International Journal of Computer Vision": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
    ),
    "Pattern Recognition": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image watermarking", "image steganalysis",
    ),
    "Information Fusion": (
        "AI generated image detection", "generated image source attribution", "deepfake image detection",
        "image forgery localization", "scene text image forgery", "image provenance verification",
    ),
    "European Conference on Computer Vision": (
        "AI generated image detection", "deepfake image detection", "image forgery localization", "image watermarking",
    ),
    "IEEE Signal Processing Letters": (
        "AI generated image detection", "deepfake image detection", "image forgery localization",
        "image watermarking", "image steganalysis",
    ),
    "ACM Workshop on Information Hiding and Multimedia Security": (
        "AI generated image detection", "deepfake image detection", "image forgery detection",
        "image watermarking", "image steganalysis",
    ),
    "IEEE International Workshop on Information Forensics and Security": (
        "AI generated image detection", "deepfake image detection", "image forgery detection",
        "image watermarking", "image steganalysis",
    ),
    "IEEE International Conference on Acoustics, Speech and Signal Processing": (
        "AI generated image detection", "deepfake image detection", "image forgery localization",
        "image watermarking", "image steganalysis",
    ),
    "IEEE International Conference on Image Processing": (
        "AI generated image detection", "deepfake image detection", "image forgery localization",
        "image watermarking", "image steganalysis",
    ),
    "IEEE International Conference on Multimedia and Expo": (
        "AI generated image detection", "deepfake image detection", "image forgery localization",
        "image watermarking", "image steganalysis",
    ),
    "ACM Transactions on Multimedia Computing, Communications, and Applications": (
        "AI generated image detection", "deepfake image detection", "image forgery localization",
        "image watermarking", "image steganalysis",
    ),
    "IEEE Transactions on Biometrics, Behavior, and Identity Science": (
        "deepfake image detection", "face morphing attack detection", "face forgery detection",
    ),
    "Computers & Security": (
        "AI generated image detection", "deepfake image detection", "image forgery detection",
        "image watermarking", "image steganalysis",
    ),
    "Forensic Science International: Digital Investigation": (
        "AI generated image detection", "deepfake image detection", "image forgery detection", "image steganalysis",
    ),
    "Journal of Information Security and Applications": (
        "AI generated image detection", "deepfake image detection", "image forgery detection",
        "image watermarking", "image steganalysis",
    ),
    "Signal Processing": (
        "image forgery detection", "image watermarking", "image steganalysis",
    ),
    "Neurocomputing": (
        "AI generated image detection", "deepfake image detection", "image forgery localization", "image watermarking",
    ),
    "Expert Systems with Applications": (
        "AI generated image detection", "deepfake image detection", "image forgery detection", "image watermarking",
    ),
    "Knowledge-Based Systems": (
        "AI generated image detection", "deepfake image detection", "image forgery detection",
    ),
    "Engineering Applications of Artificial Intelligence": (
        "AI generated image detection", "deepfake image detection", "image forgery detection", "image watermarking",
    ),
}

PRIORITY_VENUE_QUERIES = [
    f"{task} {venue}"
    for venue, tasks in PRIORITY_VENUE_TASKS.items()
    for task in tasks
]

COLLECTION_QUERIES = list(dict.fromkeys([*DEFAULT_QUERIES, *PRIORITY_VENUE_QUERIES]))


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
            response = get_with_retry(self.client, "https://api.openalex.org/institutions", params)
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
