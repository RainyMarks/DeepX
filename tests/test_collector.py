import json
from datetime import UTC, datetime

import httpx
import pytest
import respx

from atlas import builder, collector
from atlas.sources.base import get_with_retry


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _seconds: None)


@pytest.fixture(autouse=True)
def no_release(tmp_path, monkeypatch):
    # Collector tests must not look up the papers of the real public release.
    monkeypatch.setattr(collector, "PUBLIC_DIR", tmp_path / "no-release")


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


def test_crossref_year_uses_first_appearance_and_registration_year():
    from atlas.sources.crossref import crossref_year

    # A future issue with no online date: the DOI was registered in 2025.
    future_issue = {"published": {"date-parts": [[2027]]}, "published-print": {"date-parts": [[2027]]},
                    "issued": {"date-parts": [[2027]]}, "created": {"date-parts": [[2025, 9, 20]]}}
    assert crossref_year(future_issue) == 2025
    online_first = {"published-online": {"date-parts": [[2025, 11, 2]]}, "published-print": {"date-parts": [[2026, 1]]},
                    "issued": {"date-parts": [[2025, 11, 2]]}, "created": {"date-parts": [[2025, 10, 30]]}}
    assert crossref_year(online_first) == 2025
    # Records collected before the date fields were requested.
    assert crossref_year({"published": {"date-parts": [[2024, 3]]}}) == 2024
    assert crossref_year({"issued": {"date-parts": [[None]]}, "created": {"date-parts": [[2023, 1, 2]]}}) == 2023
    assert crossref_year({}) is None


class _RefreshingCrossref:
    name = "crossref"

    def __init__(self):
        self.looked_up = []

    def search(self, query, limit=100):
        return [{"DOI": "10.1000/known", "title": ["Known"], "is-referenced-by-count": 9}]

    def work(self, doi):
        self.looked_up.append(doi)
        return {"DOI": doi, "published-print": {"date-parts": [[2027]]}, "created": {"date-parts": [[2025, 9, 20]]}}


def _pool(tmp_path, *envelopes):
    (tmp_path / "secondary_candidates.jsonl").write_text("".join(json.dumps(item) + "\n" for item in envelopes), encoding="utf-8")


def test_refetched_candidates_refresh_fields_but_keep_their_provenance(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "RAW_DIR", tmp_path)
    monkeypatch.setattr(collector, "SECONDARY_QUERIES", ["image forgery"])
    _pool(tmp_path, {"source": "crossref", "query": "first query", "retrieved_at": "2026-07-01T00:00:00Z",
                     "record": {"DOI": "10.1000/known", "title": ["Known"], "abstract": "kept", "is-referenced-by-count": 1,
                                "created": {"date-parts": [[2025, 1, 1]]}}})
    stub = _RefreshingCrossref()
    monkeypatch.setattr(collector, "CrossrefSource", lambda **_: stub)
    report = collector.collect_secondary(5, {"crossref"})
    [stored] = [json.loads(line) for line in (tmp_path / "secondary_candidates.jsonl").read_text(encoding="utf-8").splitlines()]
    assert stored["record"]["is-referenced-by-count"] == 9 and stored["record"]["abstract"] == "kept"
    assert (stored["query"], stored["retrieved_at"]) == ("first query", "2026-07-01T00:00:00Z")
    assert report["new_records"] == 0 and stub.looked_up == []


def test_undated_crossref_candidates_are_looked_up_latest_first(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "RAW_DIR", tmp_path)
    monkeypatch.setattr(collector, "SECONDARY_QUERIES", [])
    next_year = datetime.now(UTC).year + 1
    issue_dated = {"DOI": "10.1504/ijesdf.next.1", "title": ["Forgery"], "published": {"date-parts": [[next_year]]}}
    older = {"DOI": "10.1000/older", "title": ["Older"], "published": {"date-parts": [[2019, 4]]}}
    dated = {"DOI": "10.1000/dated", "title": ["Dated"], "published": {"date-parts": [[2024]]}, "created": {"date-parts": [[2024, 2, 1]]}}
    _pool(tmp_path, *({"source": "crossref", "query": "q", "retrieved_at": "2026-07-01T00:00:00Z", "record": row}
                      for row in (older, issue_dated, dated)))
    stub = _RefreshingCrossref()
    monkeypatch.setattr(collector, "CrossrefSource", lambda **_: stub)
    report = collector.collect_secondary(5, {"crossref"})
    # Undated records only, the latest issue year first; dated records are not asked again.
    assert stub.looked_up == ["10.1504/ijesdf.next.1", "10.1000/older"]
    assert report["refreshed_crossref_dates"] == 2 and report["undated_crossref_records"] == 0
    stored = {json.loads(line)["record"]["DOI"]: json.loads(line)["record"]
              for line in (tmp_path / "secondary_candidates.jsonl").read_text(encoding="utf-8").splitlines()}
    from atlas.sources.crossref import crossref_year
    assert crossref_year(stored["10.1504/ijesdf.next.1"]) == 2025
    assert stored["10.1504/ijesdf.next.1"]["title"] == ["Forgery"]

    records = {"a": {"source": "crossref", "record": dict(older)}, "b": {"source": "crossref", "record": dict(issue_dated)}}
    assert collector.refresh_undated_crossref_records(records, _RefreshingCrossref(), limit=1)["refreshed"] == 1
    assert "created" in records["b"]["record"] and "created" not in records["a"]["record"]


class _MissingDoiCrossref(_RefreshingCrossref):
    def work(self, doi):
        self.looked_up.append(doi)
        request = httpx.Request("GET", f"https://api.crossref.org/works/{doi}")
        raise httpx.HTTPStatusError("404 Not Found", request=request, response=httpx.Response(404, request=request))


def test_unresolvable_dois_are_marked_and_not_looked_up_again():
    records = {"a": {"source": "crossref", "record": {"DOI": "10.1000/gone", "published": {"date-parts": [[2024]]}}}}
    stub = _MissingDoiCrossref()
    result = collector.refresh_undated_crossref_records(records, stub)
    assert result["refreshed"] == 0 and result["errors"] == []
    assert records["a"]["date_lookup"] == "not found"
    collector.refresh_undated_crossref_records(records, stub)
    assert stub.looked_up == ["10.1000/gone"]


def test_released_papers_dated_this_year_or_later_are_looked_up_when_the_pool_lacks_them(tmp_path, monkeypatch):
    public = tmp_path / "public"
    (public / "details").mkdir(parents=True)
    (public / "catalog.json").write_text("[]", encoding="utf-8")
    next_year = datetime.now(UTC).year + 1

    def released(doi, year, source="crossref"):
        return {"id": f"paper-{doi[-2:]}", "title": doi, "doi": doi, "year": year, "provenance": [{"source": source}]}

    (public / "details" / "00.json").write_text(json.dumps([
        released("10.1504/ijesdf.x.01", next_year),
        released("10.1000/pooled.02", next_year),
        released("10.1000/old.03", 2019),
        released("10.48550/arxiv.04", next_year, source="arxiv"),
    ]), encoding="utf-8")
    monkeypatch.setattr(collector, "PUBLIC_DIR", public)
    records = {"crossref:10.1000/pooled.02": {"source": "crossref", "record": {"DOI": "10.1000/POOLED.02"}}}
    stub = _RefreshingCrossref()
    result = collector.lookup_released_crossref_dates(records, stub)
    assert stub.looked_up == ["10.1504/ijesdf.x.01"] and result["added"] == 1
    added = records["crossref:10.1504/ijesdf.x.01"]
    from atlas.sources.crossref import crossref_year
    assert added["query"] == "released paper date check" and crossref_year(added["record"]) == 2025
