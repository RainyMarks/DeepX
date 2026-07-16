import json

from atlas.jsonl import iter_jsonl


def test_jsonl_reader_preserves_unicode_line_separator_inside_string(tmp_path):
    path = tmp_path / "records.jsonl"
    rows = [{"title": "first\u2028line"}, {"title": "second"}]
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")

    assert list(iter_jsonl(path)) == rows
