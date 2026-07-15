import { useEffect, useMemo, useState } from "react";
import { divIcon } from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { CONTRIBUTIONS, TASKS } from "../task";
import type { CatalogPaper, Institution, TaskId } from "../types";

interface Props {
  papers: CatalogPaper[];
  institutions: Institution[];
  onPaper: (id: string) => void;
  onInstitution: (name: string) => void;
  detailOpen: boolean;
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

function rankingSummary(paper: CatalogPaper): string {
  const ccf = paper.venue?.type === "conference" ? paper.venue.rankings.find((item) => item.system === "CCF") : undefined;
  const cas = paper.venue?.rankings.find((item) => item.system === "CAS");
  const jcr = paper.venue?.rankings.find((item) => item.system === "JCR");
  if (ccf) return `CCF-${ccf.level}`;
  if (cas) return `中科院 ${cas.level}区${cas.is_top ? " TOP" : ""}`;
  if (jcr) return `JCR ${jcr.level}`;
  return "";
}

function MapObserver({ onZoom, detailOpen }: { onZoom: (zoom: number) => void; detailOpen: boolean }) {
  const map = useMap();
  useMapEvents({ zoomend(event) { onZoom(event.target.getZoom()); } });

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false, animate: false }));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => map.invalidateSize({ pan: false, animate: false }));
    return () => cancelAnimationFrame(frame);
  }, [detailOpen, map]);
  return null;
}

function nodeIcon(cluster: Cluster, selected: boolean, zoom: number) {
  const paperCount = cluster.paperIds.length;
  const maximum = zoom <= 2 ? 42 : zoom <= 4 ? 48 : 56;
  const size = Math.max(27, Math.min(maximum, 24 + Math.sqrt(paperCount) * 2.25)) + (selected ? 4 : 0);
  const color = cluster.dominant ? TASKS[cluster.dominant].color : "#9fded6";
  return divIcon({
    className: "signal-node-host",
    html: `<span class="signal-node${selected ? " selected" : ""}" style="--node-color:${color};--node-size:${size}px"><i></i><b>${paperCount}</b><em>${cluster.items.length}</em></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function MapLayers({ clusters, collaborations, selectedKey, zoom, onSelect }: {
  clusters: Cluster[];
  collaborations: Collaboration[];
  selectedKey: string;
  zoom: number;
  onSelect: (key: string) => void;
}) {
  return <>
    {collaborations.map((line) => <Polyline
      key={`${line.left.id}-${line.right.id}`}
      positions={[[line.left.latitude!, line.left.longitude!], [line.right.latitude!, line.right.longitude!]]}
      pathOptions={{ color: "#74b9b4", weight: Math.min(3, .55 + Math.log2(line.count + 1) * .55), opacity: .2, dashArray: "2 7" }}
    />)}
    {clusters.map((cluster) => <Marker
      key={cluster.key}
      position={[cluster.latitude, cluster.longitude]}
      icon={nodeIcon(cluster, cluster.key === selectedKey, zoom)}
      eventHandlers={{ click: () => onSelect(cluster.key) }}
      title={`${cluster.items.length} 个机构 · ${cluster.paperIds.length} 篇论文`}
      riseOnHover
    />)}
  </>;
}

function ClusterDock({ cluster, papers, onClose, onPaper, onInstitution }: {
  cluster: Cluster;
  papers: CatalogPaper[];
  onClose: () => void;
  onPaper: (id: string) => void;
  onInstitution: (name: string) => void;
}) {
  const paperMap = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);
  const rankedPapers = cluster.paperIds
    .map((id) => paperMap.get(id))
    .filter((paper): paper is CatalogPaper => Boolean(paper))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.citation_count - a.citation_count);
  const place = cluster.items[0]?.city || cluster.items[0]?.country || "区域节点";

  return <aside className="cluster-dock" aria-label="区域论文情报舱">
    <div className="cluster-dock-head">
      <div><span>REGION SIGNAL / {cluster.items.length.toString().padStart(2, "0")}</span><h3>{place}研究节点</h3></div>
      <button type="button" onClick={onClose} aria-label="关闭区域情报舱">×</button>
    </div>
    <p className="cluster-summary"><strong>{cluster.paperIds.length}</strong> 篇当前结果，已按年份与引用快照排列。无需继续放大节点。</p>
    <div className="cluster-institutions" aria-label="聚合机构">
      {cluster.items.map((item) => <button key={item.id} type="button" onClick={() => onInstitution(item.name)} title="只看该机构论文">{item.name}<small>{item.paper_ids.filter((id) => paperMap.has(id)).length}</small></button>)}
    </div>
    <div className="cluster-paper-stack">
      {rankedPapers.slice(0, 30).map((paper) => {
        const rank = rankingSummary(paper);
        return <article key={paper.id}>
          <button type="button" className="cluster-paper-open" onClick={() => onPaper(paper.id)}>
            <span className="cluster-paper-meta"><b>{paper.year ?? "N.D."}</b><i>{paper.venue?.short_name || paper.venue?.name || "来源待补"}</i>{rank && <em>{rank}</em>}</span>
            <h4>{paper.title}</h4>
            <p className="cluster-authors">{paper.authors.slice(0, 3).map((item) => item.name).join(" · ")}{paper.authors.length > 3 ? " 等" : ""}</p>
            <p className="cluster-abstract">{paper.abstract_excerpt || "当前来源未提供摘要；可打开完整记录查看来源链。"}</p>
            <span className="cluster-task-row">{paper.task_tags.slice(0, 3).map((task) => <b key={task} style={{ "--task": TASKS[task].color } as React.CSSProperties}>{TASKS[task].short}</b>)}<b>{CONTRIBUTIONS[paper.contribution_type]}</b></span>
          </button>
        </article>;
      })}
    </div>
  </aside>;
}

export function AtlasMap({ papers, institutions, onPaper, onInstitution, detailOpen }: Props) {
  const [zoom, setZoom] = useState(2);
  const [selectedKey, setSelectedKey] = useState("");
  const paperMap = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);
  const institutionMap = useMemo(() => new Map(institutions.map((item) => [item.id, item])), [institutions]);
  const visibleIds = useMemo(() => new Set(papers.flatMap((paper) => paper.institution_ids)), [papers]);

  const clusters = useMemo(() => {
    const grid = zoom <= 2 ? 20 : zoom <= 4 ? 9 : zoom <= 6 ? 3.5 : zoom <= 8 ? 1.2 : .3;
    const groups = new Map<string, Institution[]>();
    institutions.filter((item) => item.latitude != null && item.longitude != null && visibleIds.has(item.id)).forEach((item) => {
      const key = `${Math.round(item.latitude! / grid)}:${Math.round(item.longitude! / grid)}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.entries()].map(([key, items]) => {
      const paperIds = [...new Set(items.flatMap((item) => item.paper_ids).filter((id) => paperMap.has(id)))];
      const taskCount = new Map<TaskId, number>();
      paperIds.forEach((id) => paperMap.get(id)?.task_tags.forEach((task) => taskCount.set(task, (taskCount.get(task) ?? 0) + 1)));
      const dominant = [...taskCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        key, items, paperIds, dominant,
        latitude: items.reduce((sum, item) => sum + item.latitude!, 0) / items.length,
        longitude: items.reduce((sum, item) => sum + item.longitude!, 0) / items.length,
      } satisfies Cluster;
    }).sort((a, b) => b.paperIds.length - a.paperIds.length);
  }, [institutions, paperMap, visibleIds, zoom]);

  const collaborations = useMemo(() => {
    if (zoom < 3) return [];
    const pairs = new Map<string, Collaboration>();
    papers.forEach((paper) => {
      const mapped = paper.institution_ids.map((id) => institutionMap.get(id)).filter((item): item is Institution => Boolean(item?.latitude != null && item?.longitude != null));
      for (let i = 0; i < Math.min(mapped.length, 4); i += 1) {
        for (let j = i + 1; j < Math.min(mapped.length, 4); j += 1) {
          const [left, right] = [mapped[i], mapped[j]].sort((a, b) => a.id.localeCompare(b.id));
          const key = `${left.id}|${right.id}`;
          pairs.set(key, { left, right, count: (pairs.get(key)?.count ?? 0) + 1 });
        }
      }
    });
    return [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 50);
  }, [papers, institutionMap, zoom]);

  const selected = clusters.find((cluster) => cluster.key === selectedKey) ?? null;
  return <div className={`map-explorer ${selected ? "has-cluster" : ""}`}>
    <MapContainer
      center={[24, 12]}
      zoom={2}
      minZoom={2}
      maxZoom={12}
      scrollWheelZoom
      worldCopyJump
      preferCanvas
      zoomAnimation
      fadeAnimation
      markerZoomAnimation
      wheelDebounceTime={35}
      wheelPxPerZoomLevel={100}
      className="atlas-map"
      aria-label="研究机构世界地图"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        updateWhenZooming={false}
        updateWhenIdle
        keepBuffer={3}
      />
      <MapObserver onZoom={setZoom} detailOpen={detailOpen || Boolean(selected)} />
      <MapLayers clusters={clusters} collaborations={collaborations} selectedKey={selectedKey} zoom={zoom} onSelect={setSelectedKey} />
    </MapContainer>
    {selected && <ClusterDock cluster={selected} papers={papers} onClose={() => setSelectedKey("")} onPaper={onPaper} onInstitution={onInstitution} />}
  </div>;
}
