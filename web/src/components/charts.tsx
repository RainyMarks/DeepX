import { useState } from "react";
import { formatNumber } from "./ui";

/** Papers per year as thin bars with a hover tooltip; one series, so no legend. */
export function YearBars({ counts, from, to, onSelect }: {
  counts: Map<number, number>;
  from: number;
  to: number;
  onSelect?: (year: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const years = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const max = Math.max(1, ...years.map((year) => counts.get(year) ?? 0));
  const width = 640;
  const height = 300;
  const pad = { top: 12, right: 8, bottom: 22, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const step = plotW / years.length;
  const barW = Math.max(2, step - 2);
  const scale = niceMax(max);
  const ticks = [0, scale / 2, scale];
  const y = (value: number) => pad.top + plotH - (value / scale) * plotH;
  const labelEvery = years.length > 24 ? 5 : years.length > 12 ? 2 : 1;
  const hovered = hover !== null ? { year: hover, count: counts.get(hover) ?? 0 } : null;

  return <div className="chart" onMouseLeave={() => setHover(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${from}–${to} 年逐年论文数量`}>
      {ticks.map((tick) => <g key={tick}>
        <line className="chart-grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
        <text className="chart-axis" x={pad.left - 6} y={y(tick) + 4} textAnchor="end">{formatNumber(tick)}</text>
      </g>)}
      {years.map((year, index) => {
        const value = counts.get(year) ?? 0;
        const x = pad.left + index * step + (step - barW) / 2;
        const h = Math.max(0, pad.top + plotH - y(value));
        return <g key={year}>
          {h > 0 && <path className={`chart-bar${hover === year ? " is-hover" : ""}`} d={roundedTop(x, y(value), barW, h, Math.min(3, barW / 2))} />}
          {(year - from) % labelEvery === 0 && <text className="chart-axis" x={x + barW / 2} y={height - 6} textAnchor="middle">{year}</text>}
          <rect
            className="chart-hit"
            x={pad.left + index * step}
            y={pad.top}
            width={step}
            height={plotH}
            onMouseEnter={() => setHover(year)}
            onClick={() => onSelect?.(year)}
          >
            <title>{`${year} 年：${value} 篇`}</title>
          </rect>
        </g>;
      })}
      <line className="chart-baseline" x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} />
    </svg>
    {hovered && <div className="chart-tooltip" style={{ left: `${((pad.left + (hovered.year - from + 0.5) * step) / width) * 100}%` }}>
      <strong>{formatNumber(hovered.count)}</strong> 篇 · {hovered.year}
    </div>}
  </div>;
}

/** Small single-series trend line; the surrounding card names the series. */
export function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const width = 120;
  const height = 32;
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => [
    (index / Math.max(1, values.length - 1)) * (width - 4) + 2,
    height - 3 - (value / max) * (height - 6),
  ]);
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = `${line}L${width - 2},${height - 1}L2,${height - 1}Z`;
  return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
    <path d={area} fill={color} opacity={0.12} />
    <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function niceMax(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, h);
  return `M${x},${y + h}V${y + radius}Q${x},${y} ${x + radius},${y}H${x + w - radius}Q${x + w},${y} ${x + w},${y + radius}V${y + h}Z`;
}
