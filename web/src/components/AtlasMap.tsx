import { useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMapEvents } from "react-leaflet";
import type { CatalogPaper, Institution } from "../types";
import { TASKS } from "../task";

interface Props {
  papers: CatalogPaper[];
  institutions: Institution[];
  onPaper: (id: string) => void;
}

function MapContent({ papers, institutions, onPaper }: Props) {
  const [zoom, setZoom] = useState(2);
  useMapEvents({ zoomend(event) { setZoom(event.target.getZoom()); } });
  const paperMap = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);
  const institutionMap = useMemo(() => new Map(institutions.map((item) => [item.id, item])), [institutions]);
  const visibleIds = useMemo(() => new Set(papers.flatMap((paper) => paper.institution_ids)), [papers]);

  const clusters = useMemo(() => {
    const grid = zoom <= 2 ? 18 : zoom <= 4 ? 8 : zoom <= 6 ? 3 : 0.2;
    const groups = new Map<string, Institution[]>();
    institutions.filter((item) => item.latitude != null && item.longitude != null && visibleIds.has(item.id)).forEach((item) => {
      const key = `${Math.round(item.latitude! / grid)}:${Math.round(item.longitude! / grid)}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.values()].map((items) => {
      const paperIds = [...new Set(items.flatMap((item) => item.paper_ids).filter((id) => paperMap.has(id)))];
      const taskCount = new Map<string, number>();
      paperIds.forEach((id) => paperMap.get(id)?.task_tags.forEach((task) => taskCount.set(task, (taskCount.get(task) ?? 0) + 1)));
      const dominant = [...taskCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as keyof typeof TASKS | undefined;
      return {
        items, paperIds, dominant,
        latitude: items.reduce((sum, item) => sum + item.latitude!, 0) / items.length,
        longitude: items.reduce((sum, item) => sum + item.longitude!, 0) / items.length,
      };
    });
  }, [institutions, paperMap, visibleIds, zoom]);

  const collaborationLines = useMemo(() => {
    const pairs = new Map<string, { left: Institution; right: Institution; count: number }>();
    papers.forEach((paper) => {
      const mapped = paper.institution_ids.map((id) => institutionMap.get(id)).filter((item): item is Institution => Boolean(item?.latitude != null && item?.longitude != null));
      for (let i = 0; i < Math.min(mapped.length, 4); i += 1) {
        for (let j = i + 1; j < Math.min(mapped.length, 4); j += 1) {
          const [left, right] = [mapped[i], mapped[j]].sort((a, b) => a.id.localeCompare(b.id));
          const key = `${left.id}|${right.id}`;
          const current = pairs.get(key);
          pairs.set(key, { left, right, count: (current?.count ?? 0) + 1 });
        }
      }
    });
    return [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 80);
  }, [papers, institutionMap]);

  return <>
    {zoom >= 3 && collaborationLines.map((line) => <Polyline key={`${line.left.id}-${line.right.id}`} positions={[[line.left.latitude!, line.left.longitude!], [line.right.latitude!, line.right.longitude!]]} pathOptions={{ color: "#b88b62", weight: Math.min(3.5, .7 + line.count * .4), opacity: .28 }} />)}
    {clusters.map((cluster) => {
      const color = cluster.dominant ? TASKS[cluster.dominant].color : "#193f43";
      const radius = Math.max(7, Math.min(25, 6 + Math.sqrt(cluster.paperIds.length) * 2.2));
      return <CircleMarker key={cluster.items.map((item) => item.id).join("-")} center={[cluster.latitude, cluster.longitude]} radius={radius} pathOptions={{ color: "#fff8e9", weight: 2, fillColor: color, fillOpacity: .88 }}>
        <Popup minWidth={280} maxWidth={360}>
          <div className="map-popup">
            <span className="popup-kicker">{cluster.items.length > 1 ? `${cluster.items.length} 个机构聚合点` : cluster.items[0].country}</span>
            <h3>{cluster.items.length > 1 ? `${cluster.items[0].city || cluster.items[0].country}及附近机构` : cluster.items[0].name}</h3>
            <p>{cluster.paperIds.length} 篇当前筛选论文 · 点击标题查看详情</p>
            <div className="popup-paper-list">{cluster.paperIds.slice(0, 5).map((id) => <button key={id} type="button" onClick={() => onPaper(id)}>{paperMap.get(id)?.title}</button>)}</div>
          </div>
        </Popup>
      </CircleMarker>;
    })}
  </>;
}

export function AtlasMap(props: Props) {
  return <MapContainer center={[24, 12]} zoom={2} minZoom={2} maxZoom={12} scrollWheelZoom worldCopyJump className="atlas-map" aria-label="研究机构世界地图">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <MapContent {...props} />
  </MapContainer>;
}
