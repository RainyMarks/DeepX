import { DEFAULT_FILTERS, SORTS, type FilterState, type SortKey } from "./filters";

export type View = "overview" | "papers" | "authors" | "institutions" | "map";

export const VIEWS: Record<View, string> = {
  overview: "概览",
  papers: "论文库",
  authors: "学者",
  institutions: "机构",
  map: "研究地图",
};

export interface UrlState {
  view: View;
  filters: FilterState;
  sort: SortKey;
  /** Open paper record. */
  paper: string;
  /** Open author profile. */
  author: string;
}

export function readUrlState(search = location.search): UrlState {
  const params = new URLSearchParams(search);
  const view = params.get("view") ?? "";
  const sort = params.get("sort") ?? "";
  const filters = { ...DEFAULT_FILTERS };
  for (const key of Object.keys(filters) as (keyof FilterState)[]) filters[key] = params.get(key) ?? "";
  return {
    view: view in VIEWS ? (view as View) : "overview",
    filters,
    sort: sort in SORTS ? (sort as SortKey) : "recent",
    paper: params.get("paper") ?? "",
    author: params.get("author") ?? "",
  };
}

export function toSearch(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.view !== "overview") params.set("view", state.view);
  for (const [key, value] of Object.entries(state.filters)) if (value) params.set(key, value);
  if (state.sort !== "recent") params.set("sort", state.sort);
  if (state.paper) params.set("paper", state.paper);
  if (state.author) params.set("author", state.author);
  const search = params.toString();
  return search ? `?${search}` : "";
}
