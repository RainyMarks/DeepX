import type { AtlasData, AtlasSummary, PaperDetail } from "./types";

const base = `${import.meta.env.BASE_URL}data/v1`;

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(`${base}/${path}`);
  if (!response.ok) throw new Error(`无法加载 ${path}（HTTP ${response.status}）`);
  return response.json() as Promise<T>;
}

export async function loadAtlasSummary(): Promise<AtlasSummary> {
  const [manifest, stats] = await Promise.all([
    readJson<AtlasData["manifest"]>("manifest.json"),
    readJson<AtlasData["stats"]>("stats.json"),
  ]);
  return { manifest, stats };
}

export async function loadAtlasContent(summary: AtlasSummary): Promise<AtlasData> {
  const [papers, authors, institutions] = await Promise.all([
    readJson<AtlasData["papers"]>("catalog.json"),
    readJson<AtlasData["authors"]>("authors.json"),
    readJson<AtlasData["institutions"]>("institutions.json"),
  ]);
  return { ...summary, papers, authors, institutions };
}

const detailCache = new Map<string, PaperDetail[]>();

export async function loadPaperDetail(id: string): Promise<PaperDetail | null> {
  const shard = id.at(-1) ?? "0";
  if (!detailCache.has(shard)) detailCache.set(shard, await readJson<PaperDetail[]>(`details/${shard}.json`));
  return detailCache.get(shard)?.find((paper) => paper.id === id) ?? null;
}
