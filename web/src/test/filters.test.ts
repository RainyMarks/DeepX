import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filterPapers } from "../filters";
import type { CatalogPaper, Institution } from "../types";

const base: CatalogPaper = {
  id: "paper-a", title: "Scene Text Image Forgery Detection", title_zh: "", year: 2025,
  authors: [{ id: "author-a", name: "Mei Lin" }], institution_ids: ["inst-a"],
  venue: { id: "venue-a", name: "CVPR", short_name: "CVPR", type: "conference", rankings: [{ system: "CCF", level: "A", category: "人工智能", is_top: false, version: "第六版", source_url: "https://example.com", verified_at: "2026-01-01" }] },
  task_tags: ["scene_text_forgery"], contribution_type: "method", review_status: "verified",
  primary_url: "https://example.com/paper", citation_count: 10, sources: ["openalex"], abstract_excerpt: "",
};

const institution: Institution = {
  id: "inst-a", name: "Fudan University", country: "中国", country_code: "CN", city: "上海",
  latitude: 31.2, longitude: 121.5, ror: "", openalex_id: "", coordinate_source: "OpenAlex",
  review_status: "auto", paper_ids: ["paper-a"],
};

describe("filterPapers", () => {
  it("combines task, CCF, year and review filters", () => {
    const result = filterPapers([base, { ...base, id: "paper-b", year: 2020, review_status: "auto" }], { ...DEFAULT_FILTERS, task: "scene_text_forgery", ccf: "A", yearFrom: "2024", review: "verified" });
    expect(result.map((item) => item.id)).toEqual(["paper-a"]);
  });

  it("matches author and venue keywords", () => {
    expect(filterPapers([base], { ...DEFAULT_FILTERS, q: "mei lin" })).toHaveLength(1);
    expect(filterPapers([base], { ...DEFAULT_FILTERS, q: "cvpr" })).toHaveLength(1);
  });

  it("combines dedicated author, institution, country, venue and source fields", () => {
    const result = filterPapers([base], {
      ...DEFAULT_FILTERS,
      author: "mei",
      institution: "fudan",
      country: "CN",
      venue: "cvpr",
      source: "openalex",
    }, [institution]);
    expect(result).toHaveLength(1);
  });
});
