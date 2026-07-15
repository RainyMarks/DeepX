from __future__ import annotations

from typing import Protocol


class ScholarlySource(Protocol):
    name: str

    def search(self, query: str, limit: int = 100) -> list[dict]: ...
