from atlas.builder import apply_venue_ranking, authorized_papers


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
    for name in ("Pattern Recognition", "AI", "Information", "[]"):
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


def test_ccf_is_never_applied_to_journals():
    venue = apply_venue_ranking("IEEE Transactions on Pattern Analysis and Machine Intelligence", "journal")
    assert venue and not venue.rankings
    mismatched = apply_venue_ranking("AAAI Conference on Artificial Intelligence", "journal")
    assert mismatched and not mismatched.rankings


def test_common_journal_names_receive_searchable_short_names():
    venue = apply_venue_ranking("IEEE Transactions on Information Forensics and Security", "journal")
    assert venue and venue.short_name == "TIFS" and venue.rankings == []


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
