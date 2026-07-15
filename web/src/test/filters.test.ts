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

  it("corrects common transposed venue abbreviations", () => {
    const tifs: CatalogPaper = {
      ...base,
      venue: { id: "venue-tifs", name: "IEEE Transactions on Information Forensics and Security", short_name: "TIFS", type: "journal", rankings: [] },
    };
    expect(filterPapers([tifs], { ...DEFAULT_FILTERS, venue: "TISF" })).toEqual([tifs]);
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

  it("supports CAS, JCR and combined journal-zone lookup without treating journals as CCF", () => {
    const journal: CatalogPaper = {
      ...base,
      id: "paper-journal",
      venue: {
        id: "venue-journal", name: "Forensic Imaging", short_name: "FI", type: "journal",
        rankings: [
          { system: "CAS", level: "1", category: "工程技术", is_top: true, version: "2025", source_url: "https://example.com/cas", verified_at: "2026-07-15" },
          { system: "JCR", level: "Q2", category: "Imaging Science", is_top: false, version: "2026", source_url: "https://example.com/jcr", verified_at: "2026-07-15" },
        ],
      },
    };
    expect(filterPapers([base, journal], { ...DEFAULT_FILTERS, journal: "1" })).toEqual([journal]);
    expect(filterPapers([base, journal], { ...DEFAULT_FILTERS, journalSystem: "JCR", journal: "2" })).toEqual([journal]);
    expect(filterPapers([base, journal], { ...DEFAULT_FILTERS, journalSystem: "CAS", journal: "TOP" })).toEqual([journal]);
    expect(filterPapers([journal], { ...DEFAULT_FILTERS, ccf: "A" })).toHaveLength(0);
  });
});
