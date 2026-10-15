"""Conservative author identity resolution for the public release.

Sources identify authors differently: OpenAlex and Semantic Scholar provide
author ids, while Crossref, DBLP, arXiv and the seed data only provide names
(``author-<name hash>``). The same researcher therefore often appears under
several ids. This module merges ids only on strong evidence:

1. the same ORCID (ids that carry more than one ORCID are ambiguous and never
   used as ORCID evidence);
2. the same normalized name and a shared author-level institution;
3. the same normalized name and at least two shared coauthor names.

A merge is refused when the merged identity would carry two different ORCIDs
or when both ids sign the same paper. Same name alone is never enough: common
names such as "Bin Li" belong to many different people.

Maintainers can override decisions in ``data/curated/author_identity.json``::

    {"merge": [["id-a", "id-b"]], "separate": [["id-c", "id-d"]]}
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

OVERRIDES_PATH = Path(__file__).resolve().parents[1] / "data" / "curated" / "author_identity.json"
MIN_SHARED_COAUTHORS = 2
_DBLP_SUFFIX = re.compile(r"\s+\d{4}$")


def display_name(name: str) -> str:
    """Drop DBLP homonym suffixes such as "Bin Li 0011"."""
    return _DBLP_SUFFIX.sub("", " ".join(name.split()))


def normalize_name(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", display_name(name)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", ascii_name.lower())


def _id_rank(author_id: str) -> int:
    """Prefer source-issued ids (OpenAlex, then Semantic Scholar) over name hashes."""
    if re.fullmatch(r"a\d+", author_id):
        return 0
    if author_id.isdigit():
        return 1
    return 2


@dataclass
class _Profile:
    names: Counter[str] = field(default_factory=Counter)
    orcids: set[str] = field(default_factory=set)
    institutions: set[str] = field(default_factory=set)
    papers: set[str] = field(default_factory=set)
    coauthors: set[str] = field(default_factory=set)


@dataclass
class IdentityResolution:
    #: alias id -> canonical id, only for ids that changed
    aliases: dict[str, str]
    #: canonical id -> display name
    names: dict[str, str]
    #: accepted merge edges (kept id, merged id, evidence) for auditing
    merges: list[tuple[str, str, str]]


def _profiles(records: list[dict]) -> dict[str, _Profile]:
    profiles: dict[str, _Profile] = defaultdict(_Profile)
    for record in records:
        authors = record.get("authors", [])
        for author in authors:
            profile = profiles[author["id"]]
            profile.names[author["name"]] += 1
            if author.get("orcid"):
                profile.orcids.add(author["orcid"].strip().upper())
            profile.institutions.update(author.get("institution_ids") or [])
            profile.papers.add(record["id"])
            profile.coauthors.update(normalize_name(other["name"]) for other in authors if other["id"] != author["id"])
    return profiles


def load_overrides(path: Path = OVERRIDES_PATH) -> dict[str, list[list[str]]]:
    if not path.exists():
        return {"merge": [], "separate": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {"merge": data.get("merge", []), "separate": data.get("separate", [])}


def resolve_author_identities(records: list[dict], overrides: dict[str, list[list[str]]] | None = None) -> IdentityResolution:
    overrides = overrides if overrides is not None else load_overrides()
    profiles = _profiles(records)
    parent = {author_id: author_id for author_id in profiles}
    orcids = {author_id: set(profile.orcids) for author_id, profile in profiles.items()}
    papers = {author_id: set(profile.papers) for author_id, profile in profiles.items()}
    separate = {frozenset(pair) for pair in overrides["separate"] if len(pair) == 2}
    members = {author_id: {author_id} for author_id in profiles}
    merges: list[tuple[str, str, str]] = []

    def find(author_id: str) -> str:
        while parent[author_id] != author_id:
            parent[author_id] = parent[parent[author_id]]
            author_id = parent[author_id]
        return author_id

    def union(left: str, right: str, evidence: str, forced: bool = False) -> None:
        a, b = find(left), find(right)
        if a == b:
            return
        if not forced:
            if len(orcids[a] | orcids[b]) > 1 or papers[a] & papers[b]:
                return
            if any(frozenset((x, y)) in separate for x in members[a] for y in members[b]):
                return
        parent[b] = a
        orcids[a] |= orcids.pop(b)
        papers[a] |= papers.pop(b)
        members[a] |= members.pop(b)
        merges.append((left, right, evidence))

    for pair in overrides["merge"]:
        known = [author_id for author_id in pair if author_id in parent]
        for other in known[1:]:
            union(known[0], other, "curated", forced=True)

    # Strongest evidence first, deterministic order within each rule.
    by_orcid: dict[str, list[str]] = defaultdict(list)
    for author_id, profile in sorted(profiles.items()):
        if len(profile.orcids) == 1:
            by_orcid[next(iter(profile.orcids))].append(author_id)
    for orcid, ids in sorted(by_orcid.items()):
        for other in ids[1:]:
            union(ids[0], other, f"orcid:{orcid}")

    by_name: dict[str, list[str]] = defaultdict(list)
    for author_id, profile in sorted(profiles.items()):
        key = normalize_name(profile.names.most_common(1)[0][0])
        if len(key) >= 4:
            by_name[key].append(author_id)
    for ids in by_name.values():
        for index, left in enumerate(ids):
            for right in ids[index + 1:]:
                shared = profiles[left].institutions & profiles[right].institutions
                if shared:
                    union(left, right, f"institution:{min(shared)}")
    for ids in by_name.values():
        for index, left in enumerate(ids):
            for right in ids[index + 1:]:
                shared = profiles[left].coauthors & profiles[right].coauthors
                if len(shared) >= MIN_SHARED_COAUTHORS:
                    union(left, right, f"coauthors:{','.join(sorted(shared)[:3])}")

    aliases: dict[str, str] = {}
    names: dict[str, str] = {}
    for group in members.values():
        canonical = min(group, key=lambda author_id: (_id_rank(author_id), -len(profiles[author_id].papers), author_id))
        spellings: Counter[str] = Counter()
        for author_id in group:
            for name, count in profiles[author_id].names.items():
                spellings[display_name(name)] += count
        own = {display_name(name) for name in profiles[canonical].names}
        # Most used spelling; ties prefer the canonical id's spelling, then the fuller name.
        names[canonical] = max(spellings, key=lambda name: (spellings[name], name in own, len(name), name))
        for author_id in group:
            if author_id != canonical:
                aliases[author_id] = canonical
    return IdentityResolution(aliases=aliases, names=names, merges=merges)


def apply_author_identities(records: list[dict], resolution: IdentityResolution, rename: bool) -> None:
    """Rewrite author ids in place; ``rename`` also applies the canonical display name."""
    for record in records:
        for author in record.get("authors", []):
            author["id"] = resolution.aliases.get(author["id"], author["id"])
            if rename and author["id"] in resolution.names:
                author["name"] = resolution.names[author["id"]]
