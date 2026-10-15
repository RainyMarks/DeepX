from atlas.identity import display_name, normalize_name, resolve_author_identities

NO_OVERRIDES = {"merge": [], "separate": []}


def _paper(paper_id: str, *authors: dict) -> dict:
    return {"id": paper_id, "task_tags": ["image_forgery"], "authors": list(authors)}


def _author(author_id: str, name: str, orcid: str = "", institutions: tuple[str, ...] = ()) -> dict:
    return {"id": author_id, "name": name, "orcid": orcid, "institution_ids": list(institutions)}


def test_names_normalize_case_punctuation_and_dblp_suffixes():
    assert display_name("Bin Li 0011") == "Bin Li"
    assert normalize_name("Xin-Peng ZHANG") == normalize_name("Xinpeng Zhang") == "xinpengzhang"


def test_shared_orcid_merges_into_the_source_issued_id():
    records = [
        _paper("p1", _author("a5000000001", "Jessica Fridrich", "0000-0001")),
        _paper("p2", _author("author-abc", "J. Fridrich", "0000-0001")),
    ]
    result = resolve_author_identities(records, NO_OVERRIDES)
    assert result.aliases == {"author-abc": "a5000000001"}
    assert result.names["a5000000001"] == "Jessica Fridrich"


def test_same_name_and_institution_merges_but_name_alone_does_not():
    records = [
        _paper("p1", _author("a1", "Bin Li", institutions=("i-szu",))),
        _paper("p2", _author("a2", "Bin Li", institutions=("i-szu",))),
        _paper("p3", _author("a3", "Bin Li", institutions=("i-other",))),
    ]
    result = resolve_author_identities(records, NO_OVERRIDES)
    assert result.aliases == {"a2": "a1"}


def test_same_name_and_two_shared_coauthors_merges():
    records = [
        _paper("p1", _author("a1", "Wei Lu"), _author("x1", "Jiwu Huang"), _author("y1", "Hongmei Liu")),
        _paper("p2", _author("2001", "Wei Lu"), _author("x2", "Jiwu Huang"), _author("y2", "Hongmei Liu")),
        _paper("p3", _author("2002", "Wei Lu"), _author("x3", "Jiwu Huang"), _author("z", "Someone Else")),
    ]
    result = resolve_author_identities(records, NO_OVERRIDES)
    assert result.aliases.get("2001") == "a1"
    assert "2002" not in result.aliases


def test_conflicting_orcids_and_coauthorship_block_merges():
    records = [
        _paper("p1", _author("a1", "Xinpeng Zhang", "0000-0001", ("i-1",))),
        _paper("p2", _author("a2", "Xinpeng Zhang", "0000-0002", ("i-1",))),
        _paper("p3", _author("a3", "Yao Zhao", institutions=("i-2",)), _author("a4", "Yao Zhao", institutions=("i-2",))),
    ]
    assert resolve_author_identities(records, NO_OVERRIDES).aliases == {}


def test_curated_overrides_force_and_forbid_merges():
    records = [
        _paper("p1", _author("a1", "Li Wang", institutions=("i-1",))),
        _paper("p2", _author("a2", "Li Wang", institutions=("i-1",))),
        _paper("p3", _author("a3", "L. Wang")),
    ]
    result = resolve_author_identities(records, {"merge": [["a1", "a3"]], "separate": [["a1", "a2"]]})
    assert result.aliases == {"a3": "a1"}
