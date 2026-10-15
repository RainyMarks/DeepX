import { useMemo, type ReactNode } from "react";
import type { FilterState } from "../filters";
import { taskCounts, taskYearSeries, topCountries, topInstitutions, topVenues, yearCounts } from "../insights";
import { CONTRIBUTIONS, countryName, TASK_ORDER, TASKS } from "../task";
import type { CatalogPaper, Institution, Manifest, Stats, TaskId } from "../types";
import type { View } from "../url";
import { Sparkline, YearBars } from "./charts";
import { formatNumber, Icon, RankingBadges, TaskTag, taskStyle } from "./ui";

interface Props {
  manifest: Manifest;
  stats: Stats;
  /** Papers in the current filter scope; null while the catalog is loading. */
  papers: CatalogPaper[] | null;
  scoped: boolean;
  institutions: Map<string, Institution>;
  onFilter: (patch: Partial<FilterState>, view?: View) => void;
  onView: (view: View) => void;
  onPaper: (id: string) => void;
}

const TREND_START = 2000;

export function Overview({ manifest, stats, papers, scoped, institutions, onFilter, onView, onPaper }: Props) {
  const lastYear = useMemo(() => Math.max(...Object.keys(stats.years).map(Number)), [stats]);
  const trendYears = useMemo(() => Array.from({ length: lastYear - TREND_START + 1 }, (_, index) => TREND_START + index), [lastYear]);
  const sparkYears = trendYears.slice(-16);

  const insight = useMemo(() => {
    if (!papers) return null;
    return {
      tasks: taskCounts(papers),
      years: yearCounts(papers),
      series: taskYearSeries(papers, sparkYears),
      venues: topVenues(papers, 10),
      institutions: topInstitutions(papers, institutions, 10),
      countries: topCountries(papers, institutions, 10),
      cited: [...papers].sort((a, b) => b.citation_count - a.citation_count).slice(0, 6),
    };
  }, [papers, institutions, sparkYears]);

  const tasks = insight?.tasks ?? new Map(stats.tasks.map((task) => [task.id, task.count]));
  const years = insight?.years ?? new Map(Object.entries(stats.years).map(([year, count]) => [Number(year), count]));
  const total = papers?.length ?? manifest.paper_count;
  const recent = [lastYear - 2, lastYear - 1, lastYear].reduce((sum, year) => sum + (years.get(year) ?? 0), 0);

  return <div className="overview">
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Synthetic Image Forensics Atlas · 数据版本 {manifest.dataset_version}</p>
        <h1>生成图像取证研究图谱</h1>
        <p className="lede">面向中文研究者的图像取证文献索引：汇集 AI 生成图像检测、来源归因、深度伪造、篡改定位、隐写分析与数字水印等方向的论文，按研究方向、发表渠道与学术等级组织，每条记录均可追溯到原始来源。</p>
        <div className="hero-actions">
          <button className="button primary" type="button" onClick={() => onView("papers")}>浏览论文库 <Icon name="arrow" size={16} /></button>
          <button className="button" type="button" onClick={() => onView("map")}>查看研究地图</button>
          <a className="button ghost" href={`${import.meta.env.BASE_URL}methodology.html`}>数据方法</a>
        </div>
      </div>
      <dl className="metrics">
        <div><dt>{scoped ? "当前范围论文" : "收录论文"}</dt><dd>{formatNumber(total)}</dd></div>
        <div><dt>学者</dt><dd>{formatNumber(manifest.author_count)}</dd></div>
        <div><dt>研究机构</dt><dd>{formatNumber(manifest.institution_count)}</dd></div>
        <div><dt>国家/地区</dt><dd>{manifest.country_count}</dd></div>
        <div><dt>近三年新增</dt><dd>{formatNumber(recent)}</dd></div>
      </dl>
    </section>

    <section className="section">
      <header className="section-head">
        <h2>研究方向</h2>
        <p>八个方向覆盖从生成痕迹到内容来源的完整取证链条。一篇论文可同时属于多个方向。</p>
      </header>
      <div className="task-grid">
        {TASK_ORDER.map((task) => <TaskCard
          key={task}
          task={task}
          count={tasks.get(task) ?? 0}
          total={total}
          series={insight?.series[task] ?? null}
          range={`${sparkYears[0]}–${sparkYears.at(-1)}`}
          onSelect={() => onFilter({ task }, "papers")}
        />)}
      </div>
    </section>

    <section className="section split">
      <div className="panel">
        <header className="panel-head"><h2>年度发表趋势</h2><span>{TREND_START}–{lastYear} · 点击柱形按年份筛选</span></header>
        <YearBars counts={years} from={TREND_START} to={lastYear} onSelect={(year) => onFilter({ yearFrom: String(year), yearTo: String(year) }, "papers")} />
      </div>
      <div className="panel">
        <header className="panel-head"><h2>高被引论文</h2><span>按引用快照排序</span></header>
        {insight ? <ol className="cited-list">
          {insight.cited.map((paper) => <li key={paper.id}>
            <button type="button" onClick={() => onPaper(paper.id)}>
              <span className="cited-title">{paper.title}</span>
              <span className="cited-meta">{[paper.year, paper.venue?.short_name || paper.venue?.name, CONTRIBUTIONS[paper.contribution_type]].filter(Boolean).join(" · ")}</span>
            </button>
            <strong title="引用快照">{formatNumber(paper.citation_count)}</strong>
          </li>)}
        </ol> : <Skeleton rows={6} />}
      </div>
    </section>

    <section className="section triple">
      <RankPanel
        title="主要发表渠道"
        hint="会议与期刊"
        rows={insight?.venues.map(([venue, count]) => ({
          key: venue.id,
          label: venue.short_name || venue.name,
          title: venue.name,
          extra: <RankingBadges venue={venue} />,
          count,
          onClick: () => onFilter({ venue: venue.short_name || venue.name }, "papers"),
        }))}
      />
      <RankPanel
        title="活跃研究机构"
        hint="按署名论文数"
        rows={insight?.institutions.map(([institution, count]) => ({
          key: institution.id,
          label: institution.name,
          title: institution.name,
          extra: <small>{countryName(institution.country_code, institution.country)}</small>,
          count,
          onClick: () => onFilter({ institution: institution.name }, "papers"),
        }))}
      />
      <RankPanel
        title="国家与地区"
        hint="论文按署名机构所在地计"
        rows={insight?.countries.map(([country, count]) => ({
          key: country.code,
          label: countryName(country.code, country.name),
          title: country.name,
          count,
          onClick: () => onFilter({ country: country.code }, "papers"),
        }))}
      />
    </section>

    <section className="section notice">
      <h2>使用说明与数据边界</h2>
      <ul>
        <li>收录范围限定为图像取证；纯 OCR、普通相机型号归因，以及音频、视频与文本隐写不在本图谱内。</li>
        <li>CCF 等级只用于会议；期刊分区使用中科院 2025（大类）与 JCR 2026，每个徽章都链接到核验来源。等级描述的是发表渠道，不代表单篇论文质量。</li>
        <li>元数据来自 OpenAlex、Crossref、arXiv、Semantic Scholar、DBLP 等公开来源，可能存在误差，请以论文原始页面为准。发现错误可在 GitHub 提交纠错。</li>
      </ul>
    </section>
  </div>;
}

function TaskCard({ task, count, total, series, range, onSelect }: {
  task: TaskId;
  count: number;
  total: number;
  series: number[] | null;
  range: string;
  onSelect: () => void;
}) {
  const share = total ? Math.round((count / total) * 100) : 0;
  return <button className="task-card" type="button" style={taskStyle(task)} onClick={onSelect}>
    <span className="task-card-head"><TaskTag task={task} /><span>{share}%</span></span>
    <strong>{TASKS[task].label}</strong>
    <span className="task-card-desc">{TASKS[task].description}</span>
    <span className="task-card-foot">
      <b>{formatNumber(count)}<small> 篇</small></b>
      {series ? <Sparkline values={series} color={TASKS[task].color} label={`${TASKS[task].label} ${range} 年度论文数`} /> : <span className="sparkline placeholder" />}
    </span>
  </button>;
}

interface RankRow {
  key: string;
  label: string;
  title: string;
  extra?: ReactNode;
  count: number;
  onClick: () => void;
}

function RankPanel({ title, hint, rows }: { title: string; hint: string; rows: RankRow[] | undefined }) {
  const max = Math.max(1, ...(rows ?? []).map((row) => row.count));
  return <div className="panel">
    <header className="panel-head"><h2>{title}</h2><span>{hint}</span></header>
    {rows ? rows.length ? <ol className="rank-list">
      {rows.map((row) => <li key={row.key}>
        <button type="button" onClick={row.onClick} title={row.title}>
          <span className="rank-label"><span>{row.label}</span>{row.extra}</span>
          <span className="rank-bar"><i style={{ width: `${(row.count / max) * 100}%` }} /></span>
          <strong>{formatNumber(row.count)}</strong>
        </button>
      </li>)}
    </ol> : <p className="empty">当前范围没有数据。</p> : <Skeleton rows={8} />}
  </div>;
}

export function Skeleton({ rows }: { rows: number }) {
  return <div className="skeleton" aria-hidden="true">{Array.from({ length: rows }, (_, index) => <i key={index} />)}</div>;
}
