import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { divIcon } from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { countryName, TASKS } from "../task";
import type { CatalogPaper, Institution, TaskId } from "../types";
import { formatNumber, Icon, RankingBadges, TaskTag, useEscape } from "./ui";

interface Props {
  papers: CatalogPaper[];
  institutions: Institution[];
  theme: "light" | "dark";
  /** True while a drawer is open above the map, so Escape belongs to it. */
  covered: boolean;
  onPaper: (id: string) => void;
  onInstitution: (name: string) => void;
}

interface Cluster {
  key: string;
  items: Institution[];
  paperIds: string[];
  dominant?: TaskId;
  latitude: number;
  longitude: number;
}

interface Collaboration {
  left: Institution;
  right: Institution;
  count: number;
}

// OpenStreetMap's standard tiles need no API key. Both themes use the same
// tiles; styles.css tones them down (light) or inverts them (dark) so the
// research-direction colours of the nodes stay the strongest signal.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function gridSize(zoom: number) {
  return zoom <= 2 ? 20 : zoom <= 4 ? 9 : zoom <= 6 ? 3.5 : zoom <= 8 ? 1.2 : 0.3;
}

function MapObserver({ onZoom, onBackground }: { onZoom: (zoom: number) => void; onBackground: () => void }) {
  const map = useMap();
  useMapEvents({
    zoomend(event) { onZoom(event.target.getZoom()); },
    click() { onBackground(); },
  });
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false, animate: false }));
    });
    observer.observe(map.getContainer());
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

function nodeIcon(cluster: Cluster, selected: boolean) {
  const count = cluster.paperIds.length;
  const size = Math.round(Math.max(26, Math.min(58, 20 + Math.sqrt(count) * 2.4)));
  const color = cluster.dominant ? TASKS[cluster.dominant].color : "var(--accent)";
  return divIcon({
    className: "map-node-host",
    html: `<span class="map-node${selected ? " is-selected" : ""}" style="--node:${color};--size:${size}px">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function AtlasMap({ papers, institutions, theme, covered, onPaper, onInstitution }: Props) {
  const [zoom, setZoom] = useState(2);
  const [selectedKey, setSelectedKey] = useState("");
  const paperMap = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);
  const institutionMap = useMemo(() => new Map(institutions.map((item) => [item.id, item])), [institutions]);

  const located = useMemo(() => {
    const visible = new Set(papers.flatMap((paper) => paper.institution_ids));
    return institutions.filter((item) => item.latitude != null && item.longitude != null && visible.has(item.id));
  }, [institutions, papers]);

  const clusters = useMemo(() => {
    const grid = gridSize(zoom);
    const groups = new Map<string, Institution[]>();
    for (const item of located) {
      const key = `${Math.round(item.latitude! / grid)}:${Math.round(item.longitude! / grid)}`;
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.entries()].map(([key, items]) => {
      const paperIds = [...new Set(items.flatMap((item) => item.paper_ids.filter((id) => paperMap.has(id))))];
      const tasks = new Map<TaskId, number>();
      for (const id of paperIds) for (const task of paperMap.get(id)!.task_tags) tasks.set(task, (tasks.get(task) ?? 0) + 1);
      return {
        key,
        items: items.sort((a, b) => b.paper_ids.length - a.paper_ids.length),
        paperIds,
        dominant: [...tasks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
        latitude: items.reduce((sum, item) => sum + item.latitude!, 0) / items.length,
        longitude: items.reduce((sum, item) => sum + item.longitude!, 0) / items.length,
      } satisfies Cluster;
    }).sort((a, b) => a.paperIds.length - b.paperIds.length);
  }, [located, paperMap, zoom]);

  const collaborations = useMemo(() => {
    if (zoom < 3) return [];
    const pairs = new Map<string, Collaboration>();
    for (const paper of papers) {
      const mapped = paper.institution_ids
        .map((id) => institutionMap.get(id))
        .filter((item): item is Institution => item?.latitude != null && item.longitude != null)
        .slice(0, 4);
      for (let i = 0; i < mapped.length; i += 1) {
        for (let j = i + 1; j < mapped.length; j += 1) {
          const [left, right] = [mapped[i], mapped[j]].sort((a, b) => a.id.localeCompare(b.id));
          const key = `${left.id}|${right.id}`;
          const current = pairs.get(key);
          if (current) current.count += 1;
          else pairs.set(key, { left, right, count: 1 });
        }
      }
    }
    return [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 60);
  }, [papers, institutionMap, zoom]);

  const selected = clusters.find((cluster) => cluster.key === selectedKey) ?? null;
  useEffect(() => {
    if (selectedKey && !selected) setSelectedKey("");
  }, [selected, selectedKey]);
  useEscape(() => setSelectedKey(""), Boolean(selected) && !covered);

  const lineColor = theme === "dark" ? "#7aa7d9" : "#2f5f96";

  return <div className={`map-explorer${selected ? " has-selection" : ""}`}>
    <MapContainer
      center={[28, 20]}
      zoom={2}
      minZoom={2}
      maxZoom={12}
      scrollWheelZoom
      worldCopyJump
      preferCanvas
      className="atlas-map"
      aria-label="研究机构世界地图"
    >
      <TileLayer
        className="base-tiles"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url={TILE_URL}
        maxZoom={19}
        updateWhenZooming={false}
        keepBuffer={3}
      />
      <MapObserver onZoom={setZoom} onBackground={() => setSelectedKey("")} />
      {collaborations.map((line) => <Polyline
        key={`${line.left.id}-${line.right.id}`}
        positions={[[line.left.latitude!, line.left.longitude!], [line.right.latitude!, line.right.longitude!]]}
        pathOptions={{ color: lineColor, weight: Math.min(3, 0.6 + Math.log2(line.count + 1) * 0.6), opacity: 0.35 }}
        interactive={false}
      />)}
      {clusters.map((cluster) => <Marker
        key={cluster.key}
        position={[cluster.latitude, cluster.longitude]}
        icon={nodeIcon(cluster, cluster.key === selectedKey)}
        eventHandlers={{ click: () => setSelectedKey((current) => (current === cluster.key ? "" : cluster.key)) }}
        title={`${cluster.items.length} 个机构 · ${cluster.paperIds.length} 篇论文`}
        riseOnHover
      />)}
    </MapContainer>

    <div className="map-legend" aria-label="图例">
      <strong>{formatNumber(located.length)}</strong> 个已定位机构 · 节点数字为论文数，颜色为主导研究方向{zoom >= 3 ? " · 连线为机构合作" : " · 放大后显示机构合作"}
    </div>

    {selected && <ClusterPanel cluster={selected} paperMap={paperMap} onClose={() => setSelectedKey("")} onPaper={onPaper} onInstitution={onInstitution} />}
  </div>;
}

function ClusterPanel({ cluster, paperMap, onClose, onPaper, onInstitution }: {
  cluster: Cluster;
  paperMap: Map<string, CatalogPaper>;
  onClose: () => void;
  onPaper: (id: string) => void;
  onInstitution: (name: string) => void;
}) {
  const papers = cluster.paperIds
    .map((id) => paperMap.get(id)!)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.citation_count - a.citation_count);
  const cities = new Set(cluster.items.map((item) => item.city).filter(Boolean));
  const countries = [...new Set(cluster.items.map((item) => countryName(item.country_code, item.country)).filter(Boolean))];
  const first = cluster.items[0];
  const place = cluster.items.length === 1
    ? first.name
    : cities.size === 1 && countries.length === 1
      ? `${first.city} · ${countries[0]}`
      : countries.length === 1
        ? `${countries[0]}（${cities.size} 座城市）`
        : `${countries.slice(0, 3).join("、")}${countries.length > 3 ? ` 等 ${countries.length} 个国家/地区` : ""}`;

  return <aside className="map-panel" aria-label="区域论文">
    <header className="map-panel-head">
      <div>
        <p className="eyebrow">{cluster.items.length} 个机构 · {cluster.paperIds.length} 篇论文</p>
        <h2>{place}</h2>
      </div>
      <button className="icon-button" type="button" onClick={onClose} aria-label="关闭区域论文"><Icon name="close" /></button>
    </header>
    <div className="map-panel-scroll">
      <div className="chip-row">
        {cluster.items.slice(0, 12).map((item) => <button key={item.id} type="button" className="chip" onClick={() => onInstitution(item.name)} title="在论文库中只看该机构">
          {item.name}<small>{item.paper_ids.filter((id) => paperMap.has(id)).length}</small>
        </button>)}
        {cluster.items.length > 12 && <span className="muted">等 {cluster.items.length} 个机构</span>}
      </div>
      <ol className="map-papers">
        {papers.slice(0, 40).map((paper) => <li key={paper.id}>
          <button type="button" onClick={() => onPaper(paper.id)}>
            <span className="map-paper-meta">{paper.year ?? "—"} · {paper.venue?.short_name || paper.venue?.name || "来源待补"} <RankingBadges venue={paper.venue} /></span>
            <strong>{paper.title}</strong>
            <span className="tag-row">{paper.task_tags.slice(0, 3).map((task) => <TaskTag key={task} task={task} />)}</span>
          </button>
        </li>)}
      </ol>
      {papers.length > 40 && <p className="muted small">仅显示最新 40 篇；点击上方机构可在论文库中查看全部。</p>}
    </div>
  </aside>;
}
