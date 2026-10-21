import json

import httpx
import pytest
import respx

from atlas import builder, collector
from atlas.sources.base import get_with_retry


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _seconds: None)


@respx.mock
def test_get_with_retry_backs_off_on_rate_limits():
    route = respx.get("https://api.example.org/works").mock(
        side_effect=[httpx.Response(429, headers={"retry-after": "1"}), httpx.Response(503), httpx.Response(200, json={"ok": True})]
    )
    with httpx.Client() as client:
        response = get_with_retry(client, "https://api.example.org/works")
    assert response.json() == {"ok": True}
    assert route.call_count == 3


@respx.mock
def test_get_with_retry_does_not_wait_out_exhausted_quotas():
    respx.get("https://api.example.org/works").mock(return_value=httpx.Response(429, headers={"retry-after": "86400"}))
    with httpx.Client() as client, pytest.raises(httpx.HTTPStatusError):
        get_with_retry(client, "https://api.example.org/works")


class _FailingSource:
    name = "semantic_scholar"

    def __init__(self):
        self.calls = 0

    def search(self, query, limit=100):
        self.calls += 1
        raise RuntimeError("429 Too Many Requests")


class _WorkingSource:
    name = "crossref"

    def search(self, query, limit=100):
        return [{"DOI": f"10.1000/{abs(hash(query)) % 997}", "title": [query]}]


def test_repeated_errors_stop_one_source_without_stalling_the_others(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "RAW_DIR", tmp_path)
    failing, working = _FailingSource(), _WorkingSource()
    monkeypatch.setattr(collector, "SemanticScholarSource", lambda **_: failing)
    monkeypatch.setattr(collector, "CrossrefSource", lambda **_: working)
    report = collector.collect_secondary(5, {"semantic_scholar", "crossref"})
    assert failing.calls == collector.MAX_CONSECUTIVE_ERRORS
    assert report["stopped_early"] == {"semantic_scholar": "repeated errors"}
    assert report["source_counts"]["crossref"] > 0
    assert (tmp_path / "secondary_candidates.jsonl").exists()


def test_deadline_stops_collection_but_still_saves(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "RAW_DIR", tmp_path)
    monkeypatch.setenv("ATLAS_COLLECT_DEADLINE", "1")
    working = _WorkingSource()
    monkeypatch.setattr(collector, "CrossrefSource", lambda **_: working)
    report = collector.collect_secondary(5, {"crossref"})
    assert report["stopped_early"] == {"crossref": "deadline"}
    assert json.loads((tmp_path / "secondary_report.json").read_text(encoding="utf-8"))["records"] == 0


def test_crossref_candidates_become_classified_papers(tmp_path, monkeypatch):
    monkeypatch.setattr(builder, "RAW_DIR", tmp_path)
    envelope = {
        "source": "crossref",
        "query": "image forgery localization",
        "retrieved_at": "2026-10-21T00:00:00Z",
        "record": {
            "DOI": "10.1109/TIFS.2026.0001",
            "title": ["Copy-Move Forgery Localization with Transformers"],
            "abstract": "<jats:p>We localize copy-move forgeries in images.</jats:p>",
            "container-title": ["IEEE Transactions on Information Forensics and Security"],
            "ISSN": ["1556-6013"],
            "type": "journal-article",
            "published": {"date-parts": [[2026, 3]]},
            "author": [{"given": "Mei", "family": "Lin"}],
            "is-referenced-by-count": 3,
        },
    }
    (tmp_path / "secondary_candidates.jsonl").write_text(json.dumps(envelope) + "\n", encoding="utf-8")
    [paper] = builder.secondary_papers()
    assert paper.abstract.strip() == "We localize copy-move forgeries in images."
    assert paper.task_tags == ["image_forgery"]
    assert paper.venue and paper.venue.short_name == "TIFS" and paper.venue.rankings
    assert paper.review_status == "auto"
