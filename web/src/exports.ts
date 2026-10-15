import { CONTRIBUTIONS, TASKS } from "./task";
import type { CatalogPaper, PaperDetail, Ranking } from "./types";

type ExportablePaper = Pick<CatalogPaper, "id" | "title" | "year" | "authors" | "venue" | "primary_url"> & Partial<Pick<PaperDetail, "doi" | "arxiv_id">>;

function save(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function ranking(paper: CatalogPaper, system: Ranking["system"]): string {
  const venueType = system === "CCF" ? "conference" : "journal";
  if (paper.venue?.type !== venueType) return "";
  const item = paper.venue.rankings.find((rank) => rank.system === system);
  if (!item) return "";
  return system === "CAS" && item.is_top ? `${item.level} TOP` : item.level;
}

function bibEscape(value: string) {
  return value.replace(/([{}])/g, "\\$1");
}

/** BibTeX entries with stable, readable keys (first author surname + year + first title word). */
export function toBibtex(papers: ExportablePaper[]): string {
  const used = new Map<string, number>();
  return papers.map((paper) => {
    const surname = (paper.authors[0]?.name.split(/\s+/).at(-1) ?? "anon").normalize("NFKD").replace(/[^A-Za-z]/g, "").toLowerCase() || "anon";
    const word = paper.title.normalize("NFKD").match(/[A-Za-z]{3,}/)?.[0]?.toLowerCase() ?? "paper";
    const stem = `${surname}${paper.year ?? "nd"}${word}`;
    const seen = used.get(stem) ?? 0;
    used.set(stem, seen + 1);
    const key = seen ? `${stem}${String.fromCharCode(97 + ((seen - 1) % 26))}` : stem;
    const type = paper.venue?.type === "journal" ? "article" : paper.venue?.type === "conference" ? "inproceedings" : "misc";
    const fields: [string, string][] = [
      ["title", `{${bibEscape(paper.title)}}`],
      ["author", paper.authors.map((author) => bibEscape(author.name)).join(" and ")],
      ["year", String(paper.year ?? "")],
    ];
    if (paper.venue?.name) fields.push([type === "article" ? "journal" : type === "inproceedings" ? "booktitle" : "howpublished", bibEscape(paper.venue.name)]);
    if (paper.doi) fields.push(["doi", paper.doi]);
    if (paper.arxiv_id) fields.push(["eprint", paper.arxiv_id], ["archiveprefix", "arXiv"]);
    fields.push(["url", paper.primary_url]);
    const body = fields.filter(([, value]) => value).map(([name, value]) => `  ${name} = {${value}}`).join(",\n");
    return `@${type}{${key},\n${body}\n}`;
  }).join("\n\n");
}

export function exportPapers(papers: CatalogPaper[], format: "csv" | "json" | "bib") {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `image-forensics-atlas-${stamp}`;
  if (format === "json") return save(`${name}.json`, JSON.stringify(papers, null, 2), "application/json");
  if (format === "bib") return save(`${name}.bib`, toBibtex(papers), "application/x-bibtex");
  const header = ["标题", "年份", "作者", "发表渠道", "渠道类型", "CCF会议", "中科院2025大类", "JCR 2026", "研究方向", "贡献类型", "引用快照", "审核状态", "链接", "摘要摘录"];
  const rows = papers.map((paper) => [
    paper.title,
    paper.year,
    paper.authors.map((author) => author.name).join("; "),
    paper.venue?.name ?? "",
    paper.venue?.type ?? "",
    ranking(paper, "CCF"),
    ranking(paper, "CAS"),
    ranking(paper, "JCR"),
    paper.task_tags.map((task) => TASKS[task].label).join("; "),
    CONTRIBUTIONS[paper.contribution_type],
    paper.citation_count,
    paper.review_status === "verified" ? "人工核验" : "自动收录",
    paper.primary_url,
    paper.abstract_excerpt,
  ]);
  return save(`${name}.csv`, `﻿${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`, "text/csv;charset=utf-8");
}
