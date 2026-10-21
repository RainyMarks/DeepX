import type { CatalogPaper, Institution, TaskId } from "./types";

export interface FilterState {
  q: string;
  author: string;
  institution: string;
  country: string;
  venue: string;
  source: string;
  venueType: string;
  task: string;
  contribution: string;
  review: string;
  ccf: string;
  journalSystem: string;
  journal: string;
  yearFrom: string;
  yearTo: string;
}

export type JournalRankingSystem = "CAS" | "JCR";

export interface JournalRankingAvailability {
  CAS: ReadonlySet<string>;
  JCR: ReadonlySet<string>;
}

export const DEFAULT_FILTERS: FilterState = {
  q: "", author: "", institution: "", country: "", venue: "", source: "", venueType: "",
  task: "", contribution: "", review: "", ccf: "", journalSystem: "", journal: "", yearFrom: "", yearTo: "",
};

export function getJournalRankingAvailability(papers: CatalogPaper[]): JournalRankingAvailability {
  const availability: Record<JournalRankingSystem, Set<string>> = {
    CAS: new Set<string>(),
    JCR: new Set<string>(),
  };
  for (const paper of papers) {
    if (paper.venue?.type !== "journal") continue;
    for (const ranking of paper.venue.rankings) {
      if (ranking.system === "CAS" && /^[1-4]$/.test(ranking.level)) {
        availability.CAS.add(ranking.level);
        if (ranking.is_top) availability.CAS.add("TOP");
      }
      if (ranking.system === "JCR") {
        const zone = ranking.level.match(/^Q?([1-4])$/)?.[1];
        if (zone) availability.JCR.add(zone);
      }
    }
  }
  return availability;
}

export function availableJournalZones(
  availability: JournalRankingAvailability,
  system: string,
): ReadonlySet<string> {
  if (system === "CAS" || system === "JCR") return availability[system];
  return new Set([...availability.CAS, ...availability.JCR]);
}

export function reconcileJournalRankingAvailability(
  filters: FilterState,
  availability: JournalRankingAvailability,
): FilterState {
  const hasCAS = availability.CAS.size > 0;
  const hasJCR = availability.JCR.size > 0;
  const journalSystem = filters.journalSystem === "CAS" && !hasCAS
    || filters.journalSystem === "JCR" && !hasJCR
    ? ""
    : filters.journalSystem;
  const zones = availableJournalZones(availability, journalSystem);
  const journal = filters.journal && !zones.has(filters.journal) ? "" : filters.journal;
  if (journalSystem === filters.journalSystem && journal === filters.journal) return filters;
  return { ...filters, journalSystem, journal };
}

export interface PaperSearchEntry {
  searchable: string;
  searchableNormalized: string;
  authors: string[];
  institutions: string[];
  countryKeys: string[];
  countryCodes: string[];
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
      countryCodes: [...new Set(paperInstitutions.map((item) => item.country_code || item.country).filter(Boolean))],
      venue,
      venueNormalized: normalizeSearchText(venue),
      venueNameNormalized: normalizeSearchText(venueName),
      venueShortNormalized: normalizeSearchText(venueShort),
      venueType,
    }] as const;
  }));
}

export function paperVenueType(paper: CatalogPaper): string {
  const type = paper.venue?.type ?? "";
  return type === "journal" || type === "conference" || type === "preprint" || type === "book" ? type : "unknown";
}

function ccfLevel(paper: CatalogPaper): string {
  return paper.venue?.type === "conference" ? paper.venue.rankings.find((item) => item.system === "CCF")?.level ?? "" : "";
}

function journalZones(paper: CatalogPaper, system: string): string[] {
  if (paper.venue?.type !== "journal") return [];
  const zones = new Set<string>();
  for (const ranking of paper.venue.rankings) {
    if (ranking.system !== "CAS" && ranking.system !== "JCR") continue;
    if (system && ranking.system !== system) continue;
    const zone = ranking.level.match(/^Q?([1-4])$/)?.[1];
    if (zone) zones.add(zone);
    if (ranking.system === "CAS" && ranking.is_top) zones.add("TOP");
  }
  return [...zones];
}

/** Filters that are shown as option lists with result counts. */
export type FacetKey = "task" | "contribution" | "venueType" | "ccf" | "journal" | "country" | "source" | "review" | "year";
export type FacetCounts = Record<FacetKey, Map<string, number>>;

function facetValues(key: FacetKey, paper: CatalogPaper, entry: PaperSearchEntry, journalSystem: string): readonly string[] {
  switch (key) {
    case "task": return paper.task_tags;
    case "contribution": return [paper.contribution_type];
    case "venueType": return [paperVenueType(paper)];
    case "ccf": { const level = ccfLevel(paper); return level ? [level] : []; }
    case "journal": return journalZones(paper, journalSystem);
    case "country": return entry.countryCodes;
    case "source": return paper.sources;
    case "review": return [paper.review_status];
    case "year": return paper.year ? [String(paper.year)] : [];
  }
}

const FACET_KEYS: FacetKey[] = ["task", "contribution", "venueType", "ccf", "journal", "country", "source", "review", "year"];

export type SortKey = "recent" | "citations" | "oldest" | "title";

export const SORTS: Record<SortKey, string> = {
  recent: "最新发表",
  citations: "引用最多",
  oldest: "最早发表",
  title: "标题 A–Z",
};

export function sortPapers(papers: CatalogPaper[], sort: SortKey = "recent"): CatalogPaper[] {
  const byId = (a: CatalogPaper, b: CatalogPaper) => a.id.localeCompare(b.id);
  const comparators: Record<SortKey, (a: CatalogPaper, b: CatalogPaper) => number> = {
    recent: (a, b) => (b.year ?? 0) - (a.year ?? 0) || b.citation_count - a.citation_count || byId(a, b),
    citations: (a, b) => b.citation_count - a.citation_count || (b.year ?? 0) - (a.year ?? 0) || byId(a, b),
    oldest: (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || b.citation_count - a.citation_count || byId(a, b),
    title: (a, b) => a.title.localeCompare(b.title, "en") || byId(a, b),
  };
  return [...papers].sort(comparators[sort]);
}

export interface SearchResult {
  papers: CatalogPaper[];
  /** For each facet: option counts under every *other* active filter. */
  facets: FacetCounts;
  /** Filters after venue/ranking conflicts were resolved. */
  effective: FilterState;
}

/**
 * Filter, count facets and sort in a single pass. A paper rejected by exactly
 * one facet still counts towards that facet's options, so every option shows
 * how many results selecting it would give (disjunctive faceting).
 */
export function searchPapers(
  papers: CatalogPaper[],
  filters: FilterState,
  index: PaperSearchIndex,
  sort: SortKey = "recent",
): SearchResult {
  const effective = reconcileVenueRankingFilters(filters, papers, index).filters;
  const query = effective.q.trim().toLowerCase();
  const queryNormalized = normalizeSearchText(correctedVenueQuery(effective.q));
  const authorQuery = effective.author.trim().toLowerCase();
  const institutionQuery = effective.institution.trim().toLowerCase();
  const venueQuery = correctedVenueQuery(effective.venue).toLowerCase();
  const venueQueryNormalized = normalizeSearchText(venueQuery);
  const yearFrom = effective.yearFrom ? Number(effective.yearFrom) : null;
  const yearTo = effective.yearTo ? Number(effective.yearTo) : null;

  type Check = [FacetKey | "text", (paper: CatalogPaper, entry: PaperSearchEntry) => boolean];
  const checks: Check[] = [];
  if (query) checks.push(["text", (_, entry) => entry.searchable.includes(query) || (queryNormalized !== "" && entry.searchableNormalized.includes(queryNormalized))]);
  if (authorQuery) checks.push(["text", (_, entry) => entry.authors.some((item) => item.includes(authorQuery))]);
  if (institutionQuery) checks.push(["text", (_, entry) => entry.institutions.some((item) => item.includes(institutionQuery))]);
  if (venueQuery) checks.push(["text", (_, entry) => entry.venue.includes(venueQuery) || (venueQueryNormalized !== "" && entry.venueNormalized.includes(venueQueryNormalized))]);
  if (effective.country) checks.push(["country", (_, entry) => entry.countryKeys.includes(effective.country)]);
  if (effective.source) checks.push(["source", (paper) => paper.sources.includes(effective.source)]);
  if (effective.venueType) checks.push(["venueType", (paper) => paperVenueType(paper) === effective.venueType]);
  if (effective.task) checks.push(["task", (paper) => paper.task_tags.includes(effective.task as TaskId)]);
  if (effective.contribution) checks.push(["contribution", (paper) => paper.contribution_type === effective.contribution]);
  if (effective.review) checks.push(["review", (paper) => paper.review_status === effective.review]);
  if (effective.ccf) checks.push(["ccf", (paper) => ccfLevel(paper) === effective.ccf]);
  if (effective.journalSystem || effective.journal) {
    checks.push(["journal", (paper) => journalRankingMatches(paper, effective.journalSystem, effective.journal)]);
  }
  if (yearFrom !== null || yearTo !== null) {
    checks.push(["year", (paper) => (yearFrom === null || (paper.year ?? 0) >= yearFrom) && (yearTo === null || (paper.year ?? 9999) <= yearTo)]);
  }

  const facets = Object.fromEntries(FACET_KEYS.map((key) => [key, new Map<string, number>()])) as FacetCounts;
  const count = (key: FacetKey, paper: CatalogPaper, entry: PaperSearchEntry) => {
    const counts = facets[key];
    for (const value of facetValues(key, paper, entry, effective.journalSystem)) counts.set(value, (counts.get(value) ?? 0) + 1);
  };

  const matched: CatalogPaper[] = [];
  for (const paper of papers) {
    const entry = index.get(paper.id);
    if (!entry) continue;
    let failed: FacetKey | "text" | null = null;
    let failures = 0;
    for (const [key, check] of checks) {
      if (check(paper, entry)) continue;
      failed = key;
      failures += 1;
      if (failures > 1) break;
    }
    if (failures === 0) {
      matched.push(paper);
      for (const key of FACET_KEYS) count(key, paper, entry);
    } else if (failures === 1 && failed !== "text") {
      count(failed as FacetKey, paper, entry);
    }
  }
  return { papers: sortPapers(matched, sort), facets, effective };
}

export function filterPapers(
  papers: CatalogPaper[],
  filters: FilterState,
  institutions: Institution[] = [],
  searchIndex?: PaperSearchIndex,
): CatalogPaper[] {
  const index = searchIndex ?? buildPaperSearchIndex(papers, institutions);
  return searchPapers(papers, filters, index).papers;
}

/** Number of user-facing filters that are set. */
export function activeFilterCount(filters: FilterState): number {
  return Object.entries(filters).filter(([key, value]) => value && key !== "journalSystem").length
    + (filters.journalSystem && !filters.journal ? 1 : 0);
}

export type FilterGroupId = "task" | "year" | "venue" | "rank" | "contribution" | "people" | "source";

/**
 * Active filters per filter-panel group, one per removable chip: a year range
 * and a journal system with its zone each count once. The keyword search
 * lives in the top bar and belongs to no group.
 */
export function groupFilterCounts(filters: FilterState): Record<FilterGroupId, number> {
  const count = (...values: unknown[]) => values.filter(Boolean).length;
  return {
    task: count(filters.task),
    year: count(filters.yearFrom || filters.yearTo),
    venue: count(filters.venue, filters.venueType),
    rank: count(filters.ccf, filters.journal || filters.journalSystem),
    contribution: count(filters.contribution),
    people: count(filters.author, filters.institution, filters.country),
    source: count(filters.source, filters.review),
  };
}
