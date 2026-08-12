export type TaskId =
  | "synthetic_detection"
  | "source_attribution"
  | "deepfake_detection"
  | "image_forgery"
  | "scene_text_forgery"
  | "content_provenance"
  | "image_steganalysis"
  | "digital_watermarking";

export interface Ranking {
  system: "CCF" | "JCR" | "CAS";
  level: string;
  category: string;
  scope?: "大类" | "小类" | "";
  is_top: boolean;
  version: string;
  source_url: string;
  verified_at: string;
}

export interface Venue {
  id: string;
  name: string;
  short_name: string;
  type: string;
  rankings: Ranking[];
}

export interface CatalogPaper {
  id: string;
  title: string;
  title_zh: string;
  year: number | null;
  authors: { id: string; name: string }[];
  institution_ids: string[];
  venue: Venue | null;
  task_tags: TaskId[];
  contribution_type: "method" | "dataset" | "benchmark" | "survey" | "analysis";
  review_status: "verified" | "auto";
  primary_url: string;
  citation_count: number;
  sources: string[];
  abstract_excerpt: string;
}

export interface PaperDetail extends CatalogPaper {
  abstract: string;
  doi: string;
  arxiv_id: string;
  publication_date: string;
  provenance: { source: string; source_id: string; url: string; query: string; retrieved_at: string }[];
}

export interface Author {
  id: string;
  name: string;
  orcid: string;
  institution_ids: string[];
  paper_ids: string[];
  task_counts: Record<TaskId, number>;
}

export interface Institution {
  id: string;
  name: string;
  country: string;
  country_code: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  ror: string;
  openalex_id: string;
  coordinate_source: string;
  review_status: "verified" | "auto";
  paper_ids: string[];
}

export interface Manifest {
  schema_version: string;
  dataset_version: string;
  generated_at: string;
  paper_count: number;
  verified_paper_count: number;
  author_count: number;
  institution_count: number;
  mapped_institution_count: number;
  country_count: number;
  candidate_count: number;
  detail_shards: string[];
  data_notice: string;
}

export interface AtlasData {
  manifest: Manifest;
  papers: CatalogPaper[];
  authors: Author[];
  institutions: Institution[];
  stats: {
    tasks: { id: TaskId; label: string; count: number }[];
    years: Record<string, number>;
    reviews: Record<string, number>;
    countries: [string, number][];
  };
}

export type AtlasSummary = Pick<AtlasData, "manifest" | "stats">;
