import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FilterPanel } from "./components/FilterPanel";
import { Overview } from "./components/Overview";
import { PaperDrawer } from "./components/PaperDrawer";
import { PaperList } from "./components/PaperList";
import { AuthorDrawer, AuthorsView, InstitutionsView } from "./components/People";
import { formatNumber, Icon } from "./components/ui";
import { loadAtlasContent, loadAtlasSummary, loadAuthorAliases, loadPaperDetail } from "./data";
import { exportPapers } from "./exports";
import {
  activeFilterCount,
  buildPaperSearchIndex,
  DEFAULT_FILTERS,
  getJournalRankingAvailability,
  reconcileJournalRankingAvailability,
  searchPapers,
  SORTS,
  type FilterState,
  type SortKey,
} from "./filters";
import { summarizeAuthors } from "./insights";
import { CONTRIBUTIONS, countryName, SOURCES, TASKS, VENUE_TYPES } from "./task";
import type { AtlasData, AtlasSummary, Institution, PaperDetail, TaskId } from "./types";
import { readUrlState, toSearch, VIEWS, type UrlState, type View } from "./url";

const AtlasMap = lazy(() => import("./components/AtlasMap"));

type Theme = "light" | "dark";
type DetailState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; detail: PaperDetail };

const REPO = "https://github.com/RainyMarks/DeepX";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("atlas-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage may be unavailable; fall back to the system preference.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [summary, setSummary] = useState<AtlasSummary | null>(null);
  const [data, setData] = useState<AtlasData | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<UrlState>(() => readUrlState());
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const fromHistory = useRef(false);
  const replaceNext = useRef(false);
  const previous = useRef(state);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const { view, filters, sort } = state;

  // --- data -------------------------------------------------------------
  useEffect(() => {
    loadAtlasSummary()
      .then((next) => {
        setSummary(next);
        return loadAtlasContent(next);
      })
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  // --- theme ------------------------------------------------------------
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("atlas-theme", theme);
    } catch {
      // Ignore: the toggle still works for this visit.
    }
  }, [theme]);

  // --- URL <-> state ----------------------------------------------------
  useEffect(() => {
    const onPop = () => {
      fromHistory.current = true;
      setState(readUrlState());
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (fromHistory.current) {
      fromHistory.current = false;
      return;
    }
    const url = `${location.pathname}${toSearch(state)}`;
    const navigation = before.view !== state.view || before.paper !== state.paper || before.author !== state.author;
    if (navigation && !replaceNext.current) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
    replaceNext.current = false;
    if (before.view !== state.view) scrollTo({ top: 0 });
  }, [state]);

  const patchState = useCallback((patch: Partial<UrlState>) => setState((current) => ({ ...current, ...patch })), []);
  const updateFilters = useCallback((patch: Partial<FilterState>, nextView?: View) => {
    setState((current) => ({ ...current, filters: { ...current.filters, ...patch }, ...(nextView ? { view: nextView, paper: "", author: "" } : {}) }));
  }, []);
  const changeView = useCallback((next: View) => {
    setFiltersOpen(false);
    patchState({ view: next, paper: "", author: "" });
  }, [patchState]);
  const openPaper = useCallback((id: string) => patchState({ paper: id, author: "" }), [patchState]);
  const openAuthor = useCallback((id: string) => patchState({ author: id, paper: "" }), [patchState]);
  const closeDrawer = useCallback(() => patchState({ paper: "", author: "" }), [patchState]);
  const filterInstitution = useCallback((name: string) => updateFilters({ institution: name }, "papers"), [updateFilters]);

  // --- search -----------------------------------------------------------
  const journalAvailability = useMemo(() => getJournalRankingAvailability(data?.papers ?? []), [data]);
  useEffect(() => {
    if (!data) return;
    const reconciled = reconcileJournalRankingAvailability(filters, journalAvailability);
    if (reconciled !== filters) setState((current) => ({ ...current, filters: reconciled }));
  }, [data, filters, journalAvailability]);

  const institutionsById = useMemo(() => new Map((data?.institutions ?? []).map((item) => [item.id, item])), [data]);
  const searchIndex = useMemo(() => (data ? buildPaperSearchIndex(data.papers, data.institutions) : null), [data]);
  const deferredFilters = useDeferredValue(filters);
  const result = useMemo(
    () => (data && searchIndex ? searchPapers(data.papers, deferredFilters, searchIndex, sort) : null),
    [data, searchIndex, deferredFilters, sort],
  );
  const scoped = activeFilterCount(filters) > 0;
  const countries = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of data?.institutions ?? []) {
      const code = item.country_code || item.country;
      if (code && !names.has(code)) names.set(code, item.country || code);
    }
    return [...names.entries()].map(([code, name]) => ({ code, name }));
  }, [data]);

  const visibleAuthors = useMemo(() => (view === "authors" && result ? summarizeAuthors(result.papers) : []), [view, result]);
  const visibleInstitutions = useMemo(() => {
    if (view !== "institutions" || !result) return [];
    const counts = new Map<string, number>();
    for (const paper of result.papers) for (const id of paper.institution_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ institution: institutionsById.get(id), count }))
      .filter((row): row is { institution: Institution; count: number } => Boolean(row.institution))
      .sort((a, b) => b.count - a.count || a.institution.name.localeCompare(b.institution.name));
  }, [view, result, institutionsById]);
  const selectedAuthor = useMemo(() => {
    if (!state.author || !data) return null;
    return summarizeAuthors(data.papers.filter((paper) => paper.authors.some((author) => author.id === state.author)))
      .find((author) => author.id === state.author) ?? null;
  }, [state.author, data]);

  // Links to an author id that was later merged into another identity.
  useEffect(() => {
    if (!state.author || !data || selectedAuthor) return;
    let cancelled = false;
    loadAuthorAliases().then((aliases) => {
      const target = aliases[state.author];
      if (!cancelled && target) {
        replaceNext.current = true;
        setState((current) => (current.author === state.author ? { ...current, author: target } : current));
      }
    });
    return () => { cancelled = true; };
  }, [state.author, data, selectedAuthor]);

  // --- paper detail -----------------------------------------------------
  useEffect(() => {
    if (!state.paper || !summary) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail({ status: "loading" });
    loadPaperDetail(state.paper, summary.manifest)
      .then((record) => {
        if (cancelled) return;
        setDetail(record ? { status: "ready", detail: record } : { status: "error", message: "未找到该论文记录" });
      })
      .catch((cause) => {
        if (!cancelled) setDetail({ status: "error", message: cause instanceof Error ? cause.message : String(cause) });
      });
    return () => { cancelled = true; };
  }, [state.paper, summary]);

  // --- keyboard ---------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, select")) return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (error) {
    return <main className="load-screen" role="alert">
      <p className="eyebrow">数据加载失败</p>
      <h1>公开数据未能加载</h1>
      <p>{error}</p>
      <button className="button" type="button" onClick={() => location.reload()}>重新加载</button>
    </main>;
  }
  if (!summary) {
    return <main className="load-screen" aria-busy="true"><span className="spinner" /><p>正在载入研究图谱…</p></main>;
  }

  const paperCount = result?.papers.length ?? summary.manifest.paper_count;
  const pending = deferredFilters !== filters;

  return <div className={`app view-${view}`} data-atlas-ready={data ? "true" : undefined}>
    <a className="skip-link" href="#main">跳到主要内容</a>
    <header className="topbar">
      <button className="brand" type="button" onClick={() => changeView("overview")} aria-label="生成图像取证研究图谱 · 返回概览">
        <span className="brand-mark" aria-hidden="true">鉴</span>
        <span className="brand-text"><strong>生成图像取证研究图谱</strong><small>Synthetic Image Forensics Atlas</small></span>
      </button>
      <nav className="tabs" aria-label="主视图">
        {(Object.keys(VIEWS) as View[]).map((item) => <button
          key={item}
          type="button"
          className={view === item ? "is-active" : ""}
          aria-current={view === item ? "page" : undefined}
          onClick={() => changeView(item)}
        >{VIEWS[item]}</button>)}
      </nav>
      <label className="search">
        <Icon name="search" size={17} />
        <span className="sr-only">搜索论文</span>
        <input
          ref={searchInput}
          type="search"
          value={filters.q}
          placeholder="搜索标题、作者、机构或会议期刊"
          onChange={(event) => updateFilters({ q: event.target.value }, view === "overview" ? "papers" : undefined)}
        />
        <kbd aria-hidden="true">/</kbd>
      </label>
      <div className="topbar-actions">
        <button className="icon-button" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}>
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <a className="icon-button" href={REPO} target="_blank" rel="noreferrer" aria-label="GitHub 仓库"><Icon name="github" /></a>
      </div>
    </header>

    {view === "overview" ? <main id="main" className="page">
      {scoped && <ActiveFilters filters={filters} onChange={updateFilters} onReset={() => patchState({ filters: DEFAULT_FILTERS })} lead="概览统计已限定在当前筛选范围：" />}
      <Overview
        manifest={summary.manifest}
        stats={summary.stats}
        papers={result?.papers ?? null}
        scoped={scoped}
        institutions={institutionsById}
        onFilter={updateFilters}
        onView={changeView}
        onPaper={openPaper}
      />
    </main> : <div className="workspace">
      <FilterPanel
        filters={filters}
        facets={result?.facets ?? null}
        countries={countries}
        journalAvailability={journalAvailability}
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onChange={updateFilters}
        onReset={() => patchState({ filters: DEFAULT_FILTERS })}
        resultCount={paperCount}
      />
      {filtersOpen && <div className="drawer-scrim filter-scrim" onClick={() => setFiltersOpen(false)} />}
      <main id="main" className={`results${pending ? " is-pending" : ""}`}>
        <div className="results-head">
          <div>
            <h1>{VIEWS[view]}</h1>
            <p className="results-count" aria-live="polite">
              {view === "authors" ? <><strong>{formatNumber(visibleAuthors.length)}</strong> 位学者 · 来自 </> : view === "institutions" ? <><strong>{formatNumber(visibleInstitutions.length)}</strong> 个机构 · 来自 </> : null}
              <strong data-testid="result-count">{formatNumber(paperCount)}</strong> 篇论文
            </p>
          </div>
          <div className="results-tools">
            <button className="button filter-toggle" type="button" onClick={() => setFiltersOpen(true)}>
              <Icon name="filter" size={16} />筛选{activeFilterCount(filters) ? `（${activeFilterCount(filters)}）` : ""}
            </button>
            {view === "papers" && <label className="sort">
              <span>排序</span>
              <select value={sort} onChange={(event) => patchState({ sort: event.target.value as SortKey })}>
                {Object.entries(SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>}
            {(view === "papers" || view === "map") && result && <ExportMenu onExport={(format) => exportPapers(result.papers, format)} />}
          </div>
        </div>
        <ActiveFilters filters={filters} onChange={updateFilters} onReset={() => patchState({ filters: DEFAULT_FILTERS })} />
        {!result ? <div className="loading-block" role="status"><span className="spinner" />正在载入论文、作者与机构索引…</div> : <>
          {view === "papers" && <PaperList papers={result.papers} onPaper={openPaper} onAuthor={openAuthor} selectedId={state.paper} />}
          {view === "authors" && <AuthorsView authors={visibleAuthors} onAuthor={openAuthor} />}
          {view === "institutions" && <InstitutionsView rows={visibleInstitutions} onInstitution={filterInstitution} />}
          {view === "map" && data && <Suspense fallback={<div className="loading-block"><span className="spinner" />正在载入地图…</div>}>
            <AtlasMap papers={result.papers} institutions={data.institutions} theme={theme} covered={Boolean(state.paper || state.author)} onPaper={openPaper} onInstitution={filterInstitution} />
          </Suspense>}
        </>}
      </main>
    </div>}

    {view !== "map" && <footer className="footer">
      <div>
        <strong>生成图像取证研究图谱</strong>
        <span>数据版本 {summary.manifest.dataset_version} · {summary.manifest.data_notice}</span>
      </div>
      <nav aria-label="页脚">
        <a href={`${import.meta.env.BASE_URL}methodology.html`}>数据方法</a>
        <a href={`${import.meta.env.BASE_URL}data/v1/catalog.json`}>下载目录 JSON</a>
        <a href={`${import.meta.env.BASE_URL}data/v1/quality.json`}>质量报告</a>
        <a href={`${REPO}/issues/new/choose`} target="_blank" rel="noreferrer">补充与纠错</a>
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
      </nav>
    </footer>}

    {state.paper && detail && <PaperDrawer state={detail} institutions={institutionsById} onClose={closeDrawer} onAuthor={openAuthor} onInstitution={filterInstitution} />}
    {state.author && data && <AuthorDrawer
      author={selectedAuthor}
      institutions={institutionsById}
      onClose={closeDrawer}
      onPaper={openPaper}
      onAuthor={openAuthor}
      onAllPapers={(name) => updateFilters({ author: name }, "papers")}
    />}
  </div>;
}

function ExportMenu({ onExport }: { onExport: (format: "csv" | "json" | "bib") => void }) {
  return <details className="menu">
    <summary className="button"><Icon name="download" size={16} />导出</summary>
    <div className="menu-items" role="menu" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); }}>
      <button type="button" role="menuitem" onClick={() => onExport("csv")}>CSV 表格</button>
      <button type="button" role="menuitem" onClick={() => onExport("bib")}>BibTeX</button>
      <button type="button" role="menuitem" onClick={() => onExport("json")}>JSON</button>
    </div>
  </details>;
}

const ZONE_LABELS: Record<string, string> = { "1": "一区/Q1", "2": "二区/Q2", "3": "三区/Q3", "4": "四区/Q4", TOP: "TOP" };

function filterChips(filters: FilterState): { label: string; clear: Partial<FilterState> }[] {
  const chips: { label: string; clear: Partial<FilterState> }[] = [];
  if (filters.q) chips.push({ label: `关键词：${filters.q}`, clear: { q: "" } });
  if (filters.task) chips.push({ label: TASKS[filters.task as TaskId]?.label ?? filters.task, clear: { task: "" } });
  if (filters.yearFrom || filters.yearTo) {
    const label = filters.yearFrom === filters.yearTo ? `${filters.yearFrom} 年` : `${filters.yearFrom || "最早"}–${filters.yearTo || "至今"}`;
    chips.push({ label, clear: { yearFrom: "", yearTo: "" } });
  }
  if (filters.venue) chips.push({ label: `渠道：${filters.venue}`, clear: { venue: "" } });
  if (filters.venueType) chips.push({ label: VENUE_TYPES[filters.venueType] ?? filters.venueType, clear: { venueType: "" } });
  if (filters.ccf) chips.push({ label: `CCF-${filters.ccf}`, clear: { ccf: "" } });
  if (filters.journal || filters.journalSystem) {
    const system = filters.journalSystem === "CAS" ? "中科院" : filters.journalSystem === "JCR" ? "JCR" : "期刊";
    chips.push({ label: `${system} ${filters.journal ? ZONE_LABELS[filters.journal] ?? filters.journal : "有分区"}`, clear: { journal: "", journalSystem: "" } });
  }
  if (filters.contribution) chips.push({ label: CONTRIBUTIONS[filters.contribution as keyof typeof CONTRIBUTIONS] ?? filters.contribution, clear: { contribution: "" } });
  if (filters.author) chips.push({ label: `作者：${filters.author}`, clear: { author: "" } });
  if (filters.institution) chips.push({ label: `机构：${filters.institution}`, clear: { institution: "" } });
  if (filters.country) chips.push({ label: countryName(filters.country, filters.country), clear: { country: "" } });
  if (filters.source) chips.push({ label: `来源：${SOURCES[filters.source] ?? filters.source}`, clear: { source: "" } });
  if (filters.review) chips.push({ label: filters.review === "verified" ? "人工核验" : "待复核", clear: { review: "" } });
  return chips;
}

function ActiveFilters({ filters, onChange, onReset, lead }: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  lead?: string;
}) {
  const chips = filterChips(filters);
  if (!chips.length) return null;
  return <div className="active-filters" aria-label="已选筛选条件">
    {lead && <span className="muted">{lead}</span>}
    {chips.map((chip) => <button key={chip.label} type="button" className="chip is-active" onClick={() => onChange(chip.clear)} aria-label={`移除筛选：${chip.label}`}>
      {chip.label}<Icon name="close" size={13} />
    </button>)}
    <button type="button" className="link-button" onClick={onReset}>清除全部</button>
  </div>;
}
