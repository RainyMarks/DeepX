import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TASKS } from "../task";
import type { Ranking, TaskId, Venue } from "../types";

const ICONS = {
  search: "M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
  close: "M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z",
  external: "M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H6v10h10v-5h2v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  sun: "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-1-5h2v3h-2V2Zm0 17h2v3h-2v-3ZM2 11h3v2H2v-2Zm17 0h3v2h-3v-2ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4Z",
  moon: "M12.3 2a8 8 0 0 0 9.7 9.7A10 10 0 1 1 12.3 2Z",
  filter: "M3 5h18v2l-7 7v6l-4-2v-4L3 7V5Z",
  download: "M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3V3ZM4 18h16v2H4v-2Z",
  github: "M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
  arrow: "M13.6 5.6 12.2 7l4 4H4v2h12.2l-4 4 1.4 1.4L20 12l-6.4-6.4Z",
  copy: "M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3ZM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h10V9H5Z",
  sidebar: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h5V6H4Zm7 0v12h9V6h-9Z",
  chevron: "M16.6 8.6 12 13.2 7.4 8.6 6 10l6 6 6-6-1.4-1.4Z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} fill="currentColor" /></svg>;
}

export function taskStyle(task: TaskId): CSSProperties {
  return { "--task": TASKS[task].color } as CSSProperties;
}

export function TaskTag({ task, long = false }: { task: TaskId; long?: boolean }) {
  return <span className="task-tag" style={taskStyle(task)}>{long ? TASKS[task].label : TASKS[task].short}</span>;
}

export function rankingLabel(ranking: Ranking): string {
  if (ranking.system === "CAS") return `中科院${ranking.level}区${ranking.is_top ? " TOP" : ""}`;
  if (ranking.system === "JCR") return `JCR ${ranking.level}`;
  return `CCF-${ranking.level}`;
}

export function rankingTitle(ranking: Ranking): string {
  if (ranking.system === "CAS") return `中科院分区 ${ranking.version} 版${ranking.scope || ""} · ${ranking.category}`;
  if (ranking.system === "JCR") return `Clarivate JCR ${ranking.version} · ${ranking.category}`;
  return `CCF 推荐目录（${ranking.version}）· ${ranking.category}`;
}

/** Ranking badges valid for the venue type (CCF for conferences, CAS/JCR for journals). */
export function venueRankings(venue: Venue | null): Ranking[] {
  if (!venue) return [];
  return venue.rankings.filter((ranking) => (ranking.system === "CCF" ? venue.type === "conference" : venue.type === "journal"));
}

export function RankingBadges({ venue, linked = false }: { venue: Venue | null; linked?: boolean }) {
  const rankings = venueRankings(venue);
  if (!rankings.length) return null;
  return <>{rankings.map((ranking) => {
    const className = `rank-badge rank-${ranking.system.toLowerCase()}${ranking.level === "A" || ranking.level === "1" || ranking.level === "Q1" ? " rank-high" : ""}`;
    const key = `${ranking.system}-${ranking.version}`;
    return linked
      ? <a key={key} className={className} href={ranking.source_url} target="_blank" rel="noreferrer" title={rankingTitle(ranking)}>{rankingLabel(ranking)}</a>
      : <span key={key} className={className} title={rankingTitle(ranking)}>{rankingLabel(ranking)}</span>;
  })}</>;
}

export function useEscape(handler: () => void, active = true) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) latest.current();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [active]);
}

/** Renders a growing prefix of a long list; grows when the sentinel scrolls into view. */
export function useIncremental<T>(items: T[], pageSize: number) {
  const [limit, setLimit] = useState(pageSize);
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => setLimit(pageSize), [items, pageSize]);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || limit >= items.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => value + pageSize);
    }, { rootMargin: "800px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length, limit, pageSize]);
  return { visible: items.slice(0, limit), sentinel, hasMore: limit < items.length, more: () => setLimit((value) => value + pageSize) };
}

export function Drawer({ label, onClose, children, wide = false }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  const panel = useRef<HTMLElement | null>(null);
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  return <>
    <div className="drawer-scrim" onClick={onClose} />
    <aside ref={panel} className={`drawer${wide ? " drawer-wide" : ""}`} aria-label={label} tabIndex={-1}>
      <button className="icon-button drawer-close" type="button" onClick={onClose} aria-label={`关闭${label}`}><Icon name="close" /></button>
      {children}
    </aside>
  </>;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}
