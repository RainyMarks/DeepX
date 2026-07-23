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

export interface PaperSearchEntry {
  searchable: string;
  searchableNormalized: string;
  authors: string[];
  institutions: string[];
  countryKeys: string[];
  venue: string;
  venueNormalized: string;
  venueNameNormalized: string;
  venueShortNormalized: string;
  venueType: "conference" | "journal" | "other" | "";
}

export type PaperSearchIndex = Map<string, PaperSearchEntry>;

const VENUE_QUERY_CORRECTIONS: Record<string, string> = {
  TISF: "TIFS",
  IEEETISF: "TIFS",
  IEEETIFS: "TIFS",
  PAMI: "TPAMI",
  PAML: "TPAMI",
  IEEEPAMI: "TPAMI",
  IEEETPAMI: "TPAMI",
  TCVST: "TCSVT",
  IEEETCVST: "TCSVT",
  IEEETCSVT: "TCSVT",
  IEEETIP: "TIP",
  IEEETMM: "TMM",
  IEEETDSC: "TDSC",
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function correctedVenueQuery(value: string): string {
  const query = value.trim();
  return VENUE_QUERY_CORRECTIONS[normalizeSearchText(query).toUpperCase()] ?? query;
}

export interface VenueRankingReconciliation {
  filters: FilterState;
  venueType: PaperSearchEntry["venueType"];
  cleared: Array<"ccf" | "journal">;
}

export function reconcileVenueRankingFilters(
  filters: FilterState,
  papers: CatalogPaper[],
  searchIndex?: PaperSearchIndex,
): VenueRankingReconciliation {
  const query = normalizeSearchText(correctedVenueQuery(filters.venue));
  if (!query) return { filters, venueType: "", cleared: [] };
  const index = searchIndex ?? buildPaperSearchIndex(papers);
  const types = new Set<PaperSearchEntry["venueType"]>();
  for (const entry of index.values()) {
    if (entry.venueShortNormalized === query || entry.venueNameNormalized === query) {
      if (entry.venueType) types.add(entry.venueType);
    }
  }
  // Incomplete source metadata may label a small subset of an otherwise
  // canonical journal/conference as "other". A known type remains decisive;
  // only a real journal-vs-conference collision is ambiguous.
  if (types.has("journal") || types.has("conference")) types.delete("other");
  if (types.size !== 1) return { filters, venueType: "", cleared: [] };

  const venueType = [...types][0];
  if (venueType === "journal" && filters.ccf) {
    return {
      filters: { ...filters, ccf: "" },
      venueType,
      cleared: ["ccf"],
    };
  }
  if (venueType === "conference" && (filters.journalSystem || filters.journal)) {
    return {
      filters: { ...filters, journalSystem: "", journal: "" },
      venueType,
      cleared: ["journal"],
    };
  }
  return { filters, venueType, cleared: [] };
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

export function buildPaperSearchIndex(
  papers: CatalogPaper[],
  institutions: Institution[] = [],
): PaperSearchIndex {
  const institutionMap = new Map(institutions.map((item) => [item.id, item]));
  return new Map(papers.map((paper) => {
    const paperInstitutions = paper.institution_ids
      .map((id) => institutionMap.get(id))
      .filter(Boolean) as Institution[];
    const authors = paper.authors.map((item) => item.name.toLowerCase());
    const institutionNames = paperInstitutions.map((item) => item.name.toLowerCase());
    const venueName = paper.venue?.name ?? "";
    const venueShort = paper.venue?.short_name ?? "";
    const venue = `${venueName} ${venueShort}`.toLowerCase();
    const searchable = `${paper.title} ${authors.join(" ")} ${venue} ${institutionNames.join(" ")}`.toLowerCase();
    const venueType: PaperSearchEntry["venueType"] = !paper.venue
      ? ""
      : paper.venue.type === "conference" || paper.venue.type === "journal"
        ? paper.venue.type
        : "other";
    return [paper.id, {
      searchable,
      searchableNormalized: normalizeSearchText(searchable),
      authors,
      institutions: institutionNames,
      countryKeys: paperInstitutions.flatMap((item) => [item.country_code, item.country]).filter(Boolean),
      venue,
      venueNormalized: normalizeSearchText(venue),
      venueNameNormalized: normalizeSearchText(venueName),
      venueShortNormalized: normalizeSearchText(venueShort),
      venueType,
    }] as const;
  }));
}

export function filterPapers(
  papers: CatalogPaper[],
  filters: FilterState,
  institutions: Institution[] = [],
  searchIndex?: PaperSearchIndex,
): CatalogPaper[] {
  const index = searchIndex ?? buildPaperSearchIndex(papers, institutions);
  const effectiveFilters = reconcileVenueRankingFilters(filters, papers, index).filters;
  const query = effectiveFilters.q.trim().toLowerCase();
  const queryNormalized = normalizeSearchText(correctedVenueQuery(effectiveFilters.q));
  const authorQuery = filters.author.trim().toLowerCase();
  const institutionQuery = filters.institution.trim().toLowerCase();
  const venueQuery = correctedVenueQuery(effectiveFilters.venue).toLowerCase();
  const venueQueryNormalized = normalizeSearchText(venueQuery);
  return papers.filter((paper) => {
    const search = index.get(paper.id);
    if (!search) return false;
    const ccf = paper.venue?.type === "conference" ? paper.venue.rankings.find((item) => item.system === "CCF")?.level ?? "" : "";
    const journal = journalRankingMatches(paper, effectiveFilters.journalSystem, effectiveFilters.journal);
    return (!query || search.searchable.includes(query) || search.searchableNormalized.includes(queryNormalized))
      && (!authorQuery || search.authors.some((item) => item.includes(authorQuery)))
      && (!institutionQuery || search.institutions.some((item) => item.includes(institutionQuery)))
      && (!effectiveFilters.country || search.countryKeys.includes(effectiveFilters.country))
      && (!venueQuery || search.venue.includes(venueQuery) || search.venueNormalized.includes(venueQueryNormalized))
      && (!effectiveFilters.source || paper.sources.includes(effectiveFilters.source))
      && (!effectiveFilters.task || paper.task_tags.includes(effectiveFilters.task as TaskId))
      && (!effectiveFilters.contribution || paper.contribution_type === effectiveFilters.contribution)
      && (!effectiveFilters.review || paper.review_status === effectiveFilters.review)
      && (!effectiveFilters.ccf || ccf === effectiveFilters.ccf)
      && journal
      && (!effectiveFilters.yearFrom || (paper.year ?? 0) >= Number(effectiveFilters.yearFrom))
      && (!effectiveFilters.yearTo || (paper.year ?? 9999) <= Number(effectiveFilters.yearTo));
  }).sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.citation_count - a.citation_count || a.id.localeCompare(b.id));
}
