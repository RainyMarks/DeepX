import json

from atlas.release import (
    PUBLIC_DIR,
    detail_shard,
    normalize_institution_countries,
    pack_catalog,
    unpack_catalog,
)


def _entry(paper_id: str, venue_type: str, author_name: str = "Mei Lin") -> dict:
    return {
        "id": paper_id, "title": "Forgery localization", "title_zh": "", "year": 2025,
        "authors": [{"id": "author-a", "name": author_name}, {"id": "author-b", "name": "Jun Li"}],
        "institution_ids": [],
        "venue": {"id": "venue-tifs", "name": "IEEE TIFS", "short_name": "TIFS", "type": venue_type, "rankings": []},
        "task_tags": ["image_forgery"], "contribution_type": "method", "review_status": "verified",
        "primary_url": "https://example.com", "citation_count": 1, "sources": ["crossref"], "abstract_excerpt": "",
    }


def test_pack_stores_shared_venues_and_authors_once_and_round_trips():
    entries = [_entry("paper-01", "journal"), _entry("paper-02", "unknown", "M. Lin")]
    packed = pack_catalog(entries)
    assert len(packed["venues"]) == 1
    assert packed["venues"][0]["type"] == "journal"
    assert [paper["authors"] for paper in packed["papers"]] == [[0, 1], [2, 1]]
    assert "title_zh" not in packed["papers"][0]

    restored = unpack_catalog(json.loads(json.dumps(packed)))
    assert [item["authors"] for item in restored] == [item["authors"] for item in entries]
    assert all(item["venue"]["type"] == "journal" for item in restored)


def test_unpack_accepts_legacy_list_layout():
    entries = [_entry("paper-01", "journal")]
    assert unpack_catalog(entries) is entries


def test_country_codes_used_as_names_are_normalized():
    institutions = [
        {"country": "United States", "country_code": "US"},
        {"country": "US", "country_code": "US"},
        {"country": "", "country_code": "US"},
        {"country": "Atlantis", "country_code": ""},
    ]
    normalize_institution_countries(institutions)
    assert [item["country"] for item in institutions] == ["United States"] * 3 + ["Atlantis"]


def test_public_release_uses_fine_grained_detail_shards():
    manifest = json.loads((PUBLIC_DIR / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["schema_version"] == "2.0.0"
    assert len(manifest["detail_shards"]) > 16
    assert detail_shard("paper-8812c29105c8ab4e") == "4e"
    for shard in manifest["detail_shards"][:3]:
        records = json.loads((PUBLIC_DIR / "details" / f"{shard}.json").read_text(encoding="utf-8"))
        assert all(detail_shard(record["id"]) == shard for record in records)
