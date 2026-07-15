from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator


ReviewStatus = Literal["verified", "auto", "rejected"]
ContributionType = Literal["method", "dataset", "benchmark", "survey", "analysis"]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class Provenance(BaseModel):
    source: str
    source_id: str = ""
    url: str = ""
    query: str = ""
    retrieved_at: str = Field(default_factory=utc_now)


class AuthorRef(BaseModel):
    id: str
    name: str
    orcid: str = ""
    institution_ids: list[str] = Field(default_factory=list)


class VenueRanking(BaseModel):
    system: Literal["CCF", "JCR", "CAS"]
    level: str
    category: str = ""
    is_top: bool = False
    version: str
    source_url: str
    verified_at: str


class Venue(BaseModel):
    id: str
    name: str
    short_name: str = ""
    type: Literal["conference", "journal", "preprint", "book", "unknown"] = "unknown"
    issn: str = ""
    rankings: list[VenueRanking] = Field(default_factory=list)


class Paper(BaseModel):
    id: str
    title: str
    title_zh: str = ""
    year: int | None = None
    publication_date: str = ""
    abstract: str = ""
    authors: list[AuthorRef] = Field(default_factory=list)
    institution_ids: list[str] = Field(default_factory=list)
    venue: Venue | None = None
    task_tags: list[str] = Field(default_factory=list)
    contribution_type: ContributionType = "method"
    review_status: ReviewStatus = "auto"
    doi: str = ""
    arxiv_id: str = ""
    openalex_id: str = ""
    semantic_scholar_id: str = ""
    primary_url: str = ""
    citation_count: int = 0
    provenance: list[Provenance] = Field(default_factory=list)
    notes: str = ""

    @field_validator("title")
    @classmethod
    def title_must_exist(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("paper title is required")
        return value


class Institution(BaseModel):
    id: str
    name: str
    country: str = ""
    country_code: str = ""
    city: str = ""
    latitude: float | None = None
    longitude: float | None = None
    ror: str = ""
    openalex_id: str = ""
    coordinate_source: str = ""
    review_status: ReviewStatus = "auto"
    paper_ids: list[str] = Field(default_factory=list)


class AuthorIndex(BaseModel):
    id: str
    name: str
    orcid: str = ""
    institution_ids: list[str] = Field(default_factory=list)
    paper_ids: list[str] = Field(default_factory=list)
    task_counts: dict[str, int] = Field(default_factory=dict)


class ReviewDecision(BaseModel):
    paper_id: str
    status: ReviewStatus
    reviewer: str
    note: str = ""
    task_tags: list[str] = Field(default_factory=list)
    decided_at: str = Field(default_factory=utc_now)


class DatasetManifest(BaseModel):
    schema_version: str = "1.0.0"
    dataset_version: str
    generated_at: str = Field(default_factory=utc_now)
    language: str = "zh-CN"
    paper_count: int
    verified_paper_count: int
    author_count: int
    institution_count: int
    mapped_institution_count: int
    country_count: int
    candidate_count: int
    detail_shards: list[str]
    data_notice: str = "文献元数据可能存在误差；请以论文原始来源为准。"
