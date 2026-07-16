from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path


def iter_jsonl(path: Path) -> Iterator[dict]:
    """Read JSONL by physical newlines, preserving Unicode line separators in strings."""

    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)
