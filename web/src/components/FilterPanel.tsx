import type { CSSProperties, ReactNode } from "react";
import { correctedVenueQuery, type FacetCounts, type FacetKey, type FilterState, type JournalRankingAvailability } from "../filters";
import { CONTRIBUTIONS, countryName, SOURCES, TASK_ORDER, TASKS, VENUE_TYPES } from "../task";
import { formatNumber, Icon } from "./ui";

interface Props {
  filters: FilterState;
  facets: FacetCounts | null;
  countries: { code: string; name: string }[];
  journalAvailability: JournalRankingAvailability;
  open: boolean;
  onClose: () => void;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  resultCount: number;
}

interface Option {
  value: string;
  label: string;
  color?: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_PRESETS: [string, string][] = [
  ["近 3 年", String(CURRENT_YEAR - 2)],
  ["近 5 年", String(CURRENT_YEAR - 4)],
  ["2020 年以来", "2020"],
];

const ZONES: Option[] = [
  { value: "1", label: "一区 / Q1" },
  { value: "2", label: "二区 / Q2" },
  { value: "3", label: "三区 / Q3" },
  { value: "4", label: "四区 / Q4" },
  { value: "TOP", label: "中科院 TOP" },
];

export function FilterPanel({ filters, facets, countries, journalAvailability, open, onClose, onChange, onReset, resultCount }: Props) {
  const counts = (key: FacetKey) => facets?.[key] ?? new Map<string, number>();
  const correctedVenue = filters.venue.trim() ? correctedVenueQuery(filters.venue) : "";
  const hasCAS = journalAvailability.CAS.size > 0;
  const hasJCR = journalAvailability.JCR.size > 0;
  const zones = filters.journalSystem === "CAS" || filters.journalSystem === "JCR"
    ? journalAvailability[filters.journalSystem]
    : new Set([...journalAvailability.CAS, ...journalAvailability.JCR]);
  const reviewCounts = counts("review");
  const countryCounts = counts("country");
  const sourceCounts = counts("source");

  return <aside className={`filter-panel${open ? " is-open" : ""}`} aria-label="筛选条件">
    <div className="filter-panel-head">
      <h2>筛选</h2>
      <button className="link-button" type="button" onClick={onReset}>全部清除</button>
      <button className="icon-button filter-panel-close" type="button" onClick={onClose} aria-label="关闭筛选"><Icon name="close" /></button>
    </div>

    <div className="filter-scroll">
      <FilterGroup title="研究方向">
        <OptionList
          label="研究方向"
          options={TASK_ORDER.map((task) => ({ value: task, label: TASKS[task].label, color: TASKS[task].color }))}
          counts={counts("task")}
          value={filters.task}
          onChange={(task) => onChange({ task })}
        />
      </FilterGroup>

      <FilterGroup title="发表年份">
        <div className="year-inputs">
          <label><span className="sr-only">起始年份</span><input type="number" inputMode="numeric" min={1990} max={CURRENT_YEAR + 1} value={filters.yearFrom} placeholder="起始" aria-label="起始年份" onChange={(event) => onChange({ yearFrom: event.target.value })} /></label>
          <span aria-hidden="true">—</span>
          <label><span className="sr-only">结束年份</span><input type="number" inputMode="numeric" min={1990} max={CURRENT_YEAR + 1} value={filters.yearTo} placeholder="结束" aria-label="结束年份" onChange={(event) => onChange({ yearTo: event.target.value })} /></label>
        </div>
        <div className="chip-row">
          {YEAR_PRESETS.map(([label, from]) => <button
            key={label}
            type="button"
            className={`chip${filters.yearFrom === from && !filters.yearTo ? " is-active" : ""}`}
            onClick={() => onChange(filters.yearFrom === from && !filters.yearTo ? { yearFrom: "", yearTo: "" } : { yearFrom: from, yearTo: "" })}
          >{label}</button>)}
        </div>
      </FilterGroup>

      <FilterGroup title="发表渠道">
        <label className="field">
          <span>会议 / 期刊名称</span>
          <input value={filters.venue} placeholder="如 CVPR、TIFS、arXiv" onChange={(event) => onChange({ venue: event.target.value })} />
          {correctedVenue && correctedVenue !== filters.venue.trim() && <small className="field-hint">已按 {correctedVenue} 检索</small>}
        </label>
        <OptionList
          label="发表类型"
          options={["journal", "conference", "preprint", "book", "unknown"].map((value) => ({ value, label: VENUE_TYPES[value] }))}
          counts={counts("venueType")}
          value={filters.venueType}
          onChange={(venueType) => onChange({ venueType })}
          compact
        />
      </FilterGroup>

      <FilterGroup title="学术等级">
        <p className="group-label">CCF 推荐会议</p>
        <OptionList
          label="CCF 会议等级"
          options={["A", "B", "C"].map((value) => ({ value, label: `CCF-${value}` }))}
          counts={counts("ccf")}
          value={filters.ccf}
          onChange={(ccf) => onChange({ ccf })}
          compact
        />
        <p className="group-label">期刊分区</p>
        <div className="segmented" role="radiogroup" aria-label="期刊评价体系">
          {[["", "综合"], ["CAS", "中科院 2025"], ["JCR", "JCR 2026"]].map(([value, label]) => <button
            key={value}
            type="button"
            role="radio"
            aria-checked={filters.journalSystem === value}
            disabled={(value === "CAS" && !hasCAS) || (value === "JCR" && !hasJCR)}
            onClick={() => onChange({ journalSystem: value })}
          >{label}</button>)}
        </div>
        <OptionList
          label="期刊分区"
          options={ZONES.filter((zone) => zone.value !== "TOP" || filters.journalSystem !== "JCR")}
          counts={counts("journal")}
          value={filters.journal}
          onChange={(journal) => onChange({ journal })}
          disabled={(value) => !zones.has(value)}
          compact
        />
        {!hasCAS && !hasJCR && <small className="field-hint">当前数据尚未导入可靠期刊分区。</small>}
      </FilterGroup>

      <FilterGroup title="贡献类型">
        <OptionList
          label="贡献类型"
          options={Object.entries(CONTRIBUTIONS).map(([value, label]) => ({ value, label }))}
          counts={counts("contribution")}
          value={filters.contribution}
          onChange={(contribution) => onChange({ contribution })}
          compact
        />
      </FilterGroup>

      <FilterGroup title="作者与机构">
        <label className="field"><span>作者</span><input value={filters.author} placeholder="作者姓名" onChange={(event) => onChange({ author: event.target.value })} /></label>
        <label className="field"><span>机构</span><input value={filters.institution} placeholder="机构名称" onChange={(event) => onChange({ institution: event.target.value })} /></label>
        <label className="field">
          <span>国家/地区</span>
          <select value={filters.country} onChange={(event) => onChange({ country: event.target.value })}>
            <option value="">全部国家/地区</option>
            {countries
              .map((country) => ({ ...country, count: countryCounts.get(country.code) ?? 0 }))
              .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
              .map((country) => <option key={country.code} value={country.code} disabled={!country.count && country.code !== filters.country}>
                {countryName(country.code, country.name)}（{country.count}）
              </option>)}
          </select>
        </label>
      </FilterGroup>

      <FilterGroup title="数据来源" collapsed>
        <label className="field">
          <span>元数据来源</span>
          <select value={filters.source} onChange={(event) => onChange({ source: event.target.value })}>
            <option value="">全部来源</option>
            {Object.entries(SOURCES).map(([value, label]) => <option key={value} value={value}>{label}（{sourceCounts.get(value) ?? 0}）</option>)}
          </select>
        </label>
        {(reviewCounts.size > 1 || filters.review) && <OptionList
          label="审核状态"
          options={[{ value: "verified", label: "人工核验" }, { value: "auto", label: "自动收录待复核" }]}
          counts={reviewCounts}
          value={filters.review}
          onChange={(review) => onChange({ review })}
          compact
        />}
      </FilterGroup>
    </div>

    <div className="filter-panel-foot">
      <button className="button primary block" type="button" onClick={onClose}>查看 {formatNumber(resultCount)} 条结果</button>
    </div>
  </aside>;
}

function FilterGroup({ title, children, collapsed = false }: { title: string; children: ReactNode; collapsed?: boolean }) {
  return <details className="filter-group" open={!collapsed}>
    <summary>{title}</summary>
    <div className="filter-group-body">{children}</div>
  </details>;
}

function OptionList({ label, options, counts, value, onChange, compact = false, disabled }: {
  label: string;
  options: Option[];
  counts: Map<string, number>;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  disabled?: (value: string) => boolean;
}) {
  return <div className={`option-list${compact ? " compact" : ""}`} role="group" aria-label={label}>
    {options.map((option) => {
      const count = counts.get(option.value) ?? 0;
      const active = value === option.value;
      return <button
        key={option.value}
        type="button"
        className={`option${active ? " is-active" : ""}`}
        aria-pressed={active}
        disabled={!active && (count === 0 || disabled?.(option.value))}
        onClick={() => onChange(active ? "" : option.value)}
        style={option.color ? { "--task": option.color } as CSSProperties : undefined}
      >
        {option.color && <i className="option-dot" />}
        <span>{option.label}</span>
        <small>{formatNumber(count)}</small>
      </button>;
    })}
  </div>;
}
