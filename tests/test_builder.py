import json

from atlas import builder
from atlas.builder import _merge_exact, apply_venue_ranking, authorized_papers, load_rankings
from atlas.dedupe import stable_id
from atlas.models import Paper, Provenance


def test_authorized_seed_preserves_human_review_status():
    papers = authorized_papers()
    assert len(papers) >= 470
    assert sum(paper.review_status == "verified" for paper in papers) >= 180


def test_ccf_ranking_requires_curated_alias_match():
    cvpr = apply_venue_ranking("IEEE Conference on Computer Vision and Pattern Recognition", "conference")
    assert cvpr and cvpr.rankings and cvpr.rankings[0].system == "CCF" and cvpr.rankings[0].level == "A"
    unknown = apply_venue_ranking("Imaginary Symposium on Pixels", "conference")
    assert unknown and unknown.rankings == []


def test_short_or_partial_venue_names_never_inherit_a_ranking():
    for name in ("Pattern Matching", "AI", "Information", "[]"):
        venue = apply_venue_ranking(name)
        assert venue and not venue.rankings


def test_long_canonical_name_can_match_year_and_proceedings_wrappers():
    venue = apply_venue_ranking(
        "Proceedings of the 2025 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)"
    )
    assert venue and venue.rankings and venue.rankings[0].level == "A"


def test_workshops_and_findings_do_not_inherit_main_venue_rank():
    for name in (
        "2025 IEEE/CVF Conference on Computer Vision and Pattern Recognition Workshops",
        "2026 IEEE/CVF Conference on Computer Vision and Pattern Recognition Findings",
    ):
        venue = apply_venue_ranking(name)
        assert venue and not venue.rankings


def test_journals_receive_only_journal_rankings():
    venue = apply_venue_ranking("IEEE Transactions on Pattern Analysis and Machine Intelligence", "journal")
    assert venue and {ranking.system for ranking in venue.rankings} == {"CAS", "JCR"}
    # Names decide the venue type when a source mislabels it.
    mislabelled = apply_venue_ranking("IEEE Transactions on Pattern Analysis and Machine Intelligence", "conference")
    assert mislabelled and mislabelled.type == "journal"
    assert {ranking.system for ranking in mislabelled.rankings} == {"CAS", "JCR"}


def test_proceedings_filed_as_journals_are_conferences():
    venue = apply_venue_ranking("Proceedings of the AAAI Conference on Artificial Intelligence", "journal")
    assert venue and venue.type == "conference"
    assert [(ranking.system, ranking.level) for ranking in venue.rankings] == [("CCF", "A")]
    assert apply_venue_ranking("arXiv (Cornell University)", "unknown").type == "preprint"
    assert apply_venue_ranking("Proceedings of the IEEE", "journal").type == "journal"


def test_common_journal_names_receive_searchable_short_names():
    venue = apply_venue_ranking("IEEE Transactions on Information Forensics and Security", "journal")
    assert venue and venue.short_name == "TIFS"
    assert [(ranking.system, ranking.level, ranking.is_top) for ranking in venue.rankings] == [
        ("CAS", "1", True),
        ("JCR", "Q1", False),
    ]


def test_all_curated_journals_use_audited_2025_large_categories():
    expected = {
        "TIFS": ("1", True),
        "TCSVT": ("1", True),
        "TMM": ("1", True),
        "TIP": ("1", True),
        "TPAMI": ("1", True),
        "PR": ("1", True),
        "IF": ("1", True),
        "ESWA": ("1", True),
        "KBS": ("1", True),
        "TDSC": ("2", True),
        "IJCV": ("2", False),
        "INS": ("2", False),
        "NN": ("2", True),
        "EAAI": ("1", True),
        "IoTJ": ("2", True),
        "Neurocomputing": ("2", False),
        "Signal Processing": ("2", False),
        "CVIU": ("3", False),
        "SPL": ("3", False),
        "SPIC": ("3", False),
        "JISA": ("3", False),
        "IEEE Access": ("4", False),
        "JVCIR": ("4", False),
    }
    journals = [item for item in load_rankings() if item.get("type") == "journal"]
    actual = {}
    for item in journals:
        [cas] = [ranking for ranking in item["rankings"] if ranking["system"] == "CAS"]
        assert cas["version"] == "2025" and cas["scope"] == "大类" and cas["level"] in {"1", "2", "3", "4"}
        for jcr in (ranking for ranking in item["rankings"] if ranking["system"] == "JCR"):
            assert jcr["version"] == "2026" and jcr["level"] in {"Q1", "Q2", "Q3", "Q4"}
        assert {ranking["system"] for ranking in item["rankings"]} <= {"CAS", "JCR"}
        assert all("iikx.com" in ranking["source_url"] for ranking in item["rankings"])
        actual[item["short_name"] or item["name"]] = (cas["level"], cas["is_top"])
    assert expected.items() <= actual.items()
    assert len({item["id"] for item in journals}) == len(journals)


def test_journal_titles_match_exactly_but_tolerate_openalex_print_suffixes():
    lookalike = apply_venue_ranking("International Journal of Computer Vision and Image Processing", "journal")
    assert lookalike and lookalike.rankings == []
    lookalike = apply_venue_ranking("International Journal of Intelligent Systems and Applications in Engineering", "journal")
    assert lookalike and lookalike.rankings == []
    print_edition = apply_venue_ranking("IEEE transactions on circuits and systems for video technology (Print)", "journal")
    assert print_edition and print_edition.short_name == "TCSVT" and print_edition.rankings
    doubled = apply_venue_ranking("Computers, materials & continua/Computers, materials & continua (Print)", "journal")
    assert doubled and doubled.short_name == "CMC" and doubled.rankings[0].level == "4"


def test_journal_name_variants_share_one_venue():
    colon = apply_venue_ranking("Signal Processing: Image Communication", "journal")
    plain = apply_venue_ranking("Signal Processing Image Communication", "journal")
    assert colon and plain and colon.id == plain.id == "venue-spic"
    assert apply_venue_ranking("Signal Processing", "journal").id == "venue-signal-processing"
    assert apply_venue_ranking("Digital Signal Processing", "journal").id == "venue-dsp"
    by_issn = apply_venue_ranking("Journal of Information Security & Applications", "journal", "2214-2126")
    assert by_issn and by_issn.short_name == "JISA"
    unranked = apply_venue_ranking("Multimedia Tools and Applications", "journal")
    assert unranked and unranked.rankings == [] and unranked.short_name == "MTAP"


def test_neurips_proceedings_are_conferences():
    venue = apply_venue_ranking("Advances in Neural Information Processing Systems 37", "journal")
    assert venue and venue.type == "conference"
    assert [(ranking.system, ranking.level) for ranking in venue.rankings] == [("CCF", "A")]


def test_security_ccf_a_conferences_are_curated_explicitly():
    for name in (
        "ACM Conference on Computer and Communications Security",
        "IEEE Symposium on Security and Privacy",
        "USENIX Security Symposium",
        "Network and Distributed System Security Symposium",
    ):
        venue = apply_venue_ranking(name, "conference")
        assert venue and venue.rankings and venue.rankings[0].system == "CCF"
        assert venue.rankings[0].level == "A"


def test_latest_ccf_catalog_treats_ijcai_as_b_and_iclr_as_a():
    ijcai = apply_venue_ranking("International Joint Conference on Artificial Intelligence", "conference")
    iclr = apply_venue_ranking("International Conference on Learning Representations", "conference")
    assert ijcai and ijcai.rankings[0].level == "B"
    assert iclr and iclr.rankings[0].level == "A"
    assert ijcai.rankings[0].version == "第七版（2026）"


def test_ccf_seventh_edition_signal_processing_multimedia_and_hiding_venues():
    expected = {
        "ICASSP 2026 - 2026 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP)": ("ICASSP", "B"),
        "Proceedings. (ICASSP '05). IEEE International Conference on Acoustics, Speech, and Signal Processing, 2005.": ("ICASSP", "B"),
        "2004 IEEE International Conference on Multimedia and Expo (ICME) (IEEE Cat. No.04TH8763)": ("ICME", "B"),
        "IEEE International Conference on Multimedia and Expo": ("ICME", "B"),
        "2008 15th IEEE International Conference on Image Processing": ("ICIP", "C"),
        "Proceedings 2000 International Conference on Image Processing (Cat. No.00CH37101)": ("ICIP", "C"),
        # IH&MMSec is a ranked workshop: its own name carries the marker.
        "Proceedings of the 2022 ACM Workshop on Information Hiding and Multimedia Security": ("IH&MMSec", "C"),
        "Proceedings of the ACM Workshop on Information Hiding and Multimedia Security - IH&amp;MMSec'19": ("IH&MMSec", "C"),
        "Information Hiding and Multimedia Security Workshop": ("IH&MMSec", "C"),
        "IH&amp;MMSec": ("IH&MMSec", "C"),
    }
    for name, (short_name, level) in expected.items():
        venue = apply_venue_ranking(name, "unknown")
        assert venue and venue.type == "conference" and venue.short_name == short_name, name
        assert [(item.system, item.level, item.version) for item in venue.rankings] == [("CCF", level, "第七版（2026）")], name
    assert apply_venue_ranking("IH&amp;MMSec").name == "IH&MMSec"


def test_conference_names_inside_other_conference_names_do_not_match():
    for name in (
        "2025 4th International Conference on Image Processing, Computer Vision and Machine Learning (ICICML)",
        "2024 IEEE Thirteenth International Conference on Image Processing Theory, Tools and Applications (IPTA)",
        "Proceedings of the 6th ACM International Conference on Multimedia in Asia",
        "Proceedings of the 2023 ACM International Conference on Multimedia Retrieval",
        "2020 19th IEEE International Conference on Machine Learning and Applications (ICMLA)",
        "2025 6th International Conference on Computer Vision, Image and Deep Learning (CVIDL)",
        "2025 IEEE 10th European Symposium on Security and Privacy (EuroS&amp;amp;P)",
        "2025 IEEE International Conference on Multimedia and Expo Workshops (ICMEW)",
    ):
        venue = apply_venue_ranking(name, "conference")
        assert venue and venue.rankings == [], name
    # Proceedings wrapping, and even a glued ordinal, around the full name still match.
    ijcai = apply_venue_ranking("Proceedings of the Thirty-ThirdInternational Joint Conference on Artificial Intelligence", "conference")
    assert ijcai and [(item.system, item.level) for item in ijcai.rankings] == [("CCF", "B")]
    mm = apply_venue_ranking("Proceedings of the ninth ACM international conference on Multimedia - MULTIMEDIA '01", "conference")
    assert mm and mm.short_name == "ACM MM" and mm.rankings[0].level == "A"


def test_escaped_venue_names_are_decoded_before_matching():
    venue = apply_venue_ranking("Computers, Materials &amp; Continua", "journal")
    assert venue and venue.name == "Computers, Materials & Continua" and venue.short_name == "CMC" and venue.rankings


def _record(year, *, source="crossref", doi="10.1016/j.ipm.2026.104992", venue="Information Processing & Management"):
    title = "Towards generalizable detection of AI-generated images"
    return Paper(
        id=stable_id(title, year, doi), title=title, year=year, doi=doi,
        venue=apply_venue_ranking(venue, "journal" if venue != "arXiv" else "preprint"),
        primary_url=f"https://doi.org/{doi}" if doi else "https://arxiv.org/abs/2601.00001",
        provenance=[Provenance(source=source, source_id=doi, retrieved_at="2026-10-01T00:00:00Z")],
    )


def test_formal_records_of_one_work_keep_the_earlier_year_in_any_order():
    for first, second in ((2027, 2026), (2026, 2027)):
        [merged] = _merge_exact([_record(first), _record(second, source="openalex")])
        assert merged.year == 2026
    # A preprint never moves the formal year back.
    formal, preprint = _record(2024), _record(2023, source="arxiv", doi="", venue="arXiv")
    formal.arxiv_id = preprint.arxiv_id = "2601.00001"
    [merged] = _merge_exact([formal, preprint])
    assert merged.year == 2024


def test_future_issue_crossref_articles_use_their_registration_year(tmp_path, monkeypatch):
    monkeypatch.setattr(builder, "RAW_DIR", tmp_path)
    record = {
        "DOI": "10.1016/j.sigpro.2026.110781",
        "title": ["Copy-Move Forgery Localization with Transformers"],
        "container-title": ["Signal Processing"],
        "type": "journal-article",
        "published": {"date-parts": [[2027, 1]]},
        "published-print": {"date-parts": [[2027, 1]]},
        "issued": {"date-parts": [[2027, 1]]},
        "created": {"date-parts": [[2026, 6, 20]]},
    }
    envelope = {"source": "crossref", "query": "q", "retrieved_at": "2026-10-21T00:00:00Z", "record": record}
    (tmp_path / "secondary_candidates.jsonl").write_text(json.dumps(envelope) + "\n", encoding="utf-8")
    [paper] = builder.secondary_papers()
    assert paper.year == 2026
