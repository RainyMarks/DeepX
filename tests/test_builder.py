from atlas.builder import apply_venue_ranking, authorized_papers, load_rankings


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
    mismatched = apply_venue_ranking("AAAI Conference on Artificial Intelligence", "journal")
    assert mismatched and not mismatched.rankings


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
    }
    journals = [item for item in load_rankings() if item.get("type") == "journal"]
    actual = {}
    for item in journals:
        cas = next(ranking for ranking in item["rankings"] if ranking["system"] == "CAS")
        jcr = next(ranking for ranking in item["rankings"] if ranking["system"] == "JCR")
        assert cas["version"] == "2025" and cas["scope"] == "大类"
        assert jcr["version"] == "2026" and jcr["level"] == "Q1"
        actual[item["short_name"]] = (cas["level"], cas["is_top"])
    assert actual == expected


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
