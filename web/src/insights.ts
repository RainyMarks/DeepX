import { TASK_ORDER } from "./task";
import type { CatalogPaper, Institution, TaskId, Venue } from "./types";

export interface AuthorSummary {
  id: string;
  name: string;
  papers: CatalogPaper[];
  citations: number;
  firstYear: number | null;
  lastYear: number | null;
  tasks: [TaskId, number][];
}

function top<T>(counts: Map<T, number>, limit: number): [T, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function increment<T>(counts: Map<T, number>, key: T, by = 1) {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

export function taskCounts(papers: CatalogPaper[]): Map<TaskId, number> {
  const counts = new Map<TaskId, number>(TASK_ORDER.map((task) => [task, 0]));
  for (const paper of papers) for (const task of paper.task_tags) increment(counts, task);
  return counts;
}

export function yearCounts(papers: CatalogPaper[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const paper of papers) if (paper.year) increment(counts, paper.year);
  return counts;
}

/** Papers per year for every task, over a fixed year range. */
export function taskYearSeries(papers: CatalogPaper[], years: number[]): Record<TaskId, number[]> {
  const position = new Map(years.map((year, index) => [year, index]));
  const series = Object.fromEntries(TASK_ORDER.map((task) => [task, years.map(() => 0)])) as Record<TaskId, number[]>;
  for (const paper of papers) {
    const index = paper.year ? position.get(paper.year) : undefined;
    if (index === undefined) continue;
    for (const task of paper.task_tags) series[task][index] += 1;
  }
  return series;
}

export function topVenues(papers: CatalogPaper[], limit: number): [Venue, number][] {
  const venues = new Map<string, Venue>();
  const counts = new Map<string, number>();
  for (const paper of papers) {
    if (!paper.venue || paper.venue.type === "preprint" || !paper.venue.name) continue;
    venues.set(paper.venue.id, paper.venue);
    increment(counts, paper.venue.id);
  }
  return top(counts, limit).map(([id, count]) => [venues.get(id)!, count]);
}

export function topInstitutions(papers: CatalogPaper[], institutions: Map<string, Institution>, limit: number): [Institution, number][] {
  const counts = new Map<string, number>();
  for (const paper of papers) for (const id of paper.institution_ids) if (institutions.has(id)) increment(counts, id);
  return top(counts, limit).map(([id, count]) => [institutions.get(id)!, count]);
}

/** Papers per country (a paper counts once per country among its institutions). */
export function topCountries(papers: CatalogPaper[], institutions: Map<string, Institution>, limit: number): [{ code: string; name: string }, number][] {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const paper of papers) {
    const seen = new Set<string>();
    for (const id of paper.institution_ids) {
      const institution = institutions.get(id);
      const key = institution?.country_code || institution?.country;
      if (!institution || !key || seen.has(key)) continue;
      seen.add(key);
      names.set(key, institution.country);
      increment(counts, key);
    }
  }
  return top(counts, limit).map(([code, count]) => [{ code, name: names.get(code) ?? code }, count]);
}

/**
 * Mean longitude of the papers' located institutions, each paper weighing one
 * (split across its institutions). Longitudes are averaged as directions
 * because the map wraps around: Americas and East Asia meet over the Pacific
 * rather than cancelling out over Africa. Null when nothing is located or the
 * papers are spread so evenly around the globe that no direction dominates.
 */
export function weightedLongitude(papers: CatalogPaper[], institutions: Map<string, Institution>): number | null {
  let x = 0;
  let y = 0;
  let weight = 0;
  for (const paper of papers) {
    const located = paper.institution_ids
      .map((id) => institutions.get(id)?.longitude)
      .filter((longitude): longitude is number => typeof longitude === "number");
    for (const longitude of located) {
      const angle = (longitude * Math.PI) / 180;
      x += Math.cos(angle) / located.length;
      y += Math.sin(angle) / located.length;
      weight += 1 / located.length;
    }
  }
  if (!weight || Math.hypot(x, y) < 0.1 * weight) return null;
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function summarizeAuthors(papers: CatalogPaper[]): AuthorSummary[] {
  const authors = new Map<string, AuthorSummary & { taskCounts: Map<TaskId, number> }>();
  for (const paper of papers) {
    for (const ref of paper.authors) {
      let author = authors.get(ref.id);
      if (!author) {
        author = { id: ref.id, name: ref.name, papers: [], citations: 0, firstYear: null, lastYear: null, tasks: [], taskCounts: new Map() };
        authors.set(ref.id, author);
      }
      author.papers.push(paper);
      author.citations += paper.citation_count;
      if (paper.year) {
        author.firstYear = Math.min(author.firstYear ?? paper.year, paper.year);
        author.lastYear = Math.max(author.lastYear ?? paper.year, paper.year);
      }
      for (const task of paper.task_tags) increment(author.taskCounts, task);
    }
  }
  return [...authors.values()]
    .map(({ taskCounts, ...author }) => ({ ...author, tasks: [...taskCounts.entries()].sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.papers.length - a.papers.length || b.citations - a.citations || a.name.localeCompare(b.name));
}

export function coauthors(author: AuthorSummary, limit: number): { id: string; name: string; count: number }[] {
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const paper of author.papers) {
    for (const ref of paper.authors) {
      if (ref.id === author.id) continue;
      const current = counts.get(ref.id) ?? { id: ref.id, name: ref.name, count: 0 };
      current.count += 1;
      counts.set(ref.id, current);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}
