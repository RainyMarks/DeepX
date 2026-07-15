from __future__ import annotations

import json
import re
from atlas.builder import CURATED_DIR, PUBLIC_DIR
from atlas.models import utc_now


OUT_OF_SCOPE = re.compile(
    r"\b(?:audio|video|speech|text generation|language model|pure ocr|camera model|camera identification|tomato plant disease)\b|"
    r"音频|视频|语音|文本生成|纯 ?ocr|相机型号|番茄病害",
    re.IGNORECASE,
)


def bulk_review() -> dict[str, int]:
    catalog_path = PUBLIC_DIR / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    decision_path = CURATED_DIR / "review_decisions.jsonl"
    decisions: dict[str, dict] = {}
    if decision_path.exists():
        for line in decision_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                item = json.loads(line)
                decisions[item["paper_id"]] = item

    counts = {"verified": 0, "rejected": 0, "skipped": 0}
    for paper in catalog:
        if paper.get("review_status") != "auto" or paper["id"] in decisions:
            counts["skipped"] += 1
            continue
        text = " ".join([paper.get("title", ""), paper.get("abstract_excerpt", ""), " ".join(paper.get("task_tags", []))])
        has_source = bool(paper.get("primary_url") and paper.get("sources"))
        if not has_source or OUT_OF_SCOPE.search(text):
            status = "rejected"
            note = "快速批量核验：缺少稳定来源或命中明确非图像取证主题，排除。"
        else:
            status = "verified"
            note = "快速批量核验：已有稳定来源，且现有任务标签与图像取证范围一致。"
        decisions[paper["id"]] = {
            "paper_id": paper["id"],
            "status": status,
            "reviewer": "local_maintainer",
            "note": note,
            "task_tags": [],
            "decided_at": utc_now(),
        }
        counts[status] += 1

    decision_path.parent.mkdir(parents=True, exist_ok=True)
    decision_path.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in decisions.values()), encoding="utf-8")
    return counts
