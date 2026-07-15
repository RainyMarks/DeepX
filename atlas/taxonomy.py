from __future__ import annotations

import re


TASK_LABELS = {
    "synthetic_detection": "生成/合成图像检测",
    "source_attribution": "生成来源归因与验证",
    "deepfake_detection": "深度伪造与人脸操纵",
    "image_forgery": "图像篡改检测与定位",
    "scene_text_forgery": "场景文本图像伪造",
    "content_provenance": "内容凭证与水印验证",
    "image_steganalysis": "图像隐写与隐写分析",
    "digital_watermarking": "数字图像水印与认证",
}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9+]+", " ", (value or "").lower())).strip()


def _matches(text: str, *patterns: str) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def _explicit_non_image_topic(title: str) -> bool:
    """Reject modalities which the atlas deliberately does not cover."""

    image = _matches(title, r"\bimages?\b", r"\bimagery\b", r"\bphotos?\b", r"\bphotograph", r"\bvisual\b")
    if _matches(title, r"\b(audio|speech|voice)\b"):
        return True
    joint_image_video = _matches(title, r"images?.{0,12}videos?", r"videos?.{0,12}images?")
    if _matches(title, r"\bvideos?\b", r"text to video") and not joint_image_video:
        return True
    if _matches(title, r"\btext\b.{0,30}(?:watermark|tamper|authentic)") and not _matches(
        title, r"scene text", r"text image", r"document image"
    ):
        return True
    if _matches(title, r"machine generated text", r"llm generated text", r"text generation detection") and not image:
        return True
    return False


def _strong_title_evidence(title: str) -> bool:
    image = _matches(
        title,
        r"\bimages?\b",
        r"\bimagery\b",
        r"\bphotos?\b",
        r"\bphotograph",
        r"\bvisual\b",
        r"\bartworks?\b",
        r"\bpictures?\b",
    )
    forensic = _matches(
        title,
        r"detect",
        r"forensic",
        r"\bfakes?\b",
        r"forg",
        r"tamper",
        r"manipulat",
        r"locali[sz]",
        r"authentic",
        r"attribut",
        r"verif",
        r"provenance",
        r"fingerprint",
        r"traceab",
        r"steganalysis",
        r"steganograph",
        r"watermark",
        r"recogn",
        r"distinguish",
        r"benchmark",
        r"dataset",
        r"survey",
        r"review",
    )
    synthetic = _matches(
        title,
        r"ai generated",
        r"\baigc\b",
        r"synthetic",
        r"gan generated",
        r"diffusion generated",
        r"diffusion images?",
        r"generated images?",
        r"generated imagery",
        r"generative ai",
        r"computer generated",
        r"text to image",
    )
    synthetic_forensic = _matches(
        title,
        r"detect",
        r"forensic",
        r"\bfakes?\b",
        r"attribut",
        r"authentic",
        r"verif",
        r"provenance",
        r"fingerprint",
        r"traceab",
        r"recogn",
        r"distinguish",
    )

    if image and synthetic and synthetic_forensic:
        return True
    if synthetic and _matches(
        title,
        r"image detect",
        r"image attribut",
        r"image origin",
        r"image forensic",
        r"image authentic",
        r"image source",
        r"image provenance",
        r"fake image",
        r"deepfake",
    ):
        return True
    if _matches(title, r"\bdeepfakes?\b", r"deep fakes?", r"face forgery", r"facial? manipulation", r"face swap") and _matches(
        title,
        r"detect",
        r"forensic",
        r"locali[sz]",
        r"benchmark",
        r"dataset",
        r"survey",
        r"review",
        r"attribut",
        r"analysis",
        r"recogn",
        r"assessment",
        r"generaliz",
        r"frequency",
    ):
        return True
    if _matches(title, r"copy move", r"image splic", r"face forgery") and _matches(
        title, r"detect", r"locali[sz]", r"forensic", r"benchmark", r"dataset", r"analysis", r"survey", r"review"
    ):
        return True
    if image and _matches(
        title,
        r"image forgery",
        r"image forgeries",
        r"forged image",
        r"image tamper",
        r"tampered image",
        r"image manipulation",
        r"manipulated image",
        r"image splicing",
        r"copy move",
    ) and forensic:
        return True
    if _matches(title, r"scene text", r"document image", r"text image", r"forged character", r"tampered text") and _matches(
        title, r"forg", r"tamper", r"locali[sz]", r"authentic", r"watermark"
    ):
        return True
    if _matches(title, r"\bsteganalysis\b", r"image steganograph", r"stego images?", r"cover stego") and _matches(
        title,
        r"images?",
        r"visual",
        r"digital",
        r"spatial",
        r"jpeg",
        r"deep learning",
        r"transformer",
        r"benchmark",
        r"dataset",
        r"survey",
        r"review",
        r"detect",
    ):
        return True
    if _matches(title, r"(?:digital |image |visual )watermark", r"watermarking.{0,24}images?", r"images?.{0,24}watermark") and _matches(
        title,
        r"detect",
        r"authentic",
        r"forensic",
        r"tamper",
        r"locali[sz]",
        r"robust",
        r"fragile",
        r"invisible",
        r"reversible",
        r"zero watermark",
        r"deep learning",
        r"neural",
        r"survey",
        r"review",
        r"benchmark",
    ):
        return True
    if _matches(title, r"\bc2pa\b", r"content credentials?") and _matches(
        title, r"image", r"visual", r"media", r"content", r"generated", r"authentic", r"provenance"
    ):
        return True
    if _matches(title, r"watermark") and _matches(
        title, r"ai generated", r"generated images?", r"diffusion", r"synthetic", r"deepfake", r"provenance", r"tamper", r"content credential"
    ):
        return True
    if _matches(title, r"provenance") and _matches(title, r"image", r"visual", r"digital media", r"generated", r"synthetic", r"c2pa", r"content") and _matches(
        title, r"verif", r"authentic", r"trust", r"credential", r"trace", r"chain", r"watermark"
    ):
        return True
    if _matches(title, r"attribut", r"fingerprint") and _matches(title, r"image", r"visual", r"generated", r"generative", r"generator") and _matches(
        title, r"source", r"model", r"generator", r"origin", r"synthetic", r"generated"
    ):
        return True
    if image and _matches(title, r"forensic") and _matches(title, r"detect", r"analysis", r"survey", r"review", r"authentic", r"forg", r"tamper", r"manipulat"):
        return True
    if image and _matches(title, r"\bfake images?\b") and _matches(title, r"detect", r"locali[sz]", r"forensic", r"attribut", r"benchmark"):
        return True
    return False


def _explicit_abstract_evidence(text: str) -> bool:
    """Rescue opaque method names only when the abstract states the task exactly."""

    return _matches(
        text,
        r"detect(?:ion|ing)? of ai generated images?",
        r"ai generated image detection",
        r"synthetic image detection",
        r"diffusion generated image detection",
        r"deepfake image detection",
        r"image forgery (?:detection|locali[sz]ation)",
        r"image manipulation (?:detection|locali[sz]ation)",
        r"copy move forgery detection",
        r"image splicing detection",
        r"generated image (?:source )?attribution",
        r"source attribution of (?:ai )?generated images?",
        r"scene text (?:forgery|tamper)",
        r"(?:forged|tampered) (?:scene text|document images?|text images?)",
        r"content credentials?.{0,80}(?:images?|visual|authentic|provenance)",
        r"\bc2pa\b.{0,80}(?:images?|visual|authentic|provenance)",
        r"(?:image |jpeg |spatial )?steganalysis",
        r"(?:detect|classif).{0,60}(?:stego|steganograph).{0,40}images?",
        r"(?:digital |image )watermark.{0,80}(?:detect|authentic|tamper|robust|forensic)",
    )


def is_in_scope(title: str, abstract: str = "") -> bool:
    title_text = normalize_text(title)
    if not title_text or _explicit_non_image_topic(title_text):
        return False
    if _matches(
        title_text,
        r"camera model identification",
        r"(?:image )?source camera attribution",
        r"camera source attribution",
        r"synthetic data.{0,50}(?:augmentation|training|segmentation|recognition)",
    ):
        return False
    if _matches(
        title_text,
        r"(?:generating|generation of) synthetic (?:training )?images?",
        r"synthetic (?:training )?images?.{0,45}(?:aid|improv|for|to).{0,45}(?:recognition|object detection|defect detection|classification|segmentation)",
    ) and not _matches(title_text, r"fake", r"forg", r"tamper", r"manipulat", r"deepfake"):
        return False
    if _strong_title_evidence(title_text):
        return True
    # Abstract-only rescue is intentionally limited to opaque method names
    # which still advertise a detector/forensics task in the title. This keeps
    # background mentions from admitting unrelated generation or unlearning work.
    weak_title_clue = _matches(
        title_text,
        r"detect",
        r"forensic",
        r"\bfakes?\b",
        r"forg",
        r"tamper",
        r"manipulat",
        r"locali[sz]",
        r"authentic",
        r"attribut",
        r"verif",
        r"provenance",
        r"watermark",
        r"steganalysis",
        r"steganograph",
        r"traceab",
    )
    return weak_title_clue and _explicit_abstract_evidence(normalize_text(f"{title} {abstract}"))


def classify_tasks(title: str, abstract: str = "") -> list[str]:
    body = normalize_text(f"{title} {abstract}")
    tags: list[str] = []
    if _matches(
        body,
        r"\bsteganalysis\b",
        r"image steganograph",
        r"stego images?",
        r"cover stego",
        r"steganographic image",
    ):
        tags.append("image_steganalysis")
    if _matches(
        body,
        r"(?:digital |image |visual |invisible |fragile |robust |reversible )watermark",
        r"watermarking.{0,32}(?:images?|visual|diffusion|generative)",
        r"(?:images?|visual|diffusion|generative).{0,32}watermark",
    ):
        tags.append("digital_watermarking")
    if _matches(
        body,
        r"(?:scene text|document images?|text images?).{0,45}(?:forg|tamper|manipulat)",
        r"(?:forg|tamper|manipulat).{0,45}(?:scene text|document images?|text images?)",
    ):
        tags.append("scene_text_forgery")
    if _matches(body, r"\bdeepfakes?\b", r"deep fakes?", r"face swap", r"facial? manipulation", r"face forgery"):
        tags.append("deepfake_detection")
    if _matches(
        body,
        r"(?:generated|generative|synthetic|generator|diffusion).{0,60}(?:source|model|origin) attribution",
        r"(?:source|model|origin) attribution.{0,60}(?:generated|generative|synthetic|generator|diffusion|images?)",
        r"generative model fingerprint",
    ):
        tags.append("source_attribution")
    if _matches(body, r"\bc2pa\b", r"content credentials?") or (
        _matches(body, r"watermark", r"provenance verification")
        and _matches(
            body,
            r"ai generated",
            r"generative",
            r"diffusion",
            r"synthetic",
            r"deepfake",
            r"content provenance",
            r"content credential",
        )
    ):
        tags.append("content_provenance")
    if _matches(
        body,
        r"copy move",
        r"image splicing",
        r"image forgery",
        r"image manipulation",
        r"image tamper",
        r"forged images?",
        r"tampered images?",
    ):
        tags.append("image_forgery")
    if _matches(
        body,
        r"ai generated.{0,24}images?",
        r"\baigc.{0,24}images?",
        r"synthetic(?: generated)?.{0,24}images?",
        r"gan generated.{0,24}images?",
        r"diffusion generated.{0,24}images?",
        r"computer generated images?",
    ):
        tags.append("synthetic_detection")
    if not tags and is_in_scope(title, abstract):
        tags.append("image_forgery")
    return list(dict.fromkeys(tags))


def contribution_type(title: str) -> str:
    text = normalize_text(title)
    if any(term in text for term in ("survey", "review", "taxonomy", "overview")):
        return "survey"
    if any(term in text for term in ("dataset", "corpus", "database")):
        return "dataset"
    if any(term in text for term in ("benchmark", "challenge", "competition")):
        return "benchmark"
    if any(term in text for term in ("analysis", "study", "evaluation", "rethinking", "investigating")):
        return "analysis"
    return "method"
