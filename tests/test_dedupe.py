from atlas.dedupe import canonical_arxiv, canonical_doi, stable_id


def test_identifier_normalization_is_stable():
    assert canonical_doi("https://doi.org/10.1000/ABC.") == "10.1000/abc"
    assert canonical_arxiv("https://arxiv.org/pdf/2401.01234v2.pdf") == "2401.01234"
    assert stable_id("One title", 2024, "10.1000/abc") == stable_id("Another title", 2025, "https://doi.org/10.1000/ABC")
