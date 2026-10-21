import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, groupFilterCounts } from "../filters";
import { weightedLongitude } from "../insights";
import { readStoredFlag, readStoredJson, writeStored } from "../storage";
import type { CatalogPaper, Institution } from "../types";

function institution(id: string, longitude: number | null): Institution {
  return {
    id, name: id, country: "", country_code: "", city: "", latitude: longitude === null ? null : 30, longitude,
    ror: "", openalex_id: "", coordinate_source: "test", review_status: "auto", paper_ids: [],
  };
}

function paper(id: string, institutionIds: string[]): CatalogPaper {
  return {
    id, title: id, year: 2025, authors: [], institution_ids: institutionIds, venue: null, task_tags: ["image_forgery"],
    contribution_type: "method", review_status: "auto", primary_url: "https://example.com", citation_count: 0,
    sources: ["crossref"], abstract_excerpt: "",
  };
}

describe("groupFilterCounts", () => {
  it("counts one filter per chip in each filter-panel group", () => {
    expect(Object.values(groupFilterCounts(DEFAULT_FILTERS)).every((count) => count === 0)).toBe(true);
    const counts = groupFilterCounts({
      ...DEFAULT_FILTERS, q: "gan", task: "image_forgery", yearFrom: "2020", yearTo: "2024", venue: "TIFS", venueType: "journal",
      journalSystem: "CAS", journal: "1", country: "CN", author: "Lin", review: "verified",
    });
    expect(counts).toEqual({ task: 1, year: 1, venue: 2, rank: 1, contribution: 0, people: 2, source: 1 });
    expect(groupFilterCounts({ ...DEFAULT_FILTERS, journalSystem: "JCR" }).rank).toBe(1);
  });
});

describe("weightedLongitude", () => {
  const institutions = new Map([
    ["cn", institution("cn", 120)],
    ["de", institution("de", 10)],
    ["us", institution("us", -120)],
    ["east", institution("east", 170)],
    ["west", institution("west", -170)],
    ["nowhere", institution("nowhere", null)],
  ]);

  it("weighs every paper once, split across its located institutions", () => {
    // 1.5 papers at 120°E against 0.5 at 10°E: the mean leans towards China.
    const longitude = weightedLongitude([paper("a", ["cn"]), paper("b", ["cn", "de", "nowhere"])], institutions)!;
    expect(longitude).toBeGreaterThan(90);
    expect(longitude).toBeLessThan(120);
  });

  it("averages across the antimeridian instead of through Greenwich", () => {
    expect(Math.abs(weightedLongitude([paper("c", ["east"]), paper("d", ["west"])], institutions)!)).toBeCloseTo(180);
    // China and the US west coast meet over the Pacific.
    expect(Math.abs(weightedLongitude([paper("e", ["cn"]), paper("f", ["us"])], institutions)!)).toBeCloseTo(180);
  });

  it("is null when no institution is located", () => {
    expect(weightedLongitude([paper("e", ["nowhere"]), paper("f", [])], institutions)).toBeNull();
  });
});

describe("stored preferences", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("round-trips flags and JSON objects", () => {
    writeStored("flag", "1");
    writeStored("groups", JSON.stringify({ task: false }));
    expect(readStoredFlag("flag")).toBe(true);
    expect(readStoredFlag("missing", true)).toBe(true);
    expect(readStoredJson<{ task: boolean }>("groups")).toEqual({ task: false });
  });

  it("falls back to defaults when storage is unavailable or corrupt", () => {
    localStorage.setItem("groups", "{not json");
    expect(readStoredJson("groups")).toEqual({});
    localStorage.setItem("groups", "[1, 2]");
    expect(readStoredJson("groups")).toEqual({});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(readStoredFlag("flag", true)).toBe(true);
    expect(readStoredJson("groups")).toEqual({});
    expect(() => writeStored("flag", "0")).not.toThrow();
  });
});
