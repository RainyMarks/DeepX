import { useEffect, useMemo, useState } from "react";
import { AtlasMap } from "./components/AtlasMap";
import { loadAtlasContent, loadAtlasSummary, loadPaperDetail } from "./data";
import { exportPapers } from "./exports";
import { DEFAULT_FILTERS, filterPapers, type FilterState } from "./filters";
import { CONTRIBUTIONS, TASKS } from "./task";
import type { AtlasData, AtlasSummary, Author, CatalogPaper, Institution, PaperDetail, TaskId } from "./types";

type View = "map" | "papers" | "authors" | "institutions";

function readInitialState(): { view: View; filters: FilterState } {
  const params = new URLSearchParams(location.search);
  const view = (["map", "papers", "authors", "institutions"].includes(params.get("view") ?? "") ? params.get("view") : "map") as View;
  const filters = { ...DEFAULT_FILTERS };
  Object.keys(filters).forEach((key) => { filters[key as keyof FilterState] = params.get(key) ?? ""; });
  return { view, filters };
}

function rankingLabel(paper: CatalogPaper, system: string) {
  const ranking = paper.venue?.rankings.find((item) => item.system === system);
  if (!ranking) return "";
  if (system === "CAS") return `中科院 ${ranking.level}${ranking.is_top ? " · TOP" : ""}`;
  if (system === "JCR") return `JCR ${ranking.level}`;
  return `${system}-${ranking.level}`;
}

function PaperCard({ paper, onOpen }: { paper: CatalogPaper; onOpen: () => void }) {
  const ccf = rankingLabel(paper, "CCF");
  const cas = rankingLabel(paper, "CAS");
  const jcr = rankingLabel(paper, "JCR");
  return <article className="paper-card" tabIndex={0} onClick={onOpen} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
    <div className="paper-card-top"><span className={`review-dot ${paper.review_status}`}>{paper.review_status === "verified" ? "已核验" : "待复核"}</span><span>{paper.year ?? "年份待补"}</span></div>
    <h3>{paper.title}</h3>
    <p className="paper-authors">{paper.authors.slice(0, 5).map((item) => item.name).join("，")}{paper.authors.length > 5 ? " 等" : ""}</p>
    <div className="paper-venue"><strong>{paper.venue?.short_name || paper.venue?.name || "来源待补"}</strong><span>{CONTRIBUTIONS[paper.contribution_type]}</span></div>
    <div className="tag-row">{paper.task_tags.slice(0, 3).map((task) => <span key={task} style={{ "--tag": TASKS[task].color } as React.CSSProperties}>{TASKS[task].short}</span>)}{[ccf, cas, jcr].filter(Boolean).map((item) => <b key={item}>{item}</b>)}</div>
  </article>;
}

function DetailPanel({ detail, onClose }: { detail: PaperDetail | null; onClose: () => void }) {
  if (!detail) return null;
  return <aside className="detail-panel" aria-label="论文详情">
    <button className="detail-close" type="button" onClick={onClose} aria-label="关闭详情">×</button>
    <div className="detail-scroll">
      <span className="detail-index">PAPER RECORD · {detail.year ?? "N.D."}</span>
      <h2>{detail.title}</h2>
      <p className="detail-authors">{detail.authors.map((item) => item.name).join(" · ")}</p>
      <div className="detail-badges"><span className={detail.review_status}>{detail.review_status === "verified" ? "人工核验核心集" : "自动收录 · 待复核"}</span>{detail.venue?.rankings.map((rank) => <a key={`${rank.system}-${rank.version}`} href={rank.source_url} target="_blank" rel="noreferrer">{rank.system} {rank.level}{rank.is_top ? " TOP" : ""} · {rank.version}</a>)}</div>
      <section><h3>摘要</h3><p>{detail.abstract || "当前来源未提供摘要。"}</p></section>
      <section><h3>任务归类</h3><div className="task-stack">{detail.task_tags.map((task) => <span key={task} style={{ borderColor: TASKS[task].color }}>{TASKS[task].label}</span>)}</div></section>
      <section><h3>书目信息</h3><dl><div><dt>Venue</dt><dd>{detail.venue?.name || "待补"}</dd></div><div><dt>DOI</dt><dd>{detail.doi || "—"}</dd></div><div><dt>arXiv</dt><dd>{detail.arxiv_id || "—"}</dd></div><div><dt>引用快照</dt><dd>{detail.citation_count}</dd></div></dl></section>
      <section><h3>数据来源</h3>{detail.provenance.map((item, index) => <p className="source-line" key={`${item.source}-${index}`}><strong>{item.source}</strong><span>{item.source_id}</span><small>{item.retrieved_at}</small></p>)}</section>
      <a className="primary-link" href={detail.primary_url} target="_blank" rel="noreferrer">访问论文原始页面 ↗</a>
    </div>
  </aside>;
}

function AuthorPanel({ author, papers, institutions, onPaper, onAllPapers, onClose }: {
  author: Author | null;
  papers: CatalogPaper[];
  institutions: Institution[];
  onPaper: (id: string) => void;
  onAllPapers: (name: string) => void;
  onClose: () => void;
}) {
  if (!author) return null;
  const paperIds = new Set(author.paper_ids);
  const authored = papers.filter((paper) => paperIds.has(paper.id));
  const coauthorCounts = new Map<string, { name: string; count: number }>();
  authored.forEach((paper) => paper.authors.filter((item) => item.id !== author.id).forEach((item) => {
    const current = coauthorCounts.get(item.id);
    coauthorCounts.set(item.id, { name: item.name, count: (current?.count ?? 0) + 1 });
  }));
  const coauthors = [...coauthorCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 12);
  const institutionIds = new Set([...author.institution_ids, ...authored.flatMap((paper) => paper.institution_ids)]);
  const authorInstitutions = institutions.filter((item) => institutionIds.has(item.id));
  const years = new Map<number, number>();
  authored.forEach((paper) => paper.year && years.set(paper.year, (years.get(paper.year) ?? 0) + 1));
  const timeline = [...years.entries()].sort((a, b) => a[0] - b[0]);
  const maxYear = Math.max(...timeline.map((item) => item[1]), 1);
  return <aside className="detail-panel author-panel" aria-label="作者档案">
    <button className="detail-close" type="button" onClick={onClose} aria-label="关闭作者档案">×</button>
    <div className="detail-scroll">
      <span className="detail-index">AUTHOR RECORD · 同领域论文限定</span>
      <h2>{author.name}</h2>
      <p className="detail-authors">{authored.length} 篇图谱内论文 · {coauthors.length} 位主要合作者</p>
      <section><h3>任务分布</h3><div className="task-stack">{Object.entries(author.task_counts).sort((a, b) => b[1] - a[1]).map(([task, count]) => <span key={task} style={{ borderColor: TASKS[task as TaskId]?.color }}>{TASKS[task as TaskId]?.label} · {count}</span>)}</div></section>
      <section><h3>年度趋势</h3><div className="year-timeline">{timeline.map(([year, count]) => <div key={year}><span>{year}</span><i style={{ width: `${Math.max(8, count / maxYear * 100)}%` }} /><b>{count}</b></div>)}</div></section>
      <section><h3>机构经历（图谱元数据）</h3>{authorInstitutions.length ? <div className="author-institutions">{authorInstitutions.map((item) => <p key={item.id}><strong>{item.name}</strong><span>{[item.city, item.country].filter(Boolean).join(" · ")}</span></p>)}</div> : <p>当前公开来源未解析出可靠机构。</p>}</section>
      <section><h3>主要合作作者</h3><div className="coauthor-list">{coauthors.map((item) => <span key={item.name}>{item.name}<b>{item.count}</b></span>)}</div></section>
      <section><h3>同领域论文</h3><div className="author-paper-list">{authored.slice(0, 30).map((paper) => <button key={paper.id} type="button" onClick={() => onPaper(paper.id)}><span>{paper.year ?? "—"}</span>{paper.title}</button>)}</div></section>
      <button className="primary-link author-all-button" type="button" onClick={() => onAllPapers(author.name)}>在论文库查看全部 {authored.length} 篇 →</button>
    </div>
  </aside>;
}

export default function App() {
  const initial = useMemo(readInitialState, []);
  const [summary, setSummary] = useState<AtlasSummary | null>(null);
  const [data, setData] = useState<AtlasData | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>(initial.view);
  const [filters, setFilters] = useState<FilterState>(initial.filters);
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [selectedAuthorId, setSelectedAuthorId] = useState("");
  const [mobileFilters, setMobileFilters] = useState(false);

  useEffect(() => {
    loadAtlasSummary()
      .then((nextSummary) => {
        setSummary(nextSummary);
        return loadAtlasContent(nextSummary);
      })
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [view, filters]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return filterPapers(data.papers, filters, data.institutions);
  }, [data, filters]);

  const filteredIds = useMemo(() => new Set(filtered.map((paper) => paper.id)), [filtered]);
  const visibleAuthors = useMemo(() => data?.authors.map((author) => ({ ...author, visible: author.paper_ids.filter((id) => filteredIds.has(id)) })).filter((author) => author.visible.length).sort((a, b) => b.visible.length - a.visible.length) ?? [], [data, filteredIds]);
  const visibleInstitutions = useMemo(() => data?.institutions.map((institution) => ({ ...institution, visible: institution.paper_ids.filter((id) => filteredIds.has(id)) })).filter((institution) => institution.visible.length).sort((a, b) => b.visible.length - a.visible.length) ?? [], [data, filteredIds]);
  const selectedAuthor = useMemo(() => data?.authors.find((author) => author.id === selectedAuthorId) ?? null, [data, selectedAuthorId]);
  const countryOptions = useMemo(() => [...new Map((data?.institutions ?? []).filter((item) => item.country_code || item.country).map((item) => [item.country_code || item.country, item.country || item.country_code])).entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN")), [data]);
  const sourceOptions = useMemo(() => [...new Set((data?.papers ?? []).flatMap((paper) => paper.sources))].sort(), [data]);

  async function openPaper(id: string) { setDetail(await loadPaperDetail(id)); }
  function update<K extends keyof FilterState>(key: K, value: FilterState[K]) { setFilters((current) => ({ ...current, [key]: value })); }

  if (error) return <main className="load-state"><span>DATA LOAD ERROR</span><h1>公开数据未能加载</h1><p>{error}</p><code>python -m atlas.cli publish</code></main>;
  if (!summary) return <main className="load-state"><div className="loading-orbit" /><span>正在展开研究图谱</span><h1>装订论文、作者与机构关系…</h1></main>;
  if (!data) return <div className="app-shell summary-shell" aria-busy="true">
    <header className="masthead">
      <div className="brand-block"><span className="brand-seal">鉴</span><div><p>GENERATIVE IMAGE FORENSICS · 中文研究基础设施</p><h1>生成图像取证研究图谱</h1></div></div>
      <nav aria-label="主视图"><button className="active" disabled>世界地图</button><button disabled>论文库</button><button disabled>作者图谱</button><button disabled>机构图谱</button></nav>
      <div className="dataset-stamp"><strong>DATASET</strong><span>{summary.manifest.dataset_version}</span><small>{summary.manifest.paper_count.toLocaleString()} 篇论文</small></div>
    </header>
    <section className="hero-strip">
      <div><span>PUBLIC RESEARCH ATLAS</span><h2>从真假判断，到生成来源与篡改位置。</h2><p>聚合论文、作者、机构、地理位置与学术等级，持续追踪生成图像取证研究的演进。</p></div>
      <dl><div><dt>论文</dt><dd>{summary.manifest.paper_count.toLocaleString()}</dd></div><div><dt>已核验</dt><dd>{summary.manifest.verified_paper_count.toLocaleString()}</dd></div><div><dt>作者</dt><dd>{summary.manifest.author_count.toLocaleString()}</dd></div><div><dt>国家/地区</dt><dd>{summary.manifest.country_count}</dd></div></dl>
    </section>
    <main className="load-state content-loading"><div className="loading-orbit" /><span>摘要已就绪</span><h2>正在按需装载论文、作者与机构索引…</h2></main>
  </div>;

  const maxTask = Math.max(...data.stats.tasks.map((item) => item.count), 1);
  return <div className="app-shell" data-atlas-ready="true">
    <header className="masthead">
      <div className="brand-block"><span className="brand-seal">鉴</span><div><p>GENERATIVE IMAGE FORENSICS · 中文研究基础设施</p><h1>生成图像取证研究图谱</h1></div></div>
      <nav aria-label="主视图">{(["map", "papers", "authors", "institutions"] as View[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{({ map: "世界地图", papers: "论文库", authors: "作者图谱", institutions: "机构图谱" } as Record<View, string>)[item]}</button>)}</nav>
      <div className="dataset-stamp"><strong>DATASET</strong><span>{data.manifest.dataset_version}</span><small>{data.manifest.paper_count.toLocaleString()} 篇论文</small></div>
    </header>

    <section className="hero-strip">
      <div><span>PUBLIC RESEARCH ATLAS</span><h2>从真假判断，到生成来源与篡改位置。</h2><p>聚合论文、作者、机构、地理位置与学术等级，持续追踪生成图像取证研究的演进。</p></div>
      <dl><div><dt>论文</dt><dd>{data.manifest.paper_count.toLocaleString()}</dd></div><div><dt>已核验</dt><dd>{data.manifest.verified_paper_count.toLocaleString()}</dd></div><div><dt>作者</dt><dd>{data.manifest.author_count.toLocaleString()}</dd></div><div><dt>国家/地区</dt><dd>{data.manifest.country_count}</dd></div></dl>
    </section>

    <button className="mobile-filter-button" onClick={() => setMobileFilters((value) => !value)}>筛选与导出 · {filtered.length}</button>
    <div className="workspace">
      <aside className={`filter-rail ${mobileFilters ? "open" : ""}`}>
        <div className="filter-heading"><span>FILTER INDEX</span><h2>筛选索引</h2><button onClick={() => setFilters(DEFAULT_FILTERS)}>清空</button></div>
        <label>关键词<input value={filters.q} onChange={(e) => update("q", e.target.value)} placeholder="标题、作者、机构、Venue" /></label>
        <label>作者<input value={filters.author} onChange={(e) => update("author", e.target.value)} placeholder="作者姓名" /></label>
        <label>机构<input value={filters.institution} onChange={(e) => update("institution", e.target.value)} placeholder="机构名称" /></label>
        <label>国家/地区<select value={filters.country} onChange={(e) => update("country", e.target.value)}><option value="">全部国家/地区</option>{countryOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label>Venue / Source<input value={filters.venue} onChange={(e) => update("venue", e.target.value)} placeholder="CVPR、TIFS、arXiv…" /></label>
        <label>数据源<select value={filters.source} onChange={(e) => update("source", e.target.value)}><option value="">全部数据源</option>{sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
        <label>研究任务<select value={filters.task} onChange={(e) => update("task", e.target.value)}><option value="">全部任务</option>{Object.entries(TASKS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
        <label>贡献类型<select value={filters.contribution} onChange={(e) => update("contribution", e.target.value)}><option value="">全部类型</option>{Object.entries(CONTRIBUTIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <div className="split-filter"><label>起始年份<input type="number" value={filters.yearFrom} onChange={(e) => update("yearFrom", e.target.value)} placeholder="2000" /></label><label>结束年份<input type="number" value={filters.yearTo} onChange={(e) => update("yearTo", e.target.value)} placeholder="2026" /></label></div>
        <label>审核状态<select value={filters.review} onChange={(e) => update("review", e.target.value)}><option value="">全部状态</option><option value="verified">人工核验核心集</option><option value="auto">自动收录待复核</option></select></label>
        <label>CCF 等级<select value={filters.ccf} onChange={(e) => update("ccf", e.target.value)}><option value="">全部等级</option><option value="A">CCF-A</option><option value="B">CCF-B</option><option value="C">CCF-C</option></select></label>
        <label>期刊分区<select value={filters.journal} onChange={(e) => update("journal", e.target.value)}><option value="">全部分区</option><option value="1">一区 / Q1</option><option value="2">二区 / Q2</option><option value="3">三区 / Q3</option><option value="4">四区 / Q4</option><option value="TOP">TOP</option></select></label>
        <div className="filter-result"><span>当前结果</span><strong>{filtered.length.toLocaleString()}</strong><small>唯一论文</small></div>
        <div className="export-row"><button onClick={() => exportPapers(filtered, "csv")}>CSV</button><button onClick={() => exportPapers(filtered, "json")}>JSON</button><button onClick={() => exportPapers(filtered, "bib")}>BibTeX</button></div>
      </aside>

      <main className="content-stage">
        {view === "map" && <section className="map-view">
          <div className="map-frame"><div className="map-caption"><span>机构聚合点随缩放展开</span><span>连线表示当前筛选论文中的机构合作</span></div><AtlasMap papers={filtered} institutions={data.institutions} onPaper={openPaper} /></div>
          <aside className="stats-column"><div className="section-label">TASK DISTRIBUTION</div><h2>研究任务分布</h2>{data.stats.tasks.map((item) => <button key={item.id} className="task-bar" onClick={() => update("task", filters.task === item.id ? "" : item.id)}><span>{item.label}</span><b>{filtered.filter((paper) => paper.task_tags.includes(item.id)).length}</b><i style={{ width: `${(item.count / maxTask) * 100}%`, background: TASKS[item.id].color }} /></button>)}<div className="stats-note"><strong>{visibleInstitutions.length}</strong><span>个机构进入当前视图</span><p>{data.manifest.data_notice}</p></div></aside>
        </section>}
        {view === "papers" && <section className="library-view"><div className="view-heading"><div><span>PAPER LIBRARY</span><h2>论文库</h2></div><p>按年份与引用快照排序，点击卡片查看摘要、来源和等级版本。</p></div><div className="paper-grid">{filtered.slice(0, 600).map((paper) => <PaperCard key={paper.id} paper={paper} onOpen={() => openPaper(paper.id)} />)}</div>{filtered.length > 600 && <p className="limit-note">当前展示前 600 条；导出包含全部 {filtered.length} 条结果。</p>}</section>}
        {view === "authors" && <section className="directory-view"><div className="view-heading"><div><span>AUTHOR ATLAS</span><h2>作者图谱</h2></div><p>仅统计图谱范围内的同领域论文，不混入作者其他研究方向。</p></div><div className="directory-grid">{visibleAuthors.slice(0, 240).map((author, index) => <article key={author.id}><span className="directory-rank">{String(index + 1).padStart(2, "0")}</span><h3>{author.name}</h3><strong>{author.visible.length} 篇同领域论文</strong><div className="mini-tasks">{Object.entries(author.task_counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([task, count]) => <span key={task}>{TASKS[task as TaskId]?.short} {count}</span>)}</div><button onClick={() => setSelectedAuthorId(author.id)}>打开作者档案 →</button></article>)}</div></section>}
        {view === "institutions" && <section className="directory-view"><div className="view-heading"><div><span>INSTITUTION INDEX</span><h2>机构图谱</h2></div><p>坐标必须具有来源；未经确认的坐标不会用于地图定位。</p></div><div className="institution-list">{visibleInstitutions.slice(0, 300).map((institution, index) => <article key={institution.id}><span>{String(index + 1).padStart(3, "0")}</span><div><h3>{institution.name}</h3><p>{[institution.city, institution.country].filter(Boolean).join(" · ") || "地点待核验"}</p></div><strong>{institution.visible.length}<small>篇论文</small></strong><b className={institution.latitude != null ? "mapped" : "unmapped"}>{institution.latitude != null ? "已定位" : "待定位"}</b></article>)}</div></section>}
      </main>
    </div>
    <footer><div><strong>生成图像取证研究图谱</strong><span>数据不是完整书目，等级也不代表单篇论文质量。</span></div><nav><a href={`${import.meta.env.BASE_URL}methodology.html`}>数据方法</a><a href={`${import.meta.env.BASE_URL}data/v1/manifest.json`}>Manifest</a><a href={`${import.meta.env.BASE_URL}data/v1/catalog.json`}>论文 JSON</a><a href={`${import.meta.env.BASE_URL}data/v1/quality.json`}>质量报告</a><a href="https://github.com/RainyMarks/DeepX/issues/new" target="_blank" rel="noreferrer">补充/纠错</a><a href="https://github.com/RainyMarks/DeepX" target="_blank" rel="noreferrer">GitHub</a></nav></footer>
    <DetailPanel detail={detail} onClose={() => setDetail(null)} />
    <AuthorPanel author={selectedAuthor} papers={data.papers} institutions={data.institutions} onPaper={(id) => { setSelectedAuthorId(""); void openPaper(id); }} onAllPapers={(name) => { update("author", name); setView("papers"); setSelectedAuthorId(""); }} onClose={() => setSelectedAuthorId("")} />
  </div>;
}
