import type { AtlasData, AtlasSummary, CatalogPaper, Institution, Manifest, PackedCatalog, PaperDetail, Stats } from "./types";

const base = `${import.meta.env.BASE_URL}data/v1`;

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(`${base}/${path}`);
  if (!response.ok) throw new Error(`无法加载 ${path}（HTTP ${response.status}）`);
  return response.json() as Promise<T>;
}

export async function loadAtlasSummary(): Promise<AtlasSummary> {
  const [manifest, stats] = await Promise.all([readJson<Manifest>("manifest.json"), readJson<Stats>("stats.json")]);
  return { manifest, stats };
}

/** Resolve the shared venue/author tables of catalog.json (also accepts the legacy flat list). */
export function unpackCatalog(raw: PackedCatalog | CatalogPaper[]): CatalogPaper[] {
  if (Array.isArray(raw)) return raw;
  const venues = new Map(raw.venues.map((venue) => [venue.id, venue]));
  return raw.papers.map(({ venue_id, authors, ...paper }) => ({
    ...paper,
    venue: venue_id ? venues.get(venue_id) ?? null : null,
    authors: authors.map((index) => raw.authors[index]),
  }));
}

export async function loadAtlasContent(summary: AtlasSummary): Promise<AtlasData> {
  const [catalog, institutions] = await Promise.all([
    readJson<PackedCatalog | CatalogPaper[]>("catalog.json"),
    readJson<Institution[]>("institutions.json"),
  ]);
  return { ...summary, papers: unpackCatalog(catalog), institutions };
}

const shardCache = new Map<string, Promise<Map<string, PaperDetail>>>();

export function detailShard(id: string, manifest: Pick<Manifest, "detail_shards">): string {
  const length = manifest.detail_shards[0]?.length ?? 1;
  return id.slice(-length);
}

export function loadPaperDetail(id: string, manifest: Pick<Manifest, "detail_shards">): Promise<PaperDetail | null> {
  const shard = detailShard(id, manifest);
  let pending = shardCache.get(shard);
  if (!pending) {
    pending = readJson<PaperDetail[]>(`details/${shard}.json`).then((records) => new Map(records.map((record) => [record.id, record])));
    pending.catch(() => shardCache.delete(shard));
    shardCache.set(shard, pending);
  }
  return pending.then((records) => records.get(id) ?? null);
}

let aliasRequest: Promise<Record<string, string>> | null = null;

/** Map of author ids merged into another identity (old links may still use them). */
export function loadAuthorAliases(): Promise<Record<string, string>> {
  aliasRequest ??= readJson<{ aliases: Record<string, string> }>("author_aliases.json")
    .then((file) => file.aliases)
    .catch(() => ({}));
  return aliasRequest;
}
