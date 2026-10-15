import { describe, expect, it } from "vitest";
import { unpackCatalog } from "../data";
import { toBibtex } from "../exports";
import { buildPaperSearchIndex, DEFAULT_FILTERS, searchPapers, sortPapers } from "../filters";
import type { CatalogPaper, PackedCatalog } from "../types";

function paper(id: string, patch: Partial<CatalogPaper> = {}): CatalogPaper {
  return {
    id, title: `Paper ${id}`, year: 2024, authors: [{ id: "a1", name: "Mei Lin" }], institution_ids: [],
    venue: { id: "v-cvpr", name: "CVPR", short_name: "CVPR", type: "conference", rankings: [] },
    task_tags: ["image_forgery"], contribution_type: "method", review_status: "verified",
    primary_url: "https://example.com", citation_count: 0, sources: ["openalex"], abstract_excerpt: "",
    ...patch,
  };
}

describe("searchPapers", () => {
  const papers = [
    paper("p1", { task_tags: ["image_forgery"], year: 2024 }),
    paper("p2", { task_tags: ["deepfake_detection"], year: 2023, citation_count: 9 }),
    paper("p3", { task_tags: ["deepfake_detection", "image_forgery"], year: 2020, contribution_type: "dataset" }),
  ];
  const index = buildPaperSearchIndex(papers);

  it("counts each facet under the other active filters", () => {
    const result = searchPapers(papers, { ...DEFAULT_FILTERS, task: "deepfake_detection", contribution: "method" }, index);
    expect(result.papers.map((item) => item.id)).toEqual(["p2"]);
    // Selecting another task keeps the contribution filter: only p1 is a method paper on image forgery.
    expect(result.facets.task.get("image_forgery")).toBe(1);
    expect(result.facets.task.get("deepfake_detection")).toBe(1);
    // Contribution counts ignore the contribution filter but keep the task filter.
    expect(result.facets.contribution.get("dataset")).toBe(1);
    expect(result.facets.contribution.get("method")).toBe(1);
  });

  it("sorts by recency, citations and age", () => {
    expect(sortPapers(papers, "recent").map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
    expect(sortPapers(papers, "citations")[0].id).toBe("p2");
    expect(sortPapers(papers, "oldest")[0].id).toBe("p3");
  });

  it("filters by venue type", () => {
    const preprint = paper("p4", { venue: { id: "v-arxiv", name: "arXiv", short_name: "", type: "preprint", rankings: [] } });
    const all = [...papers, preprint];
    const result = searchPapers(all, { ...DEFAULT_FILTERS, venueType: "preprint" }, buildPaperSearchIndex(all));
    expect(result.papers).toEqual([preprint]);
    expect(result.facets.venueType.get("conference")).toBe(3);
  });
});

describe("unpackCatalog", () => {
  it("resolves shared venues and authors", () => {
    const packed: PackedCatalog = {
      venues: [{ id: "v1", name: "TIFS", short_name: "TIFS", type: "journal", rankings: [] }],
      authors: [{ id: "a1", name: "Mei Lin" }, { id: "a2", name: "Jun Li" }],
      papers: [{ ...paper("p1"), venue_id: "v1", authors: [1, 0] } as PackedCatalog["papers"][number]],
    };
    const [result] = unpackCatalog(packed);
    expect(result.venue?.short_name).toBe("TIFS");
    expect(result.authors.map((author) => author.name)).toEqual(["Jun Li", "Mei Lin"]);
  });
});

describe("toBibtex", () => {
  it("uses entry types by venue and keeps keys unique", () => {
    const bib = toBibtex([
      paper("p1", { title: "Forgery {localization}" }),
      paper("p2", { title: "Forgery detection" }),
    ]);
    expect(bib).toContain("@inproceedings{lin2024forgery,");
    expect(bib).toContain("@inproceedings{lin2024forgerya,");
    expect(bib).toContain("booktitle = {CVPR}");
    expect(bib).toContain("title = {{Forgery \\{localization\\}}}");
  });
});
