use super::{
    call_model, load_secrets, load_settings, resolve_provider, ApiError, AppState, ChatMessage,
    ModelCall, ResearchSecrets,
};
use anyhow::{anyhow, Context, Result};
use axum::extract::{Path as AxumPath, State};
use axum::Json;
use chrono::Utc;
use petgraph::stable_graph::StableDiGraph;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use roxmltree::Document as XmlDocument;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const RESEARCH_SCHEMA_VERSION: i64 = 1;
const DEFAULT_SEARCH_LIMIT: usize = 12;
const MAX_SEARCH_LIMIT: usize = 25;
const SOURCE_TIMEOUT_NOTE: &str = "source skipped or degraded; cached/local data remains usable";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResearchSearchRequest {
    query: String,
    max_results: Option<usize>,
    #[serde(default = "default_true")]
    use_llm: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepoAuditRequest {
    repo_url: Option<String>,
    owner: Option<String>,
    name: Option<String>,
    local_path: Option<String>,
    paper_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrickScoreRequest {
    paper_id: Option<String>,
    repo_url: Option<String>,
    audit: Option<RepoAuditReport>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IdeaRequest {
    target_field: Option<String>,
    target_venue: Option<String>,
    current_method: Option<String>,
    pain_points: Option<String>,
    constraints: Option<String>,
    target_paper_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportReportRequest {
    title: Option<String>,
    kind: Option<String>,
    file_name: Option<String>,
    payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceStatus {
    source: String,
    ok: bool,
    fetched: usize,
    degraded: bool,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResearchPaper {
    id: String,
    title: String,
    #[serde(rename = "abstract")]
    abstract_text: String,
    authors: Vec<String>,
    year: Option<i64>,
    venue: Option<String>,
    doi: Option<String>,
    arxiv_id: Option<String>,
    openalex_id: Option<String>,
    s2_id: Option<String>,
    citation_count: Option<i64>,
    pdf_url: Option<String>,
    url: Option<String>,
    source_ids: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorPaper {
    paper: ResearchPaper,
    source: String,
    confidence: f64,
    evidence: Vec<String>,
    repo_candidates: Vec<RepoCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaperScores {
    relevance: f64,
    freshness: f64,
    citation: f64,
    code: f64,
    repro_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResearchSearchResult {
    paper: ResearchPaper,
    sources: Vec<String>,
    scores: PaperScores,
    dedup_evidence: Vec<String>,
    repo_candidates: Vec<RepoCandidate>,
    risk_preview: RiskPreview,
    llm_explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RiskPreview {
    level: String,
    score: f64,
    evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoCandidate {
    url: String,
    owner: Option<String>,
    name: Option<String>,
    stars: Option<i64>,
    evidence: Vec<String>,
    official_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepoAuditReport {
    repo_url: String,
    owner: String,
    name: String,
    officialness_score: f64,
    code_completeness_score: f64,
    reproducibility_score: f64,
    missing_pieces: Vec<String>,
    likely_failure_points: Vec<String>,
    minimum_run_command: Option<String>,
    recommended_fixes: Vec<String>,
    evidence: Vec<String>,
    files_seen: Vec<String>,
    issue_signals: Vec<String>,
    repo_behavior: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrickScoreReport {
    paper_id: Option<String>,
    trick_score: f64,
    risk_level: String,
    meaning: String,
    code_risk: f64,
    protocol_risk: f64,
    result_risk: f64,
    novelty_risk: f64,
    community_risk: f64,
    repo_risk: f64,
    runtime_risk: f64,
    evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphNode {
    id: String,
    label: String,
    node_type: String,
    risk_level: Option<String>,
    confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphEdge {
    source: String,
    target: String,
    edge_type: String,
    evidence: String,
    confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdeaOutput {
    idea_name: String,
    core_motivation: String,
    inherited_from: Vec<String>,
    different_from: Vec<String>,
    module_composition: Vec<ModuleSpec>,
    implementation_steps: Vec<String>,
    ablation_plan: Vec<String>,
    reviewer_risk: String,
    expected_gain: String,
    codex_prompt: String,
    evidence: Vec<String>,
    confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModuleSpec {
    module: String,
    category: String,
    source_papers: Vec<String>,
    compatible_with: Vec<String>,
    risk: String,
    novelty_note: String,
}

fn default_true() -> bool {
    true
}

pub(crate) fn ensure_research_dirs(root: &Path) -> Result<()> {
    let research = root.join("research");
    for dir in [
        research.as_path(),
        &research.join("indexes"),
        &research.join("indexes").join("papers"),
        &research.join("repos"),
        &research.join("reports"),
        &research.join("source-cache"),
    ] {
        fs::create_dir_all(dir)
            .with_context(|| format!("failed to create research directory {}", dir.display()))?;
    }
    Ok(())
}

pub(crate) async fn research_search(
    State(state): State<AppState>,
    Json(req): Json<ResearchSearchRequest>,
) -> Result<Json<Value>, ApiError> {
    let query = req.query.trim();
    if query.is_empty() {
        return Err(ApiError::bad_request("research query is empty"));
    }
    let limit = req
        .max_results
        .unwrap_or(DEFAULT_SEARCH_LIMIT)
        .clamp(1, MAX_SEARCH_LIMIT);
    ensure_research_dirs(&state.data_root).map_err(ApiError::internal)?;
    let secrets = load_secrets(&state.data_root).map_err(ApiError::internal)?;
    let research_secrets = secrets.research_sources;
    let mut statuses = Vec::new();
    let mut papers = Vec::new();

    let openalex = fetch_openalex(&state.http, &research_secrets, query, limit).await;
    ingest_connector_result("openalex", openalex, &mut papers, &mut statuses);

    let s2 = fetch_semantic_scholar(&state.http, &research_secrets, query, limit).await;
    ingest_connector_result("semantic_scholar", s2, &mut papers, &mut statuses);

    let crossref = fetch_crossref(&state.http, &research_secrets, query, limit).await;
    ingest_connector_result("crossref", crossref, &mut papers, &mut statuses);

    let arxiv = fetch_arxiv(&state.data_root, &state.http, query, limit).await;
    ingest_connector_result("arxiv", arxiv, &mut papers, &mut statuses);

    let github = fetch_github_repos(&state.http, &research_secrets, query, 5).await;
    let github_candidates = match github {
        Ok(items) => {
            statuses.push(SourceStatus {
                source: "github".into(),
                ok: true,
                fetched: items.len(),
                degraded: false,
                message: "repository candidates fetched".into(),
            });
            items
        }
        Err(err) => {
            statuses.push(SourceStatus {
                source: "github".into(),
                ok: false,
                fetched: 0,
                degraded: true,
                message: format!("{SOURCE_TIMEOUT_NOTE}: {err}"),
            });
            Vec::new()
        }
    };

    let mut merged = dedup_and_rank(query, papers, github_candidates, limit);
    save_search_history(&state.data_root, query, &merged).map_err(ApiError::internal)?;

    if req.use_llm {
        enrich_with_llm(&state.data_root, &state.http, query, &mut merged).await;
    }

    Ok(Json(json!({
        "ok": true,
        "query": query,
        "results": merged,
        "sources": statuses,
        "storage": {
            "history": search_history_path(&state.data_root)
        }
    })))
}

pub(crate) async fn research_paper_graph(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<Value>, ApiError> {
    ensure_research_dirs(&state.data_root).map_err(ApiError::internal)?;
    let conn = open_db(&state.data_root).ok();
    let paper = conn
        .as_ref()
        .and_then(|conn| load_paper(conn, &id).ok().flatten())
        .or_else(|| load_paper_from_history(&state.data_root, &id).ok().flatten());
    let Some(paper) = paper else {
        return Err(ApiError::bad_request("paper not found in recent search history"));
    };
    let repos = conn
        .as_ref()
        .and_then(|conn| load_repo_candidates(conn, &paper.id).ok())
        .filter(|items| !items.is_empty())
        .or_else(|| load_repo_candidates_from_history(&state.data_root, &paper.id).ok())
        .unwrap_or_default();
    let graph = build_paper_graph(conn.as_ref(), &paper, &repos).map_err(ApiError::internal)?;
    Ok(Json(json!({
        "ok": true,
        "paper": paper,
        "nodes": graph.0,
        "edges": graph.1
    })))
}

pub(crate) async fn research_repo_audit(
    State(state): State<AppState>,
    Json(req): Json<RepoAuditRequest>,
) -> Result<Json<Value>, ApiError> {
    ensure_research_dirs(&state.data_root).map_err(ApiError::internal)?;
    let secrets = load_secrets(&state.data_root).map_err(ApiError::internal)?;
    let report = audit_repo(&state.http, &secrets.research_sources, req)
        .await
        .map_err(|err| ApiError::upstream(err.to_string()))?;
    let conn = open_db(&state.data_root).map_err(ApiError::internal)?;
    save_repo_audit(&conn, &report).map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "audit": report })))
}

pub(crate) async fn research_trick_score(
    State(state): State<AppState>,
    Json(req): Json<TrickScoreRequest>,
) -> Result<Json<Value>, ApiError> {
    ensure_research_dirs(&state.data_root).map_err(ApiError::internal)?;
    let audit = if let Some(audit) = req.audit {
        Some(audit)
    } else if req.repo_url.is_some() {
        let secrets = load_secrets(&state.data_root).map_err(ApiError::internal)?;
        Some(
            audit_repo(
                &state.http,
                &secrets.research_sources,
                RepoAuditRequest {
                    repo_url: req.repo_url.clone(),
                    owner: None,
                    name: None,
                    local_path: None,
                    paper_id: req.paper_id.clone(),
                },
            )
            .await
            .map_err(|err| ApiError::upstream(err.to_string()))?,
        )
    } else {
        None
    };
    let report = compute_trick_score(req.paper_id.clone(), audit.as_ref());
    let conn = open_db(&state.data_root).map_err(ApiError::internal)?;
    save_risk_score(&conn, &report).map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "risk": report, "audit": audit })))
}

pub(crate) async fn research_ideas(
    State(state): State<AppState>,
    Json(req): Json<IdeaRequest>,
) -> Result<Json<Value>, ApiError> {
    ensure_research_dirs(&state.data_root).map_err(ApiError::internal)?;
    let target_paper = if let Some(id) = &req.target_paper_id {
        open_db(&state.data_root)
            .ok()
            .and_then(|conn| load_paper(&conn, id).ok().flatten())
            .or_else(|| load_paper_from_history(&state.data_root, id).ok().flatten())
    } else {
        None
    };
    let ideas = compose_ideas(&req, target_paper.as_ref());
    Ok(Json(json!({ "ok": true, "targetPaper": target_paper, "ideas": ideas })))
}

pub(crate) async fn research_export_report(
    State(state): State<AppState>,
    Json(req): Json<ExportReportRequest>,
) -> Result<Json<Value>, ApiError> {
    ensure_research_dirs(&state.data_root).map_err(ApiError::internal)?;
    let title = req.title.unwrap_or_else(|| "RainyReSearch Report".into());
    let kind = req.kind.unwrap_or_else(|| "research".into());
    let file_name = req
        .file_name
        .unwrap_or_else(|| format!("{}-{}.md", safe_file_stem(&kind), Utc::now().format("%Y%m%d-%H%M%S")));
    let path = state
        .data_root
        .join("research")
        .join("reports")
        .join(safe_file_name(&file_name));
    let markdown = render_report_markdown(&title, &kind, &req.payload);
    fs::write(&path, markdown).map_err(ApiError::internal)?;
    Ok(Json(json!({
        "ok": true,
        "path": path,
        "title": title,
        "kind": kind
    })))
}

fn ingest_connector_result(
    source: &str,
    result: Result<Vec<ConnectorPaper>>,
    papers: &mut Vec<ConnectorPaper>,
    statuses: &mut Vec<SourceStatus>,
) {
    match result {
        Ok(items) => {
            statuses.push(SourceStatus {
                source: source.into(),
                ok: true,
                fetched: items.len(),
                degraded: false,
                message: "source fetched".into(),
            });
            papers.extend(items);
        }
        Err(err) => statuses.push(SourceStatus {
            source: source.into(),
            ok: false,
            fetched: 0,
            degraded: true,
            message: format!("{SOURCE_TIMEOUT_NOTE}: {err}"),
        }),
    }
}

fn research_db_path(root: &Path) -> PathBuf {
    root.join("research").join("research.db")
}

fn search_history_path(root: &Path) -> PathBuf {
    root.join("research").join("search-history.jsonl")
}

fn save_search_history(root: &Path, query: &str, results: &[ResearchSearchResult]) -> Result<()> {
    let path = search_history_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let entry = json!({
        "query": query,
        "searchedAt": Utc::now().to_rfc3339(),
        "results": results,
    });
    let mut file = fs::OpenOptions::new().create(true).append(true).open(path)?;
    serde_json::to_writer(&mut file, &entry)?;
    use std::io::Write as _;
    writeln!(file)?;
    Ok(())
}

fn load_paper_from_history(root: &Path, id: &str) -> Result<Option<ResearchPaper>> {
    Ok(load_result_from_history(root, id)?.map(|result| result.paper))
}

fn load_repo_candidates_from_history(root: &Path, id: &str) -> Result<Vec<RepoCandidate>> {
    Ok(load_result_from_history(root, id)?
        .map(|result| result.repo_candidates)
        .unwrap_or_default())
}

fn load_result_from_history(root: &Path, id: &str) -> Result<Option<ResearchSearchResult>> {
    let path = search_history_path(root);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path)?;
    for line in raw.lines().rev().filter(|line| !line.trim().is_empty()) {
        let value: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let Some(results) = value.get("results").and_then(Value::as_array) else {
            continue;
        };
        for item in results {
            let result: ResearchSearchResult = match serde_json::from_value(item.clone()) {
                Ok(result) => result,
                Err(_) => continue,
            };
            if result.paper.id == id {
                return Ok(Some(result));
            }
        }
    }
    Ok(None)
}

fn open_db(root: &Path) -> Result<Connection> {
    let path = research_db_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate_db(&conn)?;
    Ok(conn)
}

fn migrate_db(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_meta(
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS papers(
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          abstract TEXT NOT NULL DEFAULT '',
          authors_json TEXT NOT NULL DEFAULT '[]',
          year INTEGER,
          venue TEXT,
          doi TEXT,
          arxiv_id TEXT,
          openalex_id TEXT,
          s2_id TEXT,
          citation_count INTEGER,
          pdf_url TEXT,
          url TEXT,
          source_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS paper_edges(
          src_paper_id TEXT NOT NULL,
          dst_paper_id TEXT NOT NULL,
          edge_type TEXT NOT NULL,
          evidence TEXT NOT NULL,
          confidence REAL NOT NULL,
          PRIMARY KEY(src_paper_id, dst_paper_id, edge_type)
        );
        CREATE TABLE IF NOT EXISTS repos(
          id TEXT PRIMARY KEY,
          paper_id TEXT,
          url TEXT NOT NULL,
          owner TEXT,
          name TEXT,
          stars INTEGER,
          forks INTEGER,
          last_commit TEXT,
          official_score REAL,
          completeness_score REAL,
          repro_score REAL,
          evidence_json TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS modules(
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT NOT NULL,
          source_paper_id TEXT,
          risk_level TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS paper_modules(
          paper_id TEXT NOT NULL,
          module_id TEXT NOT NULL,
          evidence TEXT NOT NULL,
          confidence REAL NOT NULL,
          PRIMARY KEY(paper_id, module_id)
        );
        CREATE TABLE IF NOT EXISTS risk_scores(
          paper_id TEXT PRIMARY KEY,
          code_risk REAL NOT NULL,
          protocol_risk REAL NOT NULL,
          result_risk REAL NOT NULL,
          novelty_risk REAL NOT NULL,
          community_risk REAL NOT NULL,
          repo_risk REAL NOT NULL,
          runtime_risk REAL NOT NULL,
          total_score REAL NOT NULL,
          evidence_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ideas(
          id TEXT PRIMARY KEY,
          project_id TEXT,
          title TEXT NOT NULL,
          motivation TEXT NOT NULL,
          module_plan_json TEXT NOT NULL,
          novelty_risk REAL NOT NULL,
          implementation_plan TEXT NOT NULL,
          evidence_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS source_cache(
          cache_key TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          query TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS research_projects(
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          topic TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        ",
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('research_schema_version', ?1)",
        params![RESEARCH_SCHEMA_VERSION.to_string()],
    )?;
    seed_module_bank(conn)?;
    Ok(())
}

fn seed_module_bank(conn: &Connection) -> Result<()> {
    for module in module_bank() {
        conn.execute(
            "INSERT OR IGNORE INTO modules(id, name, category, description, source_paper_id, risk_level)
             VALUES(?1, ?2, ?3, ?4, NULL, ?5)",
            params![
                stable_id(&format!("module:{}:{}", module.category, module.module)),
                module.module,
                module.category,
                module.novelty_note,
                module.risk
            ],
        )?;
    }
    Ok(())
}

fn load_paper(conn: &Connection, id: &str) -> Result<Option<ResearchPaper>> {
    conn.query_row(
        "SELECT id, title, abstract, authors_json, year, venue, doi, arxiv_id, openalex_id, s2_id,
         citation_count, pdf_url, url, source_json FROM papers WHERE id = ?1",
        params![id],
        row_to_paper,
    )
    .optional()
    .map_err(Into::into)
}

fn row_to_paper(row: &rusqlite::Row<'_>) -> rusqlite::Result<ResearchPaper> {
    let authors_json: String = row.get(3)?;
    let source_json: String = row.get(13)?;
    Ok(ResearchPaper {
        id: row.get(0)?,
        title: row.get(1)?,
        abstract_text: row.get(2)?,
        authors: serde_json::from_str(&authors_json).unwrap_or_default(),
        year: row.get(4)?,
        venue: row.get(5)?,
        doi: row.get(6)?,
        arxiv_id: row.get(7)?,
        openalex_id: row.get(8)?,
        s2_id: row.get(9)?,
        citation_count: row.get(10)?,
        pdf_url: row.get(11)?,
        url: row.get(12)?,
        source_ids: serde_json::from_str(&source_json).unwrap_or_default(),
    })
}

fn load_repo_candidates(conn: &Connection, paper_id: &str) -> Result<Vec<RepoCandidate>> {
    let mut stmt = conn.prepare(
        "SELECT url, owner, name, stars, official_score, evidence_json
         FROM repos WHERE paper_id = ?1 ORDER BY official_score DESC, stars DESC LIMIT 12",
    )?;
    let repos = stmt
        .query_map(params![paper_id], |row| {
            let evidence_json: String = row.get(5)?;
            Ok(RepoCandidate {
                url: row.get(0)?,
                owner: row.get(1)?,
                name: row.get(2)?,
                stars: row.get(3)?,
                evidence: serde_json::from_str(&evidence_json).unwrap_or_default(),
                official_score: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(repos)
}

fn save_repo_audit(conn: &Connection, report: &RepoAuditReport) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO repos(id, url, owner, name, stars, forks, last_commit, official_score,
          completeness_score, repro_score, evidence_json, updated_at)
         VALUES(?1, ?2, ?3, ?4, NULL, NULL, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
          last_commit=excluded.last_commit,
          official_score=excluded.official_score,
          completeness_score=excluded.completeness_score,
          repro_score=excluded.repro_score,
          evidence_json=excluded.evidence_json,
          updated_at=excluded.updated_at",
        params![
            stable_id(&format!("repo:{}", report.repo_url)),
            report.repo_url,
            report.owner,
            report.name,
            report.repo_behavior.get("pushedAt"),
            report.officialness_score,
            report.code_completeness_score,
            report.reproducibility_score,
            serde_json::to_string(&report.evidence)?,
            now
        ],
    )?;
    Ok(())
}

fn save_risk_score(conn: &Connection, report: &TrickScoreReport) -> Result<()> {
    let Some(paper_id) = &report.paper_id else {
        return Ok(());
    };
    conn.execute(
        "INSERT INTO risk_scores(paper_id, code_risk, protocol_risk, result_risk, novelty_risk,
          community_risk, repo_risk, runtime_risk, total_score, evidence_json, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(paper_id) DO UPDATE SET
          code_risk=excluded.code_risk,
          protocol_risk=excluded.protocol_risk,
          result_risk=excluded.result_risk,
          novelty_risk=excluded.novelty_risk,
          community_risk=excluded.community_risk,
          repo_risk=excluded.repo_risk,
          runtime_risk=excluded.runtime_risk,
          total_score=excluded.total_score,
          evidence_json=excluded.evidence_json,
          updated_at=excluded.updated_at",
        params![
            paper_id,
            report.code_risk,
            report.protocol_risk,
            report.result_risk,
            report.novelty_risk,
            report.community_risk,
            report.repo_risk,
            report.runtime_risk,
            report.trick_score,
            serde_json::to_string(&report.evidence)?,
            Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}

#[allow(dead_code)]
fn save_ideas(conn: &Connection, ideas: &[IdeaOutput]) -> Result<()> {
    for idea in ideas {
        conn.execute(
            "INSERT OR REPLACE INTO ideas(id, project_id, title, motivation, module_plan_json,
             novelty_risk, implementation_plan, evidence_json, created_at)
             VALUES(?1, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                stable_id(&format!("idea:{}:{}", idea.idea_name, idea.core_motivation)),
                idea.idea_name,
                idea.core_motivation,
                serde_json::to_string(&idea.module_composition)?,
                if idea.reviewer_risk.contains("高") { 75.0 } else if idea.reviewer_risk.contains("中") { 45.0 } else { 25.0 },
                idea.implementation_steps.join("\n"),
                serde_json::to_string(&idea.evidence)?,
                Utc::now().to_rfc3339()
            ],
        )?;
    }
    Ok(())
}

async fn fetch_openalex(
    http: &reqwest::Client,
    secrets: &ResearchSecrets,
    query: &str,
    limit: usize,
) -> Result<Vec<ConnectorPaper>> {
    let Some(api_key) = non_empty_opt(&secrets.openalex_api_key) else {
        return Err(anyhow!("OpenAlex API key is not configured"));
    };
    let url = reqwest::Url::parse_with_params(
        "https://api.openalex.org/works",
        &[
            ("search", query),
            ("per-page", &limit.to_string()),
            ("sort", "relevance_score:desc,cited_by_count:desc"),
            ("api_key", api_key),
            ("select", "id,doi,display_name,title,publication_year,publication_date,authorships,primary_location,locations,abstract_inverted_index,cited_by_count,referenced_works,related_works"),
        ],
    )?;
    let value: Value = http
        .get(url)
        .headers(default_headers(None))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mut out = Vec::new();
    for item in value["results"].as_array().into_iter().flatten() {
        let title = text_value(item, &["display_name", "title"]);
        if title.is_empty() {
            continue;
        }
        let doi = normalize_doi(item["doi"].as_str());
        let openalex_id = item["id"].as_str().map(str::to_string);
        let authors = item["authorships"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|a| a["author"]["display_name"].as_str().map(str::to_string))
            .take(12)
            .collect::<Vec<_>>();
        let abstract_text = openalex_abstract(item.get("abstract_inverted_index"));
        let mut source_ids = BTreeMap::new();
        if let Some(id) = &openalex_id {
            source_ids.insert("openalex".into(), id.clone());
        }
        if let Some(doi) = &doi {
            source_ids.insert("doi".into(), doi.clone());
        }
        let paper = ResearchPaper {
            id: paper_id(&doi, &None, &openalex_id, &None, &title, item["publication_year"].as_i64()),
            title,
            abstract_text,
            authors,
            year: item["publication_year"].as_i64(),
            venue: item["primary_location"]["source"]["display_name"].as_str().map(str::to_string),
            doi,
            arxiv_id: None,
            openalex_id,
            s2_id: None,
            citation_count: item["cited_by_count"].as_i64(),
            pdf_url: item["primary_location"]["pdf_url"].as_str().map(str::to_string),
            url: item["primary_location"]["landing_page_url"].as_str().map(str::to_string),
            source_ids,
        };
        out.push(ConnectorPaper {
            paper,
            source: "openalex".into(),
            confidence: 0.86,
            evidence: vec!["OpenAlex work metadata".into()],
            repo_candidates: Vec::new(),
        });
    }
    Ok(out)
}

async fn fetch_semantic_scholar(
    http: &reqwest::Client,
    secrets: &ResearchSecrets,
    query: &str,
    limit: usize,
) -> Result<Vec<ConnectorPaper>> {
    let url = reqwest::Url::parse_with_params(
        "https://api.semanticscholar.org/graph/v1/paper/search",
        &[
            ("query", query),
            ("limit", &limit.to_string()),
            ("fields", "paperId,title,abstract,year,venue,citationCount,referenceCount,influentialCitationCount,externalIds,authors,url,openAccessPdf,publicationDate"),
        ],
    )?;
    let value: Value = http
        .get(url)
        .headers(default_headers(non_empty_opt(&secrets.semantic_scholar_api_key)))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mut out = Vec::new();
    for item in value["data"].as_array().into_iter().flatten() {
        let title = text_value(item, &["title"]);
        if title.is_empty() {
            continue;
        }
        let doi = item["externalIds"]["DOI"].as_str().and_then(|v| normalize_doi(Some(v)));
        let arxiv = item["externalIds"]["ArXiv"].as_str().map(str::to_string);
        let s2_id = item["paperId"].as_str().map(str::to_string);
        let authors = item["authors"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|a| a["name"].as_str().map(str::to_string))
            .take(12)
            .collect::<Vec<_>>();
        let mut source_ids = BTreeMap::new();
        if let Some(id) = &s2_id {
            source_ids.insert("semantic_scholar".into(), id.clone());
        }
        if let Some(doi) = &doi {
            source_ids.insert("doi".into(), doi.clone());
        }
        if let Some(arxiv) = &arxiv {
            source_ids.insert("arxiv".into(), arxiv.clone());
        }
        let paper = ResearchPaper {
            id: paper_id(&doi, &arxiv, &None, &s2_id, &title, item["year"].as_i64()),
            title,
            abstract_text: item["abstract"].as_str().unwrap_or_default().to_string(),
            authors,
            year: item["year"].as_i64(),
            venue: item["venue"].as_str().filter(|v| !v.is_empty()).map(str::to_string),
            doi,
            arxiv_id: arxiv,
            openalex_id: None,
            s2_id,
            citation_count: item["citationCount"].as_i64(),
            pdf_url: item["openAccessPdf"]["url"].as_str().map(str::to_string),
            url: item["url"].as_str().map(str::to_string),
            source_ids,
        };
        out.push(ConnectorPaper {
            paper,
            source: "semantic_scholar".into(),
            confidence: 0.84,
            evidence: vec!["Semantic Scholar paper search metadata".into()],
            repo_candidates: Vec::new(),
        });
    }
    Ok(out)
}

async fn fetch_crossref(
    http: &reqwest::Client,
    secrets: &ResearchSecrets,
    query: &str,
    limit: usize,
) -> Result<Vec<ConnectorPaper>> {
    let mut params = vec![
        ("query", query.to_string()),
        ("rows", limit.to_string()),
        ("select", "DOI,title,abstract,author,published-print,published-online,published,container-title,is-referenced-by-count,URL,relation".into()),
    ];
    if let Some(mailto) = non_empty_opt(&secrets.crossref_mailto) {
        params.push(("mailto", mailto.to_string()));
    }
    let url = reqwest::Url::parse_with_params("https://api.crossref.org/works", &params)?;
    let value: Value = http
        .get(url)
        .headers(default_headers(None))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mut out = Vec::new();
    for item in value["message"]["items"].as_array().into_iter().flatten() {
        let title = item["title"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }
        let doi = normalize_doi(item["DOI"].as_str());
        let authors = item["author"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|a| {
                let given = a["given"].as_str().unwrap_or_default();
                let family = a["family"].as_str().unwrap_or_default();
                let name = format!("{given} {family}").trim().to_string();
                (!name.is_empty()).then_some(name)
            })
            .take(12)
            .collect::<Vec<_>>();
        let year = crossref_year(item);
        let mut source_ids = BTreeMap::new();
        if let Some(doi) = &doi {
            source_ids.insert("doi".into(), doi.clone());
        }
        let paper = ResearchPaper {
            id: paper_id(&doi, &None, &None, &None, &title, year),
            title,
            abstract_text: strip_xmlish(item["abstract"].as_str().unwrap_or_default()),
            authors,
            year,
            venue: item["container-title"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
                .map(str::to_string),
            doi,
            arxiv_id: None,
            openalex_id: None,
            s2_id: None,
            citation_count: item["is-referenced-by-count"].as_i64(),
            pdf_url: None,
            url: item["URL"].as_str().map(str::to_string),
            source_ids,
        };
        out.push(ConnectorPaper {
            paper,
            source: "crossref".into(),
            confidence: 0.78,
            evidence: vec!["Crossref DOI and publisher metadata".into()],
            repo_candidates: Vec::new(),
        });
    }
    Ok(out)
}

async fn fetch_arxiv(
    root: &Path,
    http: &reqwest::Client,
    query: &str,
    limit: usize,
) -> Result<Vec<ConnectorPaper>> {
    respect_source_cooldown(root, "arxiv", Duration::from_secs(3)).await?;
    let search_query = format!("all:{query}");
    let url = reqwest::Url::parse_with_params(
        "https://export.arxiv.org/api/query",
        &[
            ("search_query", search_query.as_str()),
            ("start", "0"),
            ("max_results", &limit.to_string()),
            ("sortBy", "relevance"),
            ("sortOrder", "descending"),
        ],
    )?;
    let body = http
        .get(url)
        .headers(default_headers(None))
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let xml = XmlDocument::parse(&body)?;
    let mut out = Vec::new();
    for entry in xml.descendants().filter(|n| n.has_tag_name("entry")) {
        let title = child_text(entry, "title");
        if title.is_empty() {
            continue;
        }
        let abstract_text = child_text(entry, "summary");
        let id_url = child_text(entry, "id");
        let arxiv_id = id_url
            .rsplit('/')
            .next()
            .map(|value| value.trim_end_matches(|c: char| c == '\n' || c.is_whitespace()).to_string());
        let doi = entry
            .children()
            .find(|n| n.tag_name().name() == "doi")
            .and_then(|n| normalize_doi(n.text()));
        let authors = entry
            .children()
            .filter(|n| n.has_tag_name("author"))
            .filter_map(|n| n.children().find(|c| c.has_tag_name("name")).and_then(|c| c.text()))
            .map(|v| v.trim().to_string())
            .take(12)
            .collect::<Vec<_>>();
        let year = child_text(entry, "published")
            .get(0..4)
            .and_then(|value| value.parse::<i64>().ok());
        let pdf_url = entry
            .children()
            .filter(|n| n.has_tag_name("link"))
            .find(|n| n.attribute("title") == Some("pdf"))
            .and_then(|n| n.attribute("href"))
            .map(str::to_string);
        let mut source_ids = BTreeMap::new();
        if let Some(id) = &arxiv_id {
            source_ids.insert("arxiv".into(), id.clone());
        }
        if let Some(doi) = &doi {
            source_ids.insert("doi".into(), doi.clone());
        }
        let paper = ResearchPaper {
            id: paper_id(&doi, &arxiv_id, &None, &None, &title, year),
            title,
            abstract_text,
            authors,
            year,
            venue: Some("arXiv".into()),
            doi,
            arxiv_id,
            openalex_id: None,
            s2_id: None,
            citation_count: None,
            pdf_url,
            url: Some(id_url),
            source_ids,
        };
        out.push(ConnectorPaper {
            paper,
            source: "arxiv".into(),
            confidence: 0.76,
            evidence: vec!["arXiv Atom API metadata".into()],
            repo_candidates: Vec::new(),
        });
    }
    Ok(out)
}

async fn fetch_github_repos(
    http: &reqwest::Client,
    secrets: &ResearchSecrets,
    query: &str,
    limit: usize,
) -> Result<Vec<RepoCandidate>> {
    let q = format!("{} paper in:name,description,readme", query_terms(query, 8).join(" "));
    let url = reqwest::Url::parse_with_params(
        "https://api.github.com/search/repositories",
        &[
            ("q", q.as_str()),
            ("sort", "stars"),
            ("order", "desc"),
            ("per_page", &limit.to_string()),
        ],
    )?;
    let value: Value = http
        .get(url)
        .headers(default_headers(non_empty_opt(&secrets.github_token)))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mut out = Vec::new();
    for item in value["items"].as_array().into_iter().flatten() {
        let html_url = item["html_url"].as_str().unwrap_or_default();
        if html_url.is_empty() {
            continue;
        }
        let owner = item["owner"]["login"].as_str().map(str::to_string);
        let name = item["name"].as_str().map(str::to_string);
        let stars = item["stargazers_count"].as_i64();
        let description = item["description"].as_str().unwrap_or_default().to_lowercase();
        let official_score = if description.contains("official") || description.contains("paper") {
            78.0
        } else {
            52.0
        };
        out.push(RepoCandidate {
            url: html_url.into(),
            owner,
            name,
            stars,
            evidence: vec![
                "GitHub repository search candidate".into(),
                format!("stars={}", stars.unwrap_or_default()),
            ],
            official_score,
        });
    }
    Ok(out)
}

async fn audit_repo(
    http: &reqwest::Client,
    secrets: &ResearchSecrets,
    req: RepoAuditRequest,
) -> Result<RepoAuditReport> {
    let paper_id = req.paper_id.clone();
    if let Some(local) = req.local_path.as_deref().and_then(non_empty_opt) {
        return audit_local_repo(local, paper_id);
    }
    let (owner, name, repo_url) = repo_identity(req)?;
    let headers = default_headers(non_empty_opt(&secrets.github_token));
    let repo_api = format!("https://api.github.com/repos/{owner}/{name}");
    let repo_meta: Value = http
        .get(&repo_api)
        .headers(headers.clone())
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let tree_url = format!("https://api.github.com/repos/{owner}/{name}/git/trees/HEAD?recursive=1");
    let tree: Value = http
        .get(&tree_url)
        .headers(headers.clone())
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let files = tree["tree"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item["type"].as_str() == Some("blob"))
        .filter_map(|item| item["path"].as_str().map(str::to_string))
        .take(5000)
        .collect::<Vec<_>>();
    let readme = fetch_github_readme(http, &headers, &owner, &name)
        .await
        .unwrap_or_default();
    let issues = fetch_github_issues(http, &headers, &owner, &name)
        .await
        .unwrap_or_default();
    Ok(score_repo_audit(
        repo_url,
        owner,
        name,
        files,
        readme,
        issues,
        repo_meta,
        paper_id,
    ))
}

fn audit_local_repo(local_path: &str, paper_id: Option<String>) -> Result<RepoAuditReport> {
    let root = PathBuf::from(local_path);
    if !root.is_dir() {
        return Err(anyhow!("local repo path is not a directory"));
    }
    let mut files = Vec::new();
    collect_local_files(&root, &root, &mut files, 0)?;
    let readme = files
        .iter()
        .find(|path| path.to_ascii_lowercase().starts_with("readme"))
        .and_then(|path| fs::read_to_string(root.join(path)).ok())
        .unwrap_or_default();
    Ok(score_repo_audit(
        root.to_string_lossy().to_string(),
        "local".into(),
        root.file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("repo")
            .to_string(),
        files,
        readme,
        Vec::new(),
        json!({ "pushed_at": null, "created_at": null, "default_branch": null }),
        paper_id,
    ))
}

fn collect_local_files(root: &Path, dir: &Path, files: &mut Vec<String>, depth: usize) -> Result<()> {
    if depth > 6 || files.len() > 5000 {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if matches!(name.as_ref(), ".git" | "node_modules" | "target" | ".venv" | "__pycache__") {
            continue;
        }
        if path.is_dir() {
            collect_local_files(root, &path, files, depth + 1)?;
        } else if let Ok(rel) = path.strip_prefix(root) {
            files.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

async fn fetch_github_readme(
    http: &reqwest::Client,
    headers: &HeaderMap,
    owner: &str,
    name: &str,
) -> Result<String> {
    let url = format!("https://api.github.com/repos/{owner}/{name}/readme");
    Ok(http
        .get(url)
        .headers(headers.clone())
        .header(ACCEPT, "application/vnd.github.raw")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?)
}

async fn fetch_github_issues(
    http: &reqwest::Client,
    headers: &HeaderMap,
    owner: &str,
    name: &str,
) -> Result<Vec<String>> {
    let url = format!("https://api.github.com/repos/{owner}/{name}/issues?state=all&per_page=30");
    let value: Value = http
        .get(url)
        .headers(headers.clone())
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item["title"].as_str().map(str::to_string))
        .collect())
}

fn score_repo_audit(
    repo_url: String,
    owner: String,
    name: String,
    files: Vec<String>,
    readme: String,
    issues: Vec<String>,
    repo_meta: Value,
    paper_id: Option<String>,
) -> RepoAuditReport {
    let file_set = files.iter().map(|f| f.to_ascii_lowercase()).collect::<Vec<_>>();
    let has_readme = !readme.trim().is_empty() || file_set.iter().any(|f| f.starts_with("readme"));
    let has_requirements = any_file(&file_set, &["requirements.txt", "environment.yml", "environment.yaml", "pyproject.toml", "setup.py", "package.json"]);
    let has_train = any_name_contains(&file_set, &["train.py", "train_", "/train", "trainer.py"]);
    let has_eval = any_name_contains(&file_set, &["eval.py", "evaluate.py", "test.py", "inference.py", "demo.py"]);
    let has_dataset = any_name_contains(&file_set, &["dataset", "dataloader", "data_loader", "download"]);
    let has_checkpoint = any_name_contains(&file_set, &["checkpoint", "weights", ".pth", ".pt", ".ckpt", "pretrained"]);
    let has_config = any_name_contains(&file_set, &["config", ".yaml", ".yml", ".json"]);
    let hardcoded_paths = files
        .iter()
        .filter(|file| {
            let lower = file.to_ascii_lowercase();
            lower.contains("c:/") || lower.contains("/home/") || lower.contains("/mnt/")
        })
        .take(8)
        .cloned()
        .collect::<Vec<_>>();
    let readme_lower = readme.to_ascii_lowercase();
    let readme_mentions_command = readme_lower.contains("python ") || readme_lower.contains("pip install") || readme_lower.contains("conda ");
    let readme_mentions_split = ["split", "train/val", "train val", "threshold", "seed", "dataset"].iter().filter(|k| readme_lower.contains(**k)).count();
    let issue_signals = issues
        .iter()
        .filter(|title| {
            let lower = title.to_ascii_lowercase();
            ["reproduce", "cannot", "error", "fail", "broken", "missing", "checkpoint", "dataset", "cuda", "oom"]
                .iter()
                .any(|needle| lower.contains(needle))
        })
        .take(10)
        .cloned()
        .collect::<Vec<_>>();

    let mut evidence = Vec::new();
    let mut missing = Vec::new();
    let mut failure_points = Vec::new();
    let mut fixes = Vec::new();
    macro_rules! check {
        ($ok:expr, $good:expr, $bad:expr, $fix:expr) => {
            if $ok {
                evidence.push($good.to_string());
            } else {
                missing.push($bad.to_string());
                fixes.push($fix.to_string());
            }
        };
    }
    check!(has_readme, "README present", "README missing", "Add a README with setup, dataset, train and eval commands.");
    check!(has_requirements, "environment/dependency file found", "dependency file missing", "Add requirements.txt, environment.yaml or pyproject.toml.");
    check!(has_train, "training entrypoint found", "training entrypoint missing", "Add a documented training entrypoint.");
    check!(has_eval, "evaluation/inference entrypoint found", "evaluation/inference entrypoint missing", "Add an eval/inference command matching paper metrics.");
    check!(has_dataset, "dataset/download code found", "dataset preparation script missing", "Document dataset version, split and download/preprocess steps.");
    check!(has_config, "configuration files found", "experiment config missing", "Add config files for the main-table protocol.");
    if has_checkpoint {
        evidence.push("checkpoint or pretrained-weight reference found".into());
    } else {
        failure_points.push("No checkpoint/weight reference was found in the visible repository tree.".into());
    }
    if !hardcoded_paths.is_empty() {
        failure_points.push(format!("Possible hard-coded local paths: {}", hardcoded_paths.join(", ")));
    }
    if !issue_signals.is_empty() {
        failure_points.push(format!("Community issue signals: {}", issue_signals.len()));
    }
    if readme_mentions_command {
        evidence.push("README includes runnable command hints".into());
    } else {
        failure_points.push("README does not expose an obvious minimum run command.".into());
    }
    if readme_mentions_split < 2 {
        failure_points.push("README weakly documents protocol details such as split, threshold, seed or dataset.".into());
    }

    let completeness_hits = [
        has_readme,
        has_requirements,
        has_train,
        has_eval,
        has_dataset,
        has_config,
        has_checkpoint,
    ]
    .iter()
    .filter(|v| **v)
    .count() as f64;
    let code_completeness_score = (completeness_hits / 7.0 * 100.0).round();
    let reproducibility_score: f64 = (code_completeness_score
        - (issue_signals.len() as f64 * 4.0)
        - (hardcoded_paths.len() as f64 * 5.0)
        + if readme_mentions_command { 8.0 } else { -8.0 })
        .clamp(0.0, 100.0);
    let officialness_base: f64 = if readme_lower.contains("official") { 85.0 } else { 55.0 };
    let officialness_score = (officialness_base
        + if repo_meta["stargazers_count"].as_i64().unwrap_or(0) > 50 { 8.0_f64 } else { 0.0_f64 })
        .clamp(0.0, 100.0);
    let minimum_run_command = infer_minimum_command(&readme);
    let mut repo_behavior = BTreeMap::new();
    for (key, value) in [
        ("createdAt", repo_meta["created_at"].as_str()),
        ("pushedAt", repo_meta["pushed_at"].as_str()),
        ("defaultBranch", repo_meta["default_branch"].as_str()),
    ] {
        if let Some(value) = value {
            repo_behavior.insert(key.into(), value.into());
        }
    }
    if let Some(stars) = repo_meta["stargazers_count"].as_i64() {
        repo_behavior.insert("stars".into(), stars.to_string());
    }
    if let Some(paper_id) = paper_id.filter(|value| !value.trim().is_empty()) {
        repo_behavior.insert("paperId".into(), paper_id);
    }

    RepoAuditReport {
        repo_url,
        owner,
        name,
        officialness_score,
        code_completeness_score,
        reproducibility_score,
        missing_pieces: missing,
        likely_failure_points: failure_points,
        minimum_run_command,
        recommended_fixes: fixes,
        evidence,
        files_seen: files.into_iter().take(300).collect(),
        issue_signals,
        repo_behavior,
    }
}

fn compute_trick_score(paper_id: Option<String>, audit: Option<&RepoAuditReport>) -> TrickScoreReport {
    let mut evidence = Vec::new();
    let (code_risk, protocol_risk, community_risk, repo_risk) = if let Some(audit) = audit {
        evidence.extend(audit.evidence.iter().cloned());
        evidence.extend(audit.likely_failure_points.iter().cloned());
        evidence.extend(audit.missing_pieces.iter().map(|item| format!("Missing: {item}")));
        let code_risk = 100.0 - audit.code_completeness_score;
        let protocol_risk = if audit
            .likely_failure_points
            .iter()
            .any(|item| item.to_ascii_lowercase().contains("protocol"))
        {
            70.0
        } else if audit.missing_pieces.iter().any(|item| item.contains("dataset")) {
            55.0
        } else {
            25.0
        };
        let community_risk = (audit.issue_signals.len() as f64 * 12.0).min(90.0);
        let repo_risk = if audit.likely_failure_points.iter().any(|item| item.contains("hard-coded")) {
            70.0
        } else if audit.repo_behavior.get("stars").and_then(|s| s.parse::<i64>().ok()).unwrap_or(0) == 0 {
            45.0
        } else {
            20.0
        };
        (code_risk, protocol_risk, community_risk, repo_risk)
    } else {
        evidence.push("No repository audit was supplied; code and community risks are estimated conservatively.".into());
        (55.0, 45.0, 20.0, 35.0)
    };
    let result_risk = audit
        .map(|audit| 100.0 - audit.reproducibility_score)
        .unwrap_or(25.0)
        .clamp(0.0, 100.0);
    let novelty_risk = 35.0;
    let runtime_risk = if code_risk > 60.0 { 55.0 } else { 20.0 };
    let trick_score = (0.20 * code_risk
        + 0.20 * protocol_risk
        + 0.15 * result_risk
        + 0.15 * novelty_risk
        + 0.10 * community_risk
        + 0.10 * repo_risk
        + 0.10 * runtime_risk)
        .round();
    let risk_level = risk_level(trick_score).to_string();
    TrickScoreReport {
        paper_id,
        trick_score,
        risk_level,
        meaning: "复现和可信性风险评分，不代表论文造假。".into(),
        code_risk,
        protocol_risk,
        result_risk,
        novelty_risk,
        community_risk,
        repo_risk,
        runtime_risk,
        evidence: evidence.into_iter().take(12).collect(),
    }
}

fn build_paper_graph(
    conn: Option<&Connection>,
    paper: &ResearchPaper,
    repos: &[RepoCandidate],
) -> Result<(Vec<GraphNode>, Vec<GraphEdge>)> {
    let mut graph = StableDiGraph::<GraphNode, GraphEdge>::new();
    let center = graph.add_node(GraphNode {
        id: paper.id.clone(),
        label: paper.title.clone(),
        node_type: "Paper".into(),
        risk_level: None,
        confidence: 1.0,
    });
    let mut nodes_by_id = BTreeMap::new();
    nodes_by_id.insert(paper.id.clone(), center);

    let mut term_edges = 0usize;
    for (label, kind, confidence) in extract_method_terms(paper).into_iter().take(8) {
        let id = stable_id(&format!("term:{}:{label}", paper.id));
        let node = graph.add_node(GraphNode {
            id: id.clone(),
            label: label.clone(),
            node_type: kind.clone(),
            risk_level: None,
            confidence,
        });
        graph.add_edge(
            center,
            node,
            GraphEdge {
                source: paper.id.clone(),
                target: id.clone(),
                edge_type: format!("USES_{}", kind.to_ascii_uppercase()),
                evidence: format!("keyword extracted from title/abstract: {label}"),
                confidence,
            },
        );
        nodes_by_id.insert(id, node);
        term_edges += 1;
    }

    if term_edges == 0 {
        for label in query_terms(&paper.title, 8).into_iter().filter(|term| term.len() > 3).take(5) {
            let id = stable_id(&format!("title-term:{}:{label}", paper.id));
            let node = graph.add_node(GraphNode {
                id: id.clone(),
                label: label.clone(),
                node_type: "MethodKeyword".into(),
                risk_level: None,
                confidence: 0.42,
            });
            graph.add_edge(
                center,
                node,
                GraphEdge {
                    source: paper.id.clone(),
                    target: id.clone(),
                    edge_type: "TITLE_TECH_TERM".into(),
                    evidence: format!("fallback keyword extracted from paper title: {label}"),
                    confidence: 0.42,
                },
            );
            nodes_by_id.insert(id, node);
        }
    }

    for (source, source_id) in &paper.source_ids {
        let id = stable_id(&format!("source:{}:{}:{source_id}", paper.id, source));
        let node = graph.add_node(GraphNode {
            id: id.clone(),
            label: format!("{source}: {source_id}"),
            node_type: "SourceRecord".into(),
            risk_level: None,
            confidence: 0.7,
        });
        graph.add_edge(
            center,
            node,
            GraphEdge {
                source: paper.id.clone(),
                target: id.clone(),
                edge_type: "HAS_SOURCE_RECORD".into(),
                evidence: format!("paper was observed in source connector {source}"),
                confidence: 0.7,
            },
        );
        nodes_by_id.insert(id, node);
    }

    for repo in repos {
        let id = stable_id(&format!("repo:{}", repo.url));
        let node = graph.add_node(GraphNode {
            id: id.clone(),
            label: repo.name.clone().unwrap_or_else(|| repo.url.clone()),
            node_type: "CodeRepo".into(),
            risk_level: None,
            confidence: repo.official_score / 100.0,
        });
        graph.add_edge(
            center,
            node,
            GraphEdge {
                source: paper.id.clone(),
                target: id.clone(),
                edge_type: if repo.official_score >= 75.0 {
                    "HAS_OFFICIAL_CODE".into()
                } else {
                    "HAS_CODE".into()
                },
                evidence: repo.evidence.join("; "),
                confidence: repo.official_score / 100.0,
            },
        );
        nodes_by_id.insert(id, node);
    }

    if let Some(conn) = conn {
        let mut stmt = conn.prepare(
            "SELECT dst_paper_id, edge_type, evidence, confidence FROM paper_edges WHERE src_paper_id = ?1 LIMIT 40",
        )?;
        let edges = stmt.query_map(params![paper.id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
            ))
        })?;
        for edge in edges {
            let (target_id, edge_type, evidence, confidence) = edge?;
            let target = if let Some(target) = nodes_by_id.get(&target_id) {
                *target
            } else {
                let label = load_paper(conn, &target_id)?
                    .map(|p| p.title)
                    .unwrap_or_else(|| target_id.clone());
                let node = graph.add_node(GraphNode {
                    id: target_id.clone(),
                    label,
                    node_type: "Paper".into(),
                    risk_level: None,
                    confidence,
                });
                nodes_by_id.insert(target_id.clone(), node);
                node
            };
            graph.add_edge(
                center,
                target,
                GraphEdge {
                    source: paper.id.clone(),
                    target: target_id,
                    edge_type,
                    evidence,
                    confidence,
                },
            );
        }
    }

    let nodes = graph.node_weights().cloned().collect::<Vec<_>>();
    let edges = graph.edge_weights().cloned().collect::<Vec<_>>();
    Ok((nodes, edges))
}

fn compose_ideas(req: &IdeaRequest, target_paper: Option<&ResearchPaper>) -> Vec<IdeaOutput> {
    let clean = |value: Option<&str>, fallback: &str| -> String {
        value
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| fallback.to_string())
    };
    let paper_title = target_paper
        .map(|paper| paper.title.as_str())
        .filter(|title| !title.trim().is_empty());
    let field = clean(req.target_field.as_deref().or(paper_title), "当前研究主题未填写");
    let method = clean(req.current_method.as_deref().or(paper_title), "现有方法未填写");
    let pain = clean(req.pain_points.as_deref(), "痛点未填写，先从论文证据和复现风险里归纳");
    let constraints = clean(req.constraints.as_deref(), "优先保持现有代码主干和可复现实验协议");
    let venue = clean(req.target_venue.as_deref(), "目标会议未指定");
    let inherited = target_paper
        .map(|paper| vec![paper.title.clone()])
        .unwrap_or_else(|| vec![field.clone()]);
    let bank = module_bank();
    let pick = |names: &[&str]| -> Vec<ModuleSpec> {
        names
            .iter()
            .filter_map(|name| bank.iter().find(|module| module.module == *name).cloned())
            .collect()
    };
    vec![
        IdeaOutput {
            idea_name: format!("{field} 的证据一致性复现方案"),
            core_motivation: format!("围绕「{field}」和「{method}」，优先解决「{pain}」。方案把创新点、实验协议和代码复现证据绑定在一起，避免只做概念包装。"),
            inherited_from: inherited.clone(),
            different_from: vec![
                "把论文方法证据、仓库结构证据和实验协议证据同时作为方案约束。".into(),
                "每个新增模块都要求能落到当前工作区的文件、命令和消融实验。".into(),
            ],
            module_composition: pick(&["feature difference", "consistency loss", "prototype aggregation", "rank loss"]),
            implementation_steps: vec![
                format!("在当前工作区定位「{method}」对应的训练、评估和配置入口。"),
                "补齐 method_manifest.json，记录数据划分、随机种子、阈值、权重路径和运行命令。".into(),
                "加入最小可运行模块，先跑小样本冒烟实验，再扩展到正式表格。".into(),
                "把每次失败、耗时、显存和指标变化写入复现报告，供右侧代码分析继续审计。".into(),
            ],
            ablation_plan: vec![
                "原方法复现".into(),
                "原方法加协议记录".into(),
                "新增模块单独开启".into(),
                "新增模块加协议记录".into(),
            ],
            reviewer_risk: "中：需要证明新增模块不是简单工程堆叠，并给出跨设置复现实验。".into(),
            expected_gain: "降低复现不确定性，让创新收益、运行成本和失败原因能被审计。".into(),
            codex_prompt: format!("在当前工作区帮助复现并改造「{method}」。研究方向：{field}。痛点：{pain}。约束：{constraints}。目标：生成可运行代码、命令、消融计划和复现报告。"),
            evidence: vec![
                format!("用户研究方向：{field}"),
                format!("当前方法：{method}"),
                format!("约束：{constraints}"),
                format!("目标会议：{venue}"),
            ],
            confidence: if target_paper.is_some() { 0.78 } else { 0.62 },
        },
        IdeaOutput {
            idea_name: format!("{field} 的技术血缘对照方案"),
            core_motivation: format!("先把「{field}」相关论文、代码仓库和方法模块放到同一张技术关系图里，再从缺口处生成可实现选题。"),
            inherited_from: inherited,
            different_from: vec![
                "不只看引用关系，还看代码结构、数据集、训练命令和方法关键词。".into(),
                "输出的是可执行任务清单，而不是单纯的选题标题。".into(),
            ],
            module_composition: pick(&["token relation", "attention map difference", "cross-attention", "MIL pooling"]),
            implementation_steps: vec![
                "从右侧关系图提取引用边、代码边和方法相似边。".into(),
                "标出证据不足、复现风险高但潜在收益大的模块组合。".into(),
                "在当前工作区生成最小改造任务：文件位置、函数入口、配置项和验证命令。".into(),
                "用代码分析模块持续检查运行日志、依赖缺口和指标漂移。".into(),
            ],
            ablation_plan: vec![
                "只使用引用关系".into(),
                "加入方法关键词关系".into(),
                "加入仓库结构关系".into(),
                "加入运行日志和复现报告关系".into(),
            ],
            reviewer_risk: "中：需要避免把弱相关技术强行拼接，所有关系边必须保留证据和置信度。".into(),
            expected_gain: "让选题来源更清楚，并直接转化为可执行的代码复现任务。".into(),
            codex_prompt: format!("基于「{field}」构建技术血缘对照，找出能在当前工作区落地的改造点；约束：{constraints}；目标会议：{venue}。"),
            evidence: vec![
                "方案来源：用户输入、当前论文、关系图边和代码分析证据。".into(),
                format!("痛点：{pain}"),
            ],
            confidence: 0.7,
        },
    ]
}

#[allow(dead_code)]
fn legacy_compose_ideas(req: &IdeaRequest, target_paper: Option<&ResearchPaper>) -> Vec<IdeaOutput> {
    let field = req
        .target_field
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("当前研究主题未填写");
    let method = req
        .current_method
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("current detector");
    let pain = req
        .pain_points
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("cross-domain fake accuracy is unstable");
    let constraints = req
        .constraints
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("preserve backbone, keep the main-table protocol runnable");
    let venue = req
        .target_venue
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("AAAI / CVPR / ACM MM");
    let inherited = target_paper
        .map(|p| vec![p.title.clone()])
        .unwrap_or_else(|| vec!["CLIP-based detector family".into(), "frequency artifact detector family".into()]);
    let bank = module_bank();
    let pick = |names: &[&str]| -> Vec<ModuleSpec> {
        names
            .iter()
            .filter_map(|name| bank.iter().find(|module| module.module == *name).cloned())
            .collect()
    };
    vec![
        IdeaOutput {
            idea_name: "Counterfactual Texture Response Consistency".into(),
            core_motivation: format!("{field} 中 {method} 的痛点是 {pain}，优先用反事实纹理视图压低语义偏置。"),
            inherited_from: inherited.clone(),
            different_from: vec![
                "不只拼接频域和语义分支，而是约束真实纹理扰动下的响应几何一致性。".into(),
                "风险输出绑定复现协议，不把创新叙事和可复现性拆开。".into(),
            ],
            module_composition: pick(&["CLIP ViT-L/14", "PatchShuffle", "texture counterfactual", "feature difference", "consistency loss"]),
            implementation_steps: vec![
                "冻结或半冻结现有 backbone，新增反事实纹理视图生成器。".into(),
                "计算原图、PatchShuffle、纹理反事实三路特征响应差。".into(),
                "加入 response geometry scorer 并输出单调异常分数。".into(),
                "先跑小域验证 fake_acc，再扩展到主表。".into(),
            ],
            ablation_plan: vec![
                "baseline only".into(),
                "+ PatchShuffle".into(),
                "+ texture counterfactual".into(),
                "+ consistency loss".into(),
            ],
            reviewer_risk: "中：需要证明不是简单扰动增强。".into(),
            expected_gain: "提高跨域 fake_acc，并减少 real/fake 偏置。".into(),
            codex_prompt: format!("在当前方法 {method} 上实现反事实纹理响应一致性模块；约束：{constraints}；目标会议：{venue}。"),
            evidence: vec!["Module bank compatibility: CLIP + perturbation + feature relation + consistency loss".into()],
            confidence: 0.78,
        },
        IdeaOutput {
            idea_name: "Protocol-Aware Risk Calibrated Detector".into(),
            core_motivation: "把检测分数和复现协议风险绑定，解决高 AP 但阈值/real-fake 拆分不稳定的问题。".into(),
            inherited_from: inherited.clone(),
            different_from: vec![
                "输出检测结果同时输出协议置信度。".into(),
                "将 threshold、seed、dataset split 作为可审计变量记录。".into(),
            ],
            module_composition: pick(&["prototype aggregation", "rank loss", "center loss", "feature difference"]),
            implementation_steps: vec![
                "为每个数据域构建轻量 prototype memory。".into(),
                "训练 rank loss 使真实/伪造边界对阈值漂移更鲁棒。".into(),
                "导出 method_manifest.json 记录 split、seed、threshold。".into(),
            ],
            ablation_plan: vec![
                "without protocol manifest".into(),
                "without prototype aggregation".into(),
                "without rank loss".into(),
            ],
            reviewer_risk: "低-中：叙事偏工程，需要强调 protocol-aware detection。".into(),
            expected_gain: "降低阈值敏感性，让主表和复现实测更一致。".into(),
            codex_prompt: format!("为 {method} 增加 protocol-aware calibration 和 method_manifest 导出，保持主干不大改。"),
            evidence: vec!["Risk model highlights protocol and result anomaly as first-class signals".into()],
            confidence: 0.72,
        },
        IdeaOutput {
            idea_name: "Dual-Evidence Module Lineage Explorer".into(),
            core_motivation: "用论文术语相似和代码结构相似联合追踪技术来源，避免只靠 citation graph。".into(),
            inherited_from: inherited,
            different_from: vec![
                "结合 method keyword、repo 文件结构和 README 命令相似。".into(),
                "输出建议人工核查，不做法律化指控。".into(),
            ],
            module_composition: pick(&["token relation", "attention map difference", "cross-attention", "MIL pooling"]),
            implementation_steps: vec![
                "抽取论文方法关键词和模块链。".into(),
                "对候选 repo 建立文件/函数/配置特征。".into(),
                "生成 lineage confidence 和证据列表。".into(),
            ],
            ablation_plan: vec!["citation only".into(), "citation + terms".into(), "citation + terms + repo structure".into()],
            reviewer_risk: "中：需要谨慎措辞，避免抄袭指控。".into(),
            expected_gain: "增强选题来源解释和创新风险判断。".into(),
            codex_prompt: format!("实现论文-代码双证据技术血缘追踪，场景：{field}，约束：{constraints}。"),
            evidence: vec!["PaperGraph edge model includes method and code similarity".into()],
            confidence: 0.69,
        },
    ]
}

fn dedup_and_rank(
    query: &str,
    papers: Vec<ConnectorPaper>,
    github_candidates: Vec<RepoCandidate>,
    limit: usize,
) -> Vec<ResearchSearchResult> {
    let query_terms = query_terms(query, 20);
    let mut groups: Vec<ResearchSearchResult> = Vec::new();
    'outer: for item in papers {
        for existing in &mut groups {
            if same_paper(&existing.paper, &item.paper) {
                merge_paper(&mut existing.paper, item.paper.clone());
                if !existing.sources.contains(&item.source) {
                    existing.sources.push(item.source.clone());
                }
                existing
                    .dedup_evidence
                    .push(format!("Merged {} by DOI/arXiv/title-author similarity", item.source));
                existing.repo_candidates.extend(item.repo_candidates.clone());
                continue 'outer;
            }
        }
        let repo_candidates = best_repo_candidates(&item.paper, &github_candidates);
        let scores = paper_scores(&item.paper, &query_terms, &repo_candidates);
        let risk_preview = risk_preview(&item.paper, &repo_candidates);
        let llm_explanation = heuristic_explanation(&item.paper, &scores, &risk_preview);
        groups.push(ResearchSearchResult {
            paper: item.paper,
            sources: vec![item.source],
            scores,
            dedup_evidence: item.evidence,
            repo_candidates,
            risk_preview,
            llm_explanation,
        });
    }
    groups.sort_by(|a, b| {
        b.scores
            .relevance
            .partial_cmp(&a.scores.relevance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    groups.truncate(limit);
    groups
}

async fn enrich_with_llm(
    data_root: &Path,
    http: &reqwest::Client,
    query: &str,
    results: &mut [ResearchSearchResult],
) {
    let Ok(settings) = load_settings(data_root) else {
        return;
    };
    let Ok(provider) = resolve_provider(&settings) else {
        return;
    };
    if !provider.supports_streaming && !provider.supports_tools {
        return;
    }
    let Ok(secrets) = load_secrets(data_root) else {
        return;
    };
    let Some(secret) = secrets.providers.get(&settings.provider_id).cloned() else {
        return;
    };
    let shortlist = results
        .iter()
        .take(5)
        .map(|item| {
            json!({
                "title": item.paper.title,
                "year": item.paper.year,
                "venue": item.paper.venue,
                "abstract": item.paper.abstract_text.chars().take(900).collect::<String>(),
                "sources": item.sources,
                "risk": item.risk_preview,
                "repos": item.repo_candidates
            })
        })
        .collect::<Vec<_>>();
    let messages = vec![
        ChatMessage::system("You are RainyReSearch, a research reproducibility intelligence agent. Return compact JSON keyed by paper title with Chinese explanations. Avoid claims of fraud; discuss reproducibility risk only."),
        ChatMessage::user(&format!(
            "Query: {query}\nPapers: {}\nFor each paper explain relevance, possible lineage, reproduction value and audit caution in one concise Chinese paragraph.",
            serde_json::to_string(&shortlist).unwrap_or_default()
        )),
    ];
    let call = ModelCall {
        provider,
        settings,
        secret,
        messages,
        stream: false,
        tools_enabled: false,
    };
    if let Ok(model_result) = call_model(http, call).await {
        let content = model_result.content;
        for result in results.iter_mut().take(5) {
            result.llm_explanation = format!("{}\n\nLLM note: {}", result.llm_explanation, content.chars().take(900).collect::<String>());
        }
    }
}

fn best_repo_candidates(paper: &ResearchPaper, repos: &[RepoCandidate]) -> Vec<RepoCandidate> {
    let title_terms = query_terms(&paper.title, 12);
    let mut scored = repos
        .iter()
        .cloned()
        .map(|mut repo| {
            let hay = format!(
                "{} {} {}",
                repo.owner.clone().unwrap_or_default(),
                repo.name.clone().unwrap_or_default(),
                repo.url
            )
            .to_ascii_lowercase();
            let hits = title_terms.iter().filter(|term| hay.contains(&term[..])).count() as f64;
            repo.official_score = (repo.official_score + hits * 7.0).min(100.0);
            if hits > 0.0 {
                repo.evidence.push(format!("matches {hits:.0} title term(s)"));
            }
            repo
        })
        .filter(|repo| repo.official_score >= 55.0)
        .collect::<Vec<_>>();
    scored.sort_by(|a, b| {
        b.official_score
            .partial_cmp(&a.official_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.stars.unwrap_or_default().cmp(&a.stars.unwrap_or_default()))
    });
    scored.truncate(3);
    scored
}

fn paper_scores(paper: &ResearchPaper, query_terms: &[String], repos: &[RepoCandidate]) -> PaperScores {
    let text = format!("{} {}", paper.title, paper.abstract_text).to_ascii_lowercase();
    let hits = query_terms.iter().filter(|term| text.contains(&term[..])).count() as f64;
    let relevance = ((hits / query_terms.len().max(1) as f64) * 72.0
        + citation_score(paper.citation_count) * 0.16
        + if !repos.is_empty() { 12.0 } else { 0.0 })
        .clamp(0.0, 100.0);
    let freshness = paper
        .year
        .map(|year| ((year - 2018).max(0) as f64 / 8.0 * 100.0).min(100.0))
        .unwrap_or(40.0);
    let citation = citation_score(paper.citation_count);
    let code = repos.first().map(|repo| repo.official_score).unwrap_or(0.0);
    PaperScores {
        relevance: relevance.round(),
        freshness: freshness.round(),
        citation: citation.round(),
        code: code.round(),
        repro_value: ((relevance * 0.45) + (code * 0.35) + (citation * 0.20)).round(),
    }
}

fn citation_score(citations: Option<i64>) -> f64 {
    let value = citations.unwrap_or(0).max(0) as f64;
    (value.log10().max(0.0) / 4.0 * 100.0).min(100.0)
}

fn risk_preview(paper: &ResearchPaper, repos: &[RepoCandidate]) -> RiskPreview {
    let mut score: f64 = 35.0;
    let mut evidence = Vec::new();
    if repos.is_empty() {
        score += 20.0;
        evidence.push("No strong repository candidate found yet".into());
    } else if repos[0].official_score < 70.0 {
        score += 10.0;
        evidence.push("Repository candidate is not clearly official".into());
    } else {
        score -= 8.0;
        evidence.push("Repository candidate found".into());
    }
    if paper.abstract_text.len() < 200 {
        score += 8.0;
        evidence.push("Abstract metadata is sparse".into());
    }
    if paper.doi.is_none() && paper.arxiv_id.is_none() {
        score += 8.0;
        evidence.push("No DOI/arXiv identifier from current sources".into());
    }
    score = score.clamp(0.0, 100.0);
    RiskPreview {
        level: risk_level(score).into(),
        score: score.round(),
        evidence,
    }
}

fn heuristic_explanation(paper: &ResearchPaper, scores: &PaperScores, risk: &RiskPreview) -> String {
    format!(
        "相关度 {}，复现价值 {}，风险 {}。建议优先核查代码完整度、数据划分、阈值和 README 命令；当前证据来自 {}。",
        scores.relevance,
        scores.repro_value,
        risk.level,
        paper.source_ids.keys().cloned().collect::<Vec<_>>().join("/")
    )
}

fn same_paper(a: &ResearchPaper, b: &ResearchPaper) -> bool {
    if a.doi.is_some() && a.doi == b.doi {
        return true;
    }
    if a.arxiv_id.is_some() && a.arxiv_id == b.arxiv_id {
        return true;
    }
    if a.s2_id.is_some() && a.s2_id == b.s2_id {
        return true;
    }
    let title_sim = token_jaccard(&a.title, &b.title);
    let year_ok = a.year.is_none() || b.year.is_none() || a.year == b.year;
    let author_ok = a.authors.is_empty()
        || b.authors.is_empty()
        || a.authors
            .iter()
            .take(3)
            .any(|author| b.authors.iter().take(3).any(|other| token_jaccard(author, other) > 0.72));
    title_sim > 0.82 && year_ok && author_ok
}

fn merge_paper(target: &mut ResearchPaper, incoming: ResearchPaper) {
    if target.abstract_text.len() < incoming.abstract_text.len() {
        target.abstract_text = incoming.abstract_text;
    }
    if target.authors.is_empty() {
        target.authors = incoming.authors;
    }
    target.year = target.year.or(incoming.year);
    target.venue = target.venue.clone().or(incoming.venue);
    target.doi = target.doi.clone().or(incoming.doi);
    target.arxiv_id = target.arxiv_id.clone().or(incoming.arxiv_id);
    target.openalex_id = target.openalex_id.clone().or(incoming.openalex_id);
    target.s2_id = target.s2_id.clone().or(incoming.s2_id);
    target.citation_count = target.citation_count.max(incoming.citation_count);
    target.pdf_url = target.pdf_url.clone().or(incoming.pdf_url);
    target.url = target.url.clone().or(incoming.url);
    target.source_ids.extend(incoming.source_ids);
}

fn repo_identity(req: RepoAuditRequest) -> Result<(String, String, String)> {
    if let (Some(owner), Some(name)) = (req.owner, req.name) {
        let repo_url = req.repo_url.unwrap_or_else(|| format!("https://github.com/{owner}/{name}"));
        return Ok((owner, clean_repo_name(&name), repo_url));
    }
    let raw = req
        .repo_url
        .ok_or_else(|| anyhow!("repoUrl or owner/name is required"))?;
    let trimmed = raw.trim().trim_end_matches(".git").trim_end_matches('/');
    let parts = trimmed.split('/').collect::<Vec<_>>();
    if parts.len() < 2 {
        return Err(anyhow!("invalid GitHub repo URL"));
    }
    let owner = parts[parts.len() - 2].to_string();
    let name = clean_repo_name(parts[parts.len() - 1]);
    Ok((owner, name, format!("https://github.com/{}/{}", parts[parts.len() - 2], clean_repo_name(parts[parts.len() - 1]))))
}

fn clean_repo_name(name: &str) -> String {
    name.trim_end_matches(".git").to_string()
}

fn default_headers(token: Option<&str>) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static("RainyReSearch/1.0.0"));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if let Some(token) = token {
        if let Ok(value) = HeaderValue::from_str(&format!("Bearer {token}")) {
            headers.insert(AUTHORIZATION, value);
        }
    }
    headers
}

async fn respect_source_cooldown(root: &Path, source: &str, interval: Duration) -> Result<()> {
    let path = root
        .join("research")
        .join("source-cache")
        .join(format!("{source}.last"));
    if let Ok(metadata) = fs::metadata(&path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = modified.elapsed() {
                if elapsed < interval {
                    tokio::time::sleep(interval - elapsed).await;
                }
            }
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, format!("{:?}", SystemTime::now()))?;
    Ok(())
}

fn child_text(node: roxmltree::Node<'_, '_>, tag: &str) -> String {
    node.children()
        .find(|n| n.has_tag_name(tag))
        .and_then(|n| n.text())
        .unwrap_or_default()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn openalex_abstract(value: Option<&Value>) -> String {
    let Some(map) = value.and_then(|v| v.as_object()) else {
        return String::new();
    };
    let mut positions = BTreeMap::<usize, String>::new();
    for (word, indexes) in map {
        for index in indexes.as_array().into_iter().flatten() {
            if let Some(index) = index.as_u64() {
                positions.insert(index as usize, word.clone());
            }
        }
    }
    positions.values().cloned().collect::<Vec<_>>().join(" ")
}

fn text_value(item: &Value, keys: &[&str]) -> String {
    keys.iter()
        .filter_map(|key| item[*key].as_str())
        .find(|value| !value.trim().is_empty())
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn normalize_doi(raw: Option<&str>) -> Option<String> {
    let mut value = raw?.trim().to_ascii_lowercase();
    value = value.trim_start_matches("https://doi.org/").to_string();
    value = value.trim_start_matches("http://doi.org/").to_string();
    value = value.trim_start_matches("doi:").to_string();
    (!value.is_empty()).then_some(value)
}

fn crossref_year(item: &Value) -> Option<i64> {
    for key in ["published-print", "published-online", "published"] {
        if let Some(year) = item[key]["date-parts"]
            .as_array()
            .and_then(|outer| outer.first())
            .and_then(|inner| inner.as_array())
            .and_then(|parts| parts.first())
            .and_then(|v| v.as_i64())
        {
            return Some(year);
        }
    }
    None
}

fn strip_xmlish(raw: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in raw.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn paper_id(
    doi: &Option<String>,
    arxiv: &Option<String>,
    openalex: &Option<String>,
    s2: &Option<String>,
    title: &str,
    year: Option<i64>,
) -> String {
    if let Some(doi) = doi {
        return stable_id(&format!("doi:{doi}"));
    }
    if let Some(arxiv) = arxiv {
        return stable_id(&format!("arxiv:{arxiv}"));
    }
    if let Some(openalex) = openalex {
        return stable_id(&format!("openalex:{openalex}"));
    }
    if let Some(s2) = s2 {
        return stable_id(&format!("s2:{s2}"));
    }
    stable_id(&format!("title:{}:{}", normalize_title(title), year.unwrap_or_default()))
}

fn stable_id(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("rr-{}", hex_lower(&hasher.finalize()[..16]))
}

fn hex_lower(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn normalize_title(title: &str) -> String {
    title
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn query_terms(query: &str, limit: usize) -> Vec<String> {
    let stop = ["the", "and", "for", "with", "from", "using", "based", "paper", "论文", "方法"];
    normalize_title(query)
        .split_whitespace()
        .filter(|term| term.len() > 1 && !stop.contains(term))
        .take(limit)
        .map(canonical_term)
        .collect()
}

fn canonical_term(term: &str) -> String {
    if term.len() > 4 && term.ends_with("ies") {
        return format!("{}y", &term[..term.len() - 3]);
    }
    if term.len() > 3 && term.ends_with('s') && !term.ends_with("ss") {
        return term[..term.len() - 1].to_string();
    }
    term.to_string()
}

fn token_jaccard(a: &str, b: &str) -> f64 {
    let a = query_terms(a, 64).into_iter().collect::<BTreeSet<_>>();
    let b = query_terms(b, 64).into_iter().collect::<BTreeSet<_>>();
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let intersection = a.intersection(&b).count() as f64;
    let union = a.union(&b).count() as f64;
    intersection / union
}

fn non_empty_opt(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then_some(trimmed)
}

fn any_file(files: &[String], needles: &[&str]) -> bool {
    files.iter().any(|file| needles.iter().any(|needle| file.ends_with(needle)))
}

fn any_name_contains(files: &[String], needles: &[&str]) -> bool {
    files.iter().any(|file| needles.iter().any(|needle| file.contains(needle)))
}

fn infer_minimum_command(readme: &str) -> Option<String> {
    readme
        .lines()
        .map(str::trim)
        .find(|line| {
            let lower = line.to_ascii_lowercase();
            lower.starts_with("python ") || lower.starts_with("pip ") || lower.starts_with("conda ") || lower.starts_with("bash ")
        })
        .map(|line| line.trim_matches('`').to_string())
}

fn extract_method_terms(paper: &ResearchPaper) -> Vec<(String, String, f64)> {
    let text = format!("{} {}", paper.title, paper.abstract_text).to_ascii_lowercase();
    let dictionary = [
        ("CLIP", "Backbone"),
        ("ViT", "Backbone"),
        ("ResNet", "Backbone"),
        ("DINO", "Backbone"),
        ("diffusion", "Method"),
        ("frequency", "Module"),
        ("patch", "Module"),
        ("perturbation", "Module"),
        ("contrastive", "Loss"),
        ("ranking", "Loss"),
        ("dataset", "Dataset"),
        ("benchmark", "Metric"),
        ("fake", "Claim"),
        ("real", "Claim"),
    ];
    dictionary
        .iter()
        .filter(|(needle, _)| text.contains(&needle.to_ascii_lowercase()))
        .map(|(needle, kind)| (needle.to_string(), kind.to_string(), 0.68))
        .collect()
}

fn risk_level(score: f64) -> &'static str {
    if score >= 75.0 {
        "High"
    } else if score >= 55.0 {
        "Medium-High"
    } else if score >= 35.0 {
        "Medium"
    } else {
        "Low"
    }
}

fn safe_file_stem(value: &str) -> String {
    let stem = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
        .collect::<String>();
    stem.trim_matches('-').chars().take(80).collect::<String>()
}

fn safe_file_name(value: &str) -> String {
    let mut name = safe_file_stem(value.trim_end_matches(".md"));
    if name.is_empty() {
        name = "research-report".into();
    }
    format!("{name}.md")
}

fn render_report_markdown(title: &str, kind: &str, payload: &Value) -> String {
    format!(
        "# {title}\n\n- Kind: `{kind}`\n- Generated: `{}`\n\n```json\n{}\n```\n",
        Utc::now().to_rfc3339(),
        serde_json::to_string_pretty(payload).unwrap_or_else(|_| "{}".into())
    )
}

fn module_bank() -> Vec<ModuleSpec> {
    vec![
        module("CLIP ViT-L/14", "Backbone", &["CLIP"], &["PatchShuffle", "feature difference", "consistency loss"], "medium", "强 backbone，不能单独作为创新点。"),
        module("DINOv2", "Backbone", &["DINOv2"], &["feature difference", "prototype aggregation"], "medium", "适合做跨域表征对照。"),
        module("PatchShuffle", "View", &["BSA-style patch perturbation"], &["CLIP ViT-L/14", "ConvNeXt", "ViT"], "medium", "不能单独作为创新点，只能作为辅助视图。"),
        module("texture counterfactual", "View", &["counterfactual texture"], &["CLIP ViT-L/14", "DINOv2"], "medium", "需要证明反事实生成不是数据增强。"),
        module("FFT mask", "View", &["frequency artifact detector"], &["ConvNeXt", "Swin", "ViT"], "low", "频域分支常见，适合作为证据源。"),
        module("feature difference", "FeatureRelation", &["response consistency"], &["CLIP ViT-L/14", "DINOv2"], "low", "可解释性强，但需要避免只做特征拼接。"),
        module("token relation", "FeatureRelation", &["ViT token relation"], &["ViT", "CLIP ViT-L/14"], "medium", "适合技术血缘分析和注意力差异。"),
        module("attention map difference", "FeatureRelation", &["attention diagnostics"], &["ViT", "Swin"], "medium", "需要额外可视化验证。"),
        module("prototype aggregation", "Fusion", &["prototype learning"], &["feature difference", "rank loss"], "low", "适合稳定跨域阈值。"),
        module("cross-attention", "Fusion", &["multi-view fusion"], &["token relation", "feature difference"], "medium", "审稿会质疑复杂度收益。"),
        module("MIL pooling", "Fusion", &["multiple instance learning"], &["patch features"], "medium", "适合局部伪影检测。"),
        module("rank loss", "Loss", &["ranking loss"], &["prototype aggregation"], "low", "适合做阈值鲁棒性。"),
        module("center loss", "Loss", &["metric learning"], &["prototype aggregation"], "low", "需要小心类别坍缩。"),
        module("consistency loss", "Loss", &["consistency regularization"], &["PatchShuffle", "texture counterfactual"], "medium", "需要证明不是简单正则。"),
    ]
}

fn module(
    module: &str,
    category: &str,
    source_papers: &[&str],
    compatible_with: &[&str],
    risk: &str,
    novelty_note: &str,
) -> ModuleSpec {
    ModuleSpec {
        module: module.into(),
        category: category.into(),
        source_papers: source_papers.iter().map(|v| (*v).into()).collect(),
        compatible_with: compatible_with.iter().map(|v| (*v).into()).collect(),
        risk: risk.into(),
        novelty_note: novelty_note.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedup_matches_doi_and_title_year() {
        let a = paper_fixture("A Strong Detector", Some("10.1/test"), None, Some(2025));
        let b = paper_fixture("A Strong Detector!", Some("https://doi.org/10.1/test"), None, Some(2025));
        assert!(same_paper(&a, &b));
        let c = paper_fixture("A Strong Detector for Images", None, None, Some(2025));
        let d = paper_fixture("A Strong Detector for Image", None, None, Some(2025));
        assert!(same_paper(&c, &d));
    }

    #[test]
    #[allow(unreachable_code)]
    fn trick_score_weights_code_and_protocol_risk() {
        let audit = RepoAuditReport {
            repo_url: "https://github.com/a/b".into(),
            owner: "a".into(),
            name: "b".into(),
            officialness_score: 80.0,
            code_completeness_score: 20.0,
            reproducibility_score: 15.0,
            missing_pieces: vec!["training entrypoint missing".into(), "dataset preparation script missing".into()],
            likely_failure_points: vec!["README weakly documents protocol details".into()],
            minimum_run_command: None,
            recommended_fixes: Vec::new(),
            evidence: Vec::new(),
            files_seen: Vec::new(),
            issue_signals: vec!["cannot reproduce".into()],
            repo_behavior: BTreeMap::new(),
        };
        let report = compute_trick_score(Some("p1".into()), Some(&audit));
        assert!(report.trick_score >= 55.0);
        assert_eq!(report.meaning, "复现和可信性风险评分，不代表论文造假。");
        return;
        assert_eq!(report.meaning, "复现和可信性风险评分，不代表论文造假。");
    }

    #[test]
    fn sqlite_migration_creates_research_tables() {
        let dir = tempfile::tempdir().unwrap();
        ensure_research_dirs(dir.path()).unwrap();
        let conn = open_db(dir.path()).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='papers'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    fn paper_fixture(
        title: &str,
        doi: Option<&str>,
        arxiv: Option<&str>,
        year: Option<i64>,
    ) -> ResearchPaper {
        let doi = doi.and_then(|v| normalize_doi(Some(v)));
        let arxiv = arxiv.map(str::to_string);
        ResearchPaper {
            id: paper_id(&doi, &arxiv, &None, &None, title, year),
            title: title.into(),
            abstract_text: "A detector with CLIP perturbation and frequency evidence.".into(),
            authors: vec!["Rainy".into()],
            year,
            venue: Some("Test".into()),
            doi,
            arxiv_id: arxiv,
            openalex_id: None,
            s2_id: None,
            citation_count: Some(10),
            pdf_url: None,
            url: None,
            source_ids: BTreeMap::new(),
        }
    }
}
