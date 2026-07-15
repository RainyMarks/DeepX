from __future__ import annotations

import json
from atlas.builder import PUBLIC_DIR
from atlas.dedupe import canonical_arxiv, canonical_doi


class ValidationError(RuntimeError):
    pass


def validate_public(strict: bool = False) -> dict:
    manifest_path = PUBLIC_DIR / "manifest.json"
    catalog_path = PUBLIC_DIR / "catalog.json"
    if not manifest_path.exists() or not catalog_path.exists():
        raise ValidationError("公开数据尚未生成，请先运行 python -m atlas.cli publish")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    errors: list[str] = []
    warnings: list[str] = []
    if manifest.get("paper_count") != len(catalog):
        errors.append("manifest.paper_count 与 catalog 数量不一致")
    ids: set[str] = set()
    dois: set[str] = set()
    arxiv_ids: set[str] = set()
    for paper in catalog:
        if paper["id"] in ids:
            errors.append(f"重复 paper_id: {paper['id']}")
        ids.add(paper["id"])
        if not paper.get("title") or not paper.get("primary_url") or not paper.get("review_status"):
            errors.append(f"缺少公开必填字段: {paper.get('id')}")
        if not paper.get("sources"):
            errors.append(f"缺少稳定数据来源: {paper.get('id')}")
        if paper.get("review_status") not in {"verified", "auto"}:
            errors.append(f"非法公开审核状态: {paper.get('id')}")
        if not paper.get("task_tags"):
            errors.append(f"缺少任务标签: {paper.get('id')}")
        for ranking in (paper.get("venue") or {}).get("rankings", []):
            if not ranking.get("system") or not ranking.get("version") or not ranking.get("source_url") or not ranking.get("verified_at"):
                errors.append(f"等级缺少来源或版本: {paper.get('id')}")
    institutions_path = PUBLIC_DIR / "institutions.json"
    institutions = json.loads(institutions_path.read_text(encoding="utf-8")) if institutions_path.exists() else []
    for institution in institutions:
        latitude, longitude = institution.get("latitude"), institution.get("longitude")
        if latitude is None or longitude is None:
            continue
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            errors.append(f"机构坐标越界: {institution.get('id')}")
        if not institution.get("coordinate_source"):
            errors.append(f"机构坐标缺少来源: {institution.get('id')}")
    detail_records = []
    for path in (PUBLIC_DIR / "details").glob("*.json"):
        detail_records.extend(json.loads(path.read_text(encoding="utf-8")))
    for paper in detail_records:
        doi = canonical_doi(paper.get("doi", ""))
        arxiv_id = canonical_arxiv(paper.get("arxiv_id", ""))
        if doi:
            if doi in dois:
                errors.append(f"重复 DOI: {doi}")
            dois.add(doi)
        if arxiv_id:
            if arxiv_id in arxiv_ids:
                errors.append(f"重复 arXiv: {arxiv_id}")
            arxiv_ids.add(arxiv_id)
    if len(detail_records) != len(catalog):
        errors.append("详情分片与目录数量不一致")
    if manifest.get("paper_count", 0) < 1000:
        (errors if strict else warnings).append("公开论文数尚未达到 1000")
    if manifest.get("candidate_count", 0) < 2000:
        (errors if strict else warnings).append("候选池尚未达到 2000")
    if manifest.get("verified_paper_count", 0) < 300:
        (errors if strict else warnings).append("人工核验核心集尚未达到 300；不得用自动记录填充")
    if errors:
        raise ValidationError("；".join(errors[:20]))
    return {"ok": True, "paper_count": len(catalog), "verified_paper_count": manifest.get("verified_paper_count", 0), "warnings": warnings}
