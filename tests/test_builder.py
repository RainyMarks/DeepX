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
