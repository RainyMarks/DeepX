import type { CatalogPaper } from "./types";

function save(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function exportPapers(papers: CatalogPaper[], format: "csv" | "json" | "bib") {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") return save(`图谱论文-${stamp}.json`, JSON.stringify(papers, null, 2), "application/json");
  if (format === "csv") {
    const rows = [["标题", "摘要摘录", "年份", "作者", "机构数", "任务", "贡献类型", "Venue", "CCF会议", "中科院2025", "JCR 2026", "审核状态", "链接"], ...papers.map((paper) => [paper.title, paper.abstract_excerpt, paper.year, paper.authors.map((x) => x.name).join("; "), paper.institution_ids.length, paper.task_tags.join(";"), paper.contribution_type, paper.venue?.name ?? "", paper.venue?.type === "conference" ? paper.venue.rankings.find((x) => x.system === "CCF")?.level ?? "" : "", paper.venue?.rankings.find((x) => x.system === "CAS")?.level ?? "", paper.venue?.rankings.find((x) => x.system === "JCR")?.level ?? "", paper.review_status, paper.primary_url])];
    return save(`图谱论文-${stamp}.csv`, `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
  }
  const bib = papers.map((paper, index) => `@misc{atlas${paper.year ?? "nd"}_${index + 1},\n  title = {${paper.title}},\n  author = {${paper.authors.map((x) => x.name).join(" and ")}},\n  year = {${paper.year ?? ""}},\n  howpublished = {${paper.venue?.name ?? ""}},\n  url = {${paper.primary_url}}\n}`).join("\n\n");
  return save(`图谱论文-${stamp}.bib`, bib, "application/x-bibtex");
}
