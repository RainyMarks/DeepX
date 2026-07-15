import type { CatalogPaper, Institution, TaskId } from "./types";

export interface FilterState {
  q: string;
  author: string;
  institution: string;
  country: string;
  venue: string;
  source: string;
  task: string;
  contribution: string;
  review: string;
  ccf: string;
  journalSystem: string;
  journal: string;
  yearFrom: string;
  yearTo: string;
}

export const DEFAULT_FILTERS: FilterState = {
  q: "", author: "", institution: "", country: "", venue: "", source: "",
  task: "", contribution: "", review: "", ccf: "", journalSystem: "", journal: "", yearFrom: "", yearTo: "",
};

const VENUE_QUERY_CORRECTIONS: Record<string, string> = {
  TISF: "TIFS",
  PAMI: "TPAMI",
  PAML: "TPAMI",
  TCVST: "TCSVT",
};

export function correctedVenueQuery(value: string): string {
  const query = value.trim();
  return VENUE_QUERY_CORRECTIONS[query.toUpperCase()] ?? query;
}

function journalRankingMatches(paper: CatalogPaper, system: string, zone: string): boolean {
  if (!system && !zone) return true;
  if (paper.venue?.type !== "journal") return false;
  const rankings = paper.venue.rankings.filter((item) => item.system === "CAS" || item.system === "JCR");
  const selected = system ? rankings.filter((item) => item.system === system) : rankings;
  if (!zone) return selected.length > 0;
  if (zone === "TOP") return selected.some((item) => item.system === "CAS" && item.is_top);
  return selected.some((item) => item.level === zone || item.level === `Q${zone}`);
}

export function filterPapers(papers: CatalogPaper[], filters: FilterState, institutions: Institution[] = []): CatalogPaper[] {
  const query = filters.q.trim().toLowerCase();
  const authorQuery = filters.author.trim().toLowerCase();
  const institutionQuery = filters.institution.trim().toLowerCase();
  const venueQuery = correctedVenueQuery(filters.venue).toLowerCase();
  const institutionMap = new Map(institutions.map((item) => [item.id, item]));
  return papers.filter((paper) => {
    const paperInstitutions = paper.institution_ids.map((id) => institutionMap.get(id)).filter(Boolean) as Institution[];
    const searchable = `${paper.title} ${paper.authors.map((item) => item.name).join(" ")} ${paper.venue?.name ?? ""} ${paper.venue?.short_name ?? ""} ${paperInstitutions.map((item) => item.name).join(" ")}`.toLowerCase();
    const ccf = paper.venue?.type === "conference" ? paper.venue.rankings.find((item) => item.system === "CCF")?.level ?? "" : "";
    const journal = journalRankingMatches(paper, filters.journalSystem, filters.journal);
    return (!query || searchable.includes(query))
      && (!authorQuery || paper.authors.some((item) => item.name.toLowerCase().includes(authorQuery)))
      && (!institutionQuery || paperInstitutions.some((item) => item.name.toLowerCase().includes(institutionQuery)))
      && (!filters.country || paperInstitutions.some((item) => item.country_code === filters.country || item.country === filters.country))
      && (!venueQuery || `${paper.venue?.name ?? ""} ${paper.venue?.short_name ?? ""}`.toLowerCase().includes(venueQuery))
      && (!filters.source || paper.sources.includes(filters.source))
      && (!filters.task || paper.task_tags.includes(filters.task as TaskId))
      && (!filters.contribution || paper.contribution_type === filters.contribution)
      && (!filters.review || paper.review_status === filters.review)
      && (!filters.ccf || ccf === filters.ccf)
      && journal
      && (!filters.yearFrom || (paper.year ?? 0) >= Number(filters.yearFrom))
      && (!filters.yearTo || (paper.year ?? 9999) <= Number(filters.yearTo));
  }).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.citation_count - a.citation_count);
}
