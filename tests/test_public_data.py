import json

from atlas.builder import PUBLIC_DIR
from atlas.validation import validate_public


def test_public_preview_exceeds_reference_scale_without_faking_review():
    result = validate_public(strict=False)
    assert result["paper_count"] >= 1000
    assert result["verified_paper_count"] < result["paper_count"]


def test_every_public_ranking_has_provenance():
    catalog = json.loads((PUBLIC_DIR / "catalog.json").read_text(encoding="utf-8"))
    for paper in catalog:
        for ranking in (paper.get("venue") or {}).get("rankings", []):
            assert ranking["version"] and ranking["source_url"]


def test_quality_report_is_truthful_and_matches_release():
    manifest = json.loads((PUBLIC_DIR / "manifest.json").read_text(encoding="utf-8"))
    quality = json.loads((PUBLIC_DIR / "quality.json").read_text(encoding="utf-8"))
    assert quality["public_paper_count"] == manifest["paper_count"]
    assert quality["verified_paper_count"] == manifest["verified_paper_count"]
    assert quality["quality_targets"]["candidate_2000"] is True
    assert quality["quality_targets"]["public_1000"] is True
    assert quality["quality_targets"]["human_verified_300"] is False
