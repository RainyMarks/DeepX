import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  filterPapers,
  reconcileVenueRankingFilters,
} from "../filters";
import type { CatalogPaper } from "../types";

function venuePaper(
  id: string,
  shortName: string,
  name: string,
  type: "journal" | "conference",
): CatalogPaper {
  return {
    id,
    title: `${shortName} forensic paper`,
    title_zh: "",
    year: 2025,
    authors: [],
    institution_ids: [],
    venue: { id: `venue-${id}`, name, short_name: shortName, type, rankings: [] },
    task_tags: ["image_forgery"],
    contribution_type: "method",
    review_status: "auto",
    primary_url: "https://example.com",
    citation_count: 0,
    sources: ["openalex"],
    abstract_excerpt: "",
  } as CatalogPaper;
}

describe("venue search regressions", () => {
  const tifs = venuePaper(
    "paper-tifs",
    "TIFS",
    "IEEE Transactions on Information Forensics and Security",
    "journal",
  );
  const tpami = venuePaper(
    "paper-tpami",
    "TPAMI",
    "IEEE Transactions on Pattern Analysis and Machine Intelligence",
    "journal",
  );

  it.each(["TIFS", "TISF", "IEEE-TIFS"])("finds TIFS through %s", (query) => {
    expect(filterPapers([tifs, tpami], { ...DEFAULT_FILTERS, venue: query })).toEqual([tifs]);
  });

  it.each(["TPAMI", "PAMI", "T-PAMI", "IEEE TPAMI"])("finds TPAMI through %s", (query) => {
    expect(filterPapers([tifs, tpami], { ...DEFAULT_FILTERS, venue: query })).toEqual([tpami]);
  });

  it("does not let a stale CCF filter hide an exact journal venue", () => {
    const filters = { ...DEFAULT_FILTERS, venue: "TIFS", ccf: "A" };
    expect(reconcileVenueRankingFilters(filters, [tifs, tpami]).filters.ccf).toBe("");
    expect(filterPapers([tifs, tpami], filters)).toEqual([tifs]);
  });
});
