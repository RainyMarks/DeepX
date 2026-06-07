use anyhow::{anyhow, Context, Result};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use futures_util::{stream, Stream, StreamExt};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::convert::Infallible;
use std::env;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use tower_http::cors::CorsLayer;
use uuid::Uuid;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_SYSTEM_PROMPT: &str = "You are DeepX, a local coding and reasoning agent. \
Keep responses concise, preserve user intent, and do not claim external actions unless they were executed.";
const MAX_AGENT_TOOL_ROUNDS: usize = 6;
const MAX_WORKSPACE_TREE_ENTRIES: usize = 160;
const MAX_WORKSPACE_LIST_ENTRIES: usize = 240;
const MAX_WORKSPACE_SEARCH_RESULTS: usize = 80;
const MAX_WORKSPACE_VISITED_ENTRIES: usize = 12_000;
const MAX_WORKSPACE_READ_BYTES: u64 = 256 * 1024;
const MAX_WORKSPACE_GREP_FILE_BYTES: u64 = 512 * 1024;
const MAX_WORKSPACE_WRITE_BYTES: usize = 1024 * 1024;
const MAX_SHELL_OUTPUT_CHARS: usize = 32_000;
const MAX_TOOL_RESULT_CHARS: usize = 24_000;
const MAX_PROJECT_INSTRUCTION_FILE_BYTES: u64 = 64 * 1024;
const MAX_PROJECT_INSTRUCTION_TOTAL_BYTES: usize = 96 * 1024;
const MAX_PROJECT_INSTRUCTION_SCAN_DEPTH: usize = 5;
const MAX_PROJECT_INSTRUCTION_CANDIDATES: usize = 80;
const DEFAULT_SHELL_TIMEOUT_SECONDS: u64 = 30;
const MAX_CHECKPOINT_FILES: usize = 5_000;
const MAX_CHECKPOINT_FILE_BYTES: u64 = 1024 * 1024;
const MAX_CHECKPOINT_TOTAL_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Clone)]
struct AppState {
    data_root: Arc<PathBuf>,
    http: reqwest::Client,
}

#[tokio::main]
async fn main() -> Result<()> {
    let port = parse_port_arg();
    let data_root = resolve_data_root()?;
    ensure_data_dirs(&data_root)?;

    let state = AppState {
        data_root: Arc::new(data_root.clone()),
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(240))
            .build()
            .context("failed to build HTTP client")?,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/providers", get(providers))
        .route("/config", get(config_get).post(config_save))
        .route("/test-connection", post(test_connection))
        .route("/web-search", post(web_search))
        .route("/runtime/info", get(runtime_info))
        .route("/runtime/tools", get(runtime_tools))
        .route("/chat", post(chat))
        .route("/chat/stream", post(chat_stream))
        .route("/sessions", get(sessions))
        .route(
            "/sessions/:id/checkpoints/:checkpoint_id/restore",
            post(session_checkpoint_restore),
        )
        .route("/sessions/:id", get(session_read))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .context("failed to bind core listener")?;
    let actual_port = listener
        .local_addr()
        .context("failed to read listener address")?
        .port();
    println!(
        "{}",
        serde_json::to_string(&json!({
            "event": "ready",
            "version": VERSION,
            "port": actual_port,
            "dataRoot": data_root
        }))?
    );

    axum::serve(listener, app)
        .await
        .context("deepx-core server stopped unexpectedly")?;
    Ok(())
}

fn parse_port_arg() -> u16 {
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--port" {
            if let Some(value) = args.next() {
                if let Ok(port) = value.parse::<u16>() {
                    return port;
                }
            }
        }
    }
    0
}

fn resolve_data_root() -> Result<PathBuf> {
    if let Ok(raw) = env::var("DEEPX_HOME") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }

    let exe = env::current_exe().context("failed to resolve current executable")?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| anyhow!("failed to resolve executable directory"))?;
    if exe_dir.file_name().and_then(|n| n.to_str()) == Some("resources") {
        if let Some(root) = exe_dir.parent() {
            return Ok(root.join("data"));
        }
    }
    Ok(env::current_dir()?.join("data"))
}

fn ensure_data_dirs(root: &Path) -> Result<()> {
    for name in [
        "config",
        "sessions",
        "logs",
        "plugins",
        "skills",
        "cache-metrics",
        "checkpoints",
        "electron-user-data",
        "home",
        "appdata",
        "localappdata",
    ] {
        fs::create_dir_all(root.join(name))
            .with_context(|| format!("failed to create data directory {name}"))?;
    }
    Ok(())
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "version": VERSION,
        "dataRoot": state.data_root.as_ref(),
        "providers": provider_profiles()
    }))
}

async fn runtime_info(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let settings = load_settings(&state.data_root).map_err(ApiError::internal)?;
    let workspace = workspace_root(&settings);
    Ok(Json(json!({
        "name": "DeepX Agent Runtime",
        "version": VERSION,
        "protocol": "deepx-core-http-sse-v1",
        "capabilities": {
            "agentLoop": true,
            "toolCalls": true,
            "workspaceTools": workspace.is_some(),
            "fileRead": true,
            "fileWrite": permission_allows_write(&settings),
            "shell": permission_allows_shell(&settings, "pwd"),
            "git": workspace.is_some(),
            "webSearch": settings.web_search_enabled,
            "approvals": false,
            "mcp": false,
            "skills": false,
            "memory": false,
            "subagents": false
        },
        "limits": {
            "maxToolRounds": MAX_AGENT_TOOL_ROUNDS,
            "maxReadBytes": MAX_WORKSPACE_READ_BYTES,
            "maxWriteBytes": MAX_WORKSPACE_WRITE_BYTES,
            "maxShellOutputChars": MAX_SHELL_OUTPUT_CHARS
        },
        "workspace": workspace.map(|p| p.to_string_lossy().to_string()),
        "permissionMode": settings.permission_mode
    })))
}

async fn runtime_tools(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let settings = load_settings(&state.data_root).map_err(ApiError::internal)?;
    let tools = workspace_tool_definitions(&settings);
    let fingerprint = sha256_hex(serde_json::to_string(&tools).unwrap_or_default().as_bytes());
    Ok(Json(json!({
        "ok": true,
        "toolCount": tools.as_array().map(|items| items.len()).unwrap_or(0),
        "toolCatalogFingerprint": fingerprint,
        "permissionMode": settings.permission_mode,
        "tools": tools
    })))
}
async fn providers() -> Json<Value> {
    Json(json!({ "providers": provider_profiles() }))
}

async fn config_get(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let settings = load_settings(&state.data_root).map_err(ApiError::internal)?;
    let secrets = load_secrets(&state.data_root).map_err(ApiError::internal)?;
    let configured: BTreeMap<String, bool> = provider_profiles()
        .into_iter()
        .map(|p| {
            let has_key = secrets
                .providers
                .get(&p.id)
                .is_some_and(|s| !s.api_key.trim().is_empty());
            (p.id, has_key)
        })
        .collect();

    Ok(Json(json!({
        "settings": settings,
        "configuredProviders": configured,
    })))
}

async fn config_save(
    State(state): State<AppState>,
    Json(req): Json<SaveConfigRequest>,
) -> Result<Json<Value>, ApiError> {
    let mut settings = load_settings(&state.data_root).map_err(ApiError::internal)?;
    let mut secrets = load_secrets(&state.data_root).map_err(ApiError::internal)?;

    if let Some(provider_id) = req.provider_id {
        settings.provider_id = provider_id;
    }
    if let Some(model) = req.model {
        settings.model = model;
    }
    if let Some(base_url) = req.base_url {
        settings.base_url = Some(base_url);
    }
    if let Some(enabled) = req.thinking_enabled {
        settings.thinking_enabled = enabled;
    }
    if let Some(effort) = req.reasoning_effort {
        settings.reasoning_effort = effort;
    }
    if let Some(max_tokens) = req.max_tokens {
        settings.max_tokens = max_tokens;
    }
    if let Some(context_window) = req.context_window {
        settings.context_window = context_window.max(1024);
    }
    if let Some(temperature) = req.temperature {
        settings.temperature = temperature;
    }
    if let Some(preserve) = req.preserve_reasoning {
        settings.preserve_reasoning = preserve;
    }
    if let Some(enabled) = req.web_search_enabled {
        settings.web_search_enabled = enabled;
    }
    if let Some(max_results) = req.web_search_max_results {
        settings.web_search_max_results = max_results.clamp(1, 8);
    }
    if let Some(mode) = req.appearance_mode {
        settings.appearance_mode = normalize_appearance_mode(&mode).to_string();
    }
    if let Some(theme) = req.appearance_theme {
        settings.appearance_theme = normalize_theme(&theme);
    }
    if let Some(color) = req.accent_color {
        settings.accent_color = normalize_hex_color(&color, default_accent_color());
    }
    if let Some(color) = req.background_color {
        settings.background_color = normalize_hex_color(&color, default_background_color());
    }
    if let Some(color) = req.foreground_color {
        settings.foreground_color = normalize_hex_color(&color, default_foreground_color());
    }
    if let Some(font) = req.ui_font {
        settings.ui_font = normalize_non_empty(font, default_ui_font());
    }
    if let Some(font) = req.code_font {
        settings.code_font = normalize_non_empty(font, default_code_font());
    }
    if let Some(font_scale) = req.font_scale {
        settings.font_scale = font_scale.clamp(90, 115);
    }
    if let Some(font_size) = req.ui_font_size {
        settings.ui_font_size = font_size.clamp(12, 18);
    }
    if let Some(font_size) = req.code_font_size {
        settings.code_font_size = font_size.clamp(10, 16);
    }
    if let Some(density) = req.density {
        settings.density = normalize_density(&density).to_string();
    }
    if let Some(enabled) = req.translucent_sidebar {
        settings.translucent_sidebar = enabled;
    }
    if let Some(contrast) = req.contrast {
        settings.contrast = contrast.clamp(35, 85);
    }
    if let Some(enabled) = req.pointer_cursor {
        settings.pointer_cursor = enabled;
    }
    if let Some(mode) = req.permission_mode {
        settings.permission_mode = normalize_permission_mode(&mode).to_string();
    }
    if let Some(workspace_path) = req.workspace_path {
        settings.workspace_path = non_empty(workspace_path);
    }
    if let Some(history) = req.workspace_history {
        settings.workspace_history = history;
    }
    if let Some(width) = req.sidebar_width {
        settings.sidebar_width = width.clamp(220, 420);
    }
    if let Some(collapsed) = req.sidebar_collapsed {
        settings.sidebar_collapsed = collapsed;
    }
    if let Some(language) = req.language {
        settings.language = normalize_language(&language).to_string();
    }
    if let Some(custom) = req.custom_provider {
        settings.custom_provider = Some(custom);
    }

    normalize_settings_for_provider(&mut settings);
    normalize_loaded_settings(&mut settings);

    if let Some(api_key) = req.api_key {
        let provider_id = settings.provider_id.clone();
        secrets.providers.insert(
            provider_id,
            ProviderSecret {
                api_key,
                auth_header_name: req.auth_header_name,
            },
        );
    } else if let Some(header) = req.auth_header_name {
        let provider_id = settings.provider_id.clone();
        let entry = secrets
            .providers
            .entry(provider_id)
            .or_insert_with(ProviderSecret::default);
        entry.auth_header_name = Some(header);
    }

    save_settings(&state.data_root, &settings).map_err(ApiError::internal)?;
    save_secrets(&state.data_root, &secrets).map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "settings": settings })))
}

fn normalize_settings_for_provider(settings: &mut Settings) {
    let Ok(provider) = resolve_provider(settings) else {
        return;
    };
    let thinking = selected_thinking_profile(&provider, &settings.model);
    if !thinking.supported {
        settings.thinking_enabled = false;
        settings.reasoning_effort = thinking.default_effort.unwrap_or_else(|| "medium".into());
        return;
    }

    if thinking.kind == "effort" {
        let fallback = thinking
            .default_effort
            .as_deref()
            .unwrap_or("medium")
            .to_string();
        settings.reasoning_effort = if provider.id == "deepseek" {
            normalize_deepseek_effort(&settings.reasoning_effort, &thinking)
        } else {
            normalize_effort_for_profile(&settings.reasoning_effort, &thinking, &fallback)
        };
    } else {
        settings.reasoning_effort = thinking.default_effort.unwrap_or_else(|| "medium".into());
    }
}

async fn sessions(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let mut out = Vec::new();
    let dir = state.data_root.join("sessions");
    if dir.exists() {
        for entry in fs::read_dir(&dir).map_err(ApiError::internal)? {
            let entry = entry.map_err(ApiError::internal)?;
            if entry.path().extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(session) = read_session_file(&entry.path()) {
                out.push(SessionSummary {
                    id: session.id,
                    title: session.title,
                    provider_id: session.provider_id,
                    model: session.model,
                    workspace_path: session.workspace_path,
                    updated_at: session.updated_at,
                    message_count: session.messages.len(),
                });
            }
        }
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(Json(json!({ "sessions": out })))
}

async fn session_read(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<Value>, ApiError> {
    let path = session_path(&state.data_root, &id)?;
    let session = read_session_file(&path).map_err(ApiError::internal)?;
    Ok(Json(json!({ "session": session })))
}

async fn session_checkpoint_restore(
    State(state): State<AppState>,
    axum::extract::Path((id, checkpoint_id)): axum::extract::Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let summary = restore_workspace_checkpoint(&state.data_root, &id, &checkpoint_id)?;
    let path = session_path(&state.data_root, &id)?;
    let mut session = read_session_file(&path).map_err(ApiError::internal)?;
    if let Some(index) = session
        .messages
        .iter()
        .position(|message| message.checkpoint_id.as_deref() == Some(checkpoint_id.as_str()))
    {
        let remaining_metrics = session.messages[..index]
            .iter()
            .filter(|message| message.role == "assistant")
            .count();
        session.messages.truncate(index);
        session.metrics.truncate(remaining_metrics);
        session.updated_at = Utc::now();
        write_session_file(&path, &session).map_err(ApiError::internal)?;
    }
    Ok(Json(json!({ "ok": true, "summary": summary, "session": session })))
}

async fn test_connection(
    State(state): State<AppState>,
    Json(req): Json<TestConnectionRequest>,
) -> Result<Json<Value>, ApiError> {
    let mut settings = load_settings(&state.data_root).map_err(ApiError::internal)?;
    if let Some(provider_id) = req.provider_id {
        settings.provider_id = provider_id;
    }
    if let Some(model) = req.model {
        settings.model = model;
    }
    if let Some(base_url) = req.base_url {
        settings.base_url = Some(base_url);
    }
    let mut secrets = load_secrets(&state.data_root).map_err(ApiError::internal)?;
    if let Some(api_key) = req.api_key {
        secrets.providers.insert(
            settings.provider_id.clone(),
            ProviderSecret {
                api_key,
                auth_header_name: req.auth_header_name,
            },
        );
    }
    let provider = resolve_provider(&settings)?;
    let secret = secrets
        .providers
        .get(&settings.provider_id)
        .cloned()
        .ok_or_else(|| ApiError::bad_request("missing API key for selected provider"))?;

    let messages = vec![
        ChatMessage::system("Respond with exactly: OK"),
        ChatMessage::user("Connection test."),
    ];
    let call = ModelCall {
        provider,
        settings,
        secret,
        messages,
        stream: false,
        tools_enabled: false,
    };
    let result = call_model(&state.http, call).await?;
    Ok(Json(json!({
        "ok": true,
        "content": result.content,
        "usage": result.usage
    })))
}

async fn web_search(
    State(state): State<AppState>,
    Json(req): Json<WebSearchRequest>,
) -> Result<Json<Value>, ApiError> {
    let query = req.query.trim();
    if query.is_empty() {
        return Err(ApiError::bad_request("web search query is empty"));
    }
    let max_results = req.max_results.unwrap_or(5).clamp(1, 8);
    let url = reqwest::Url::parse_with_params(
        "https://api.duckduckgo.com/",
        &[
            ("q", query),
            ("format", "json"),
            ("no_html", "1"),
            ("skip_disambig", "1"),
        ],
    )
    .map_err(|err| ApiError::internal(anyhow!("failed to build search URL: {err}")))?;

    let value: Value = state
        .http
        .get(url)
        .send()
        .await
        .map_err(|err| ApiError::upstream(format!("web search request failed: {err}")))?
        .error_for_status()
        .map_err(|err| ApiError::upstream(format!("web search returned error: {err}")))?
        .json()
        .await
        .map_err(|err| ApiError::upstream(format!("web search response decode failed: {err}")))?;

    let results = extract_duckduckgo_results(&value, max_results as usize);
    Ok(Json(json!({
        "provider": "duckduckgo-instant-answer",
        "query": query,
        "results": results,
    })))
}

async fn chat(
    State(state): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<Json<Value>, ApiError> {
    let prepared = prepare_chat_turn(&state.data_root, req)?;
    let session_id = prepared.session.id.clone();
    let result = run_agent_turn(&state.http, prepared.call.clone(), &state.data_root, &session_id, None).await?;
    let completed = finish_chat_turn(&state.data_root, prepared, result)?;

    Ok(Json(json!({
        "sessionId": completed.session_id,
        "content": completed.content,
        "reasoning": completed.reasoning,
        "usage": completed.usage,
        "metric": completed.metric,
        "prefixHash": completed.prefix_hash,
        "prefixChanged": completed.prefix_changed,
        "checkpointId": completed.checkpoint_id,
    })))
}

async fn chat_stream(
    State(state): State<AppState>,
    Json(req): Json<ChatRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiError> {
    let prepared = prepare_chat_turn(&state.data_root, req)?;
    let data_root = state.data_root.as_ref().clone();
    let http = state.http.clone();
    let session_id = prepared.session.id.clone();
    let (tx, rx) = mpsc::channel::<Result<Event, Infallible>>(64);

    tokio::spawn(async move {
        match run_agent_turn(&http, prepared.call.clone(), &data_root, &session_id, Some(&tx)).await {
            Ok(result) => match finish_chat_turn(&data_root, prepared, result) {
                Ok(completed) => {
                    send_sse(&tx, "metric", json!({ "metric": completed.metric })).await;
                    send_sse(
                        &tx,
                        "done",
                        json!({
                            "sessionId": completed.session_id,
                            "usage": completed.usage,
                            "prefixHash": completed.prefix_hash,
                            "prefixChanged": completed.prefix_changed,
                            "checkpointId": completed.checkpoint_id
                        }),
                    )
                    .await;
                }
                Err(err) => {
                    send_sse(&tx, "error", json!({ "error": err.message })).await;
                }
            },
            Err(err) => {
                send_sse(&tx, "error", json!({ "error": err.message })).await;
            }
        }
    });

    let stream = stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

fn prepare_chat_turn(data_root: &Path, req: ChatRequest) -> Result<PreparedChatTurn, ApiError> {
    let mut settings = load_settings(data_root).map_err(ApiError::internal)?;
    if let Some(overrides) = req.settings {
        apply_runtime_overrides(&mut settings, overrides);
    }
    let provider = resolve_provider(&settings)?;
    let secrets = load_secrets(data_root).map_err(ApiError::internal)?;
    let secret = secrets
        .providers
        .get(&settings.provider_id)
        .cloned()
        .ok_or_else(|| ApiError::bad_request("missing API key for selected provider"))?;

    let user_message = req.message;
    let session_id = req
        .session_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(new_session_id);
    let path = session_path(data_root, &session_id)?;
    let session = if path.exists() {
        read_session_file(&path).map_err(ApiError::internal)?
    } else {
        Session {
            id: session_id.clone(),
            title: user_message
                .split_whitespace()
                .take(8)
                .collect::<Vec<_>>()
                .join(" "),
            provider_id: settings.provider_id.clone(),
            model: settings.model.clone(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            workspace_path: settings.workspace_path.clone(),
            prefix_hash: String::new(),
            prefix_changed: true,
            prefix_change_reasons: Vec::new(),
            messages: Vec::new(),
            metrics: Vec::new(),
        }
    };
    let checkpoint_id = if permission_allows_write(&settings) {
        create_workspace_checkpoint(data_root, &settings, &session_id)
            .ok()
            .flatten()
    } else {
        None
    };

    let prefix = build_prefix(&provider, &settings);
    let prefix_hash = sha256_hex(prefix.as_bytes());
    let prefix_changed = session.prefix_hash != prefix_hash;
    let mut prefix_change_reasons = Vec::new();
    if session.prefix_hash.is_empty() {
        prefix_change_reasons.push("new_session".to_string());
    } else if prefix_changed {
        prefix_change_reasons.push("provider_model_context_permissions_or_project_instructions_changed".to_string());
    }

    let prefix_message = ChatMessage::system(prefix);
    let mut history = session
        .messages
        .iter()
        .map(|m| m.to_chat_message(settings.preserve_reasoning))
        .collect::<Vec<_>>();
    let mut turn_context = Vec::new();
    if let Some(web_context) = req.web_context.as_deref().and_then(non_empty_str) {
        turn_context.push(ChatMessage::system(format!(
            "Web search context for the current user turn. Use it only when it is relevant, cite URLs in the final answer when relying on it, and say if the search results are insufficient.\n\n{web_context}"
        )));
    }
    if let Some(workspace_context) = build_workspace_turn_context(&settings) {
        turn_context.push(ChatMessage::system(workspace_context));
    }
    let user_chat_message = ChatMessage::user(user_message.clone());
    let context_budget = trim_history_to_context_budget(
        &settings,
        &prefix_message,
        &mut history,
        &turn_context,
        &user_chat_message,
    );
    let mut messages = vec![prefix_message];
    if context_budget.truncated_messages > 0 {
        messages.push(ChatMessage::system(format!(
            "Context truncated: DeepX omitted {} older message(s) to fit the configured context window of {} tokens. Continue from the remaining visible conversation.",
            context_budget.truncated_messages, settings.context_window
        )));
    }
    messages.extend(history);
    messages.extend(turn_context);
    messages.push(user_chat_message);

    let call = ModelCall {
        provider: provider.clone(),
        settings: settings.clone(),
        secret,
        messages,
        stream: true,
        tools_enabled: workspace_root(&settings).is_some(),
    };

    Ok(PreparedChatTurn {
        path,
        session,
        provider,
        settings,
        user_message,
        prefix_hash,
        prefix_changed,
        prefix_change_reasons,
        context_truncated: context_budget.truncated_messages > 0,
        context_truncated_messages: context_budget.truncated_messages,
        checkpoint_id,
        call,
    })
}

fn finish_chat_turn(
    data_root: &Path,
    prepared: PreparedChatTurn,
    result: ModelResult,
) -> Result<CompletedChatTurn, ApiError> {
    let PreparedChatTurn {
        path,
        mut session,
        provider,
        settings,
        user_message,
        prefix_hash,
        prefix_changed,
        prefix_change_reasons,
        context_truncated,
        context_truncated_messages,
        checkpoint_id,
        ..
    } = prepared;

    let now = Utc::now();
    session.provider_id = settings.provider_id.clone();
    session.model = settings.model.clone();
    session.workspace_path = settings.workspace_path.clone();
    session.updated_at = now;
    session.prefix_hash = prefix_hash.clone();
    session.prefix_changed = prefix_changed;
    session.prefix_change_reasons = prefix_change_reasons.clone();
    session.messages.push(StoredMessage {
        role: "user".to_string(),
        content: user_message,
        reasoning_content: None,
        checkpoint_id: None,
        created_at: now,
    });
    session.messages.push(StoredMessage {
        role: "assistant".to_string(),
        content: result.content.clone(),
        reasoning_content: result.reasoning.clone(),
        checkpoint_id: checkpoint_id.clone(),
        created_at: Utc::now(),
    });

    let cache_hit = result.usage.cache_hit_tokens;
    let cache_miss = result.usage.cache_miss_tokens;
    let hit_ratio = if cache_hit + cache_miss > 0 {
        cache_hit as f64 / (cache_hit + cache_miss) as f64
    } else {
        0.0
    };
    let cost = estimate_cost(&provider, &settings.model, &result.usage);
    let metric = TurnMetric {
        id: Uuid::new_v4().to_string(),
        created_at: Utc::now(),
        provider_id: settings.provider_id.clone(),
        model: settings.model.clone(),
        cache_hit_tokens: cache_hit,
        cache_miss_tokens: cache_miss,
        hit_ratio,
        prompt_tokens: result.usage.prompt_tokens,
        completion_tokens: result.usage.completion_tokens,
        reasoning_tokens: result.usage.reasoning_tokens,
        total_tokens: result.usage.total_tokens,
        estimated_cost: cost,
        prefix_hash: prefix_hash.clone(),
        prefix_changed,
        prefix_change_reasons,
        context_truncated,
        context_truncated_messages,
        context_window: settings.context_window,
    };
    session.metrics.push(metric.clone());
    write_session_file(&path, &session).map_err(ApiError::internal)?;
    write_metric_file(data_root, &metric).map_err(ApiError::internal)?;

    Ok(CompletedChatTurn {
        session_id: session.id,
        content: result.content,
        reasoning: result.reasoning,
        usage: result.usage,
        metric,
        prefix_hash,
        prefix_changed,
        checkpoint_id,
    })
}

struct ContextBudgetResult {
    truncated_messages: usize,
}

fn trim_history_to_context_budget(
    settings: &Settings,
    prefix: &ChatMessage,
    history: &mut Vec<ChatMessage>,
    turn_context: &[ChatMessage],
    current_user: &ChatMessage,
) -> ContextBudgetResult {
    let budget = input_context_budget(settings);
    let fixed_tokens = approximate_message_tokens(prefix)
        + turn_context
            .iter()
            .map(approximate_message_tokens)
            .sum::<u64>()
        + approximate_message_tokens(current_user)
        + 96;
    let mut history_tokens = history
        .iter()
        .map(approximate_message_tokens)
        .sum::<u64>();
    let mut truncated_messages = 0;

    while !history.is_empty() && fixed_tokens + history_tokens > budget {
        let removed = remove_oldest_turn(history);
        if removed == 0 {
            break;
        }
        truncated_messages += removed;
        history_tokens = history
            .iter()
            .map(approximate_message_tokens)
            .sum::<u64>();
    }

    ContextBudgetResult { truncated_messages }
}

fn input_context_budget(settings: &Settings) -> u64 {
    let context = settings.context_window.max(1024);
    let reserve = settings.max_tokens.min(context / 2).max(256);
    context.saturating_sub(reserve).max(512)
}

fn remove_oldest_turn(history: &mut Vec<ChatMessage>) -> usize {
    if history.is_empty() {
        return 0;
    }
    let first_role = history[0].role.clone();
    history.remove(0);
    let mut removed = 1;
    if first_role == "user" && history.first().is_some_and(|message| message.role == "assistant")
    {
        history.remove(0);
        removed += 1;
    }
    removed
}

fn approximate_message_tokens(message: &ChatMessage) -> u64 {
    4 + approximate_text_tokens(&message.role)
        + approximate_text_tokens(&message.content)
        + message
            .reasoning_content
            .as_deref()
            .map(approximate_text_tokens)
            .unwrap_or(0)
}

fn approximate_text_tokens(text: &str) -> u64 {
    let chars = text.chars().count() as u64;
    (chars + 3) / 4
}

fn apply_runtime_overrides(settings: &mut Settings, overrides: ChatSettingsOverride) {
    if let Some(provider_id) = overrides.provider_id {
        settings.provider_id = provider_id;
    }
    if let Some(model) = overrides.model {
        settings.model = model;
    }
    if let Some(thinking_enabled) = overrides.thinking_enabled {
        settings.thinking_enabled = thinking_enabled;
    }
    if let Some(reasoning_effort) = overrides.reasoning_effort {
        settings.reasoning_effort = reasoning_effort;
    }
    if let Some(max_tokens) = overrides.max_tokens {
        settings.max_tokens = max_tokens;
    }
    if let Some(context_window) = overrides.context_window {
        settings.context_window = context_window.max(1024);
    }
    if let Some(temperature) = overrides.temperature {
        settings.temperature = temperature;
    }
    if let Some(web_search_enabled) = overrides.web_search_enabled {
        settings.web_search_enabled = web_search_enabled;
    }
    if let Some(max_results) = overrides.web_search_max_results {
        settings.web_search_max_results = max_results.clamp(1, 8);
    }
    if let Some(mode) = overrides.permission_mode {
        settings.permission_mode = normalize_permission_mode(&mode).to_string();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderProfile {
    id: String,
    display_name: String,
    base_url: String,
    auth: AuthProfile,
    default_model: String,
    models: Vec<ModelProfile>,
    context_window: u64,
    max_output_tokens: u64,
    supports_thinking: bool,
    supports_tools: bool,
    supports_streaming: bool,
    usage_mapping: UsageMapping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthProfile {
    header_name: String,
    scheme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelProfile {
    id: String,
    display_name: String,
    context_window: u64,
    max_output_tokens: u64,
    price: PriceProfile,
    thinking: ThinkingProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThinkingProfile {
    supported: bool,
    kind: String,
    effort_values: Vec<String>,
    default_effort: Option<String>,
    budget_supported: bool,
    default_budget_tokens: Option<u64>,
    max_budget_tokens: Option<u64>,
    preserve_reasoning_supported: bool,
    history_policy: String,
    request_mapping: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PriceProfile {
    cache_hit_per_m: f64,
    cache_miss_per_m: f64,
    output_per_m: f64,
    currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageMapping {
    cache_hit: Vec<String>,
    cache_miss: Vec<String>,
    reasoning_tokens: Vec<String>,
}

fn provider_profiles() -> Vec<ProviderProfile> {
    vec![
        ProviderProfile {
            id: "deepseek".into(),
            display_name: "DeepSeek".into(),
            base_url: "https://api.deepseek.com".into(),
            auth: bearer_auth(),
            default_model: "deepseek-v4-flash".into(),
            models: vec![
                with_thinking(
                    model(
                        "deepseek-v4-flash",
                        "DeepSeek V4 Flash",
                        1_000_000,
                        384_000,
                        price(0.0028, 0.14, 0.28, "$"),
                    ),
                    thinking_effort(
                        &["high", "max"],
                        "max",
                        false,
                        "thinking.type + reasoning_effort(high|max)",
                    ),
                ),
                with_thinking(
                    model(
                        "deepseek-v4-pro",
                        "DeepSeek V4 Pro",
                        1_000_000,
                        384_000,
                        price(0.003625, 0.435, 0.87, "$"),
                    ),
                    thinking_effort(
                        &["high", "max"],
                        "max",
                        false,
                        "thinking.type + reasoning_effort(high|max)",
                    ),
                ),
            ],
            context_window: 1_000_000,
            max_output_tokens: 384_000,
            supports_thinking: true,
            supports_tools: true,
            supports_streaming: true,
            usage_mapping: standard_usage_mapping(),
        },
        ProviderProfile {
            id: "mimo".into(),
            display_name: "Xiaomi MiMo".into(),
            base_url: "https://api.xiaomimimo.com/v1".into(),
            auth: bearer_auth(),
            default_model: "mimo-v2.5-pro".into(),
            models: vec![with_thinking(
                model(
                    "mimo-v2.5-pro",
                    "MiMo V2.5 Pro",
                    256_000,
                    64_000,
                    price(0.0, 0.0, 0.0, "unknown"),
                ),
                thinking_effort(
                    &["low", "medium", "high"],
                    "high",
                    false,
                    "thinking.type(adaptive) + reasoning_effort(low|medium|high)",
                ),
            )],
            context_window: 256_000,
            max_output_tokens: 64_000,
            supports_thinking: true,
            supports_tools: true,
            supports_streaming: true,
            usage_mapping: standard_usage_mapping(),
        },
        ProviderProfile {
            id: "glm".into(),
            display_name: "Zhipu GLM".into(),
            base_url: "https://open.bigmodel.cn/api/paas/v4".into(),
            auth: bearer_auth(),
            default_model: "glm-5.1".into(),
            models: vec![
                with_thinking(
                    model(
                        "glm-5.1",
                        "GLM 5.1",
                        128_000,
                        32_000,
                        price(0.0, 0.0, 0.0, "unknown"),
                    ),
                    thinking_toggle(true, "thinking.type + clear_thinking"),
                ),
                with_thinking(
                    model(
                        "glm-4.6",
                        "GLM 4.6",
                        128_000,
                        32_000,
                        price(0.0, 0.0, 0.0, "unknown"),
                    ),
                    thinking_toggle(true, "thinking.type + clear_thinking"),
                ),
            ],
            context_window: 128_000,
            max_output_tokens: 32_000,
            supports_thinking: true,
            supports_tools: true,
            supports_streaming: true,
            usage_mapping: standard_usage_mapping(),
        },
        ProviderProfile {
            id: "qwen".into(),
            display_name: "Qwen DashScope".into(),
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".into(),
            auth: bearer_auth(),
            default_model: "qwen3-coder-plus".into(),
            models: vec![
                with_thinking(
                    model(
                        "qwen3-coder-plus",
                        "Qwen3 Coder Plus",
                        1_000_000,
                        64_000,
                        price(0.0, 0.0, 0.0, "unknown"),
                    ),
                    thinking_budget(
                        16_384,
                        65_536,
                        true,
                        "enable_thinking + preserve_thinking + thinking_budget",
                    ),
                ),
                with_thinking(
                    model(
                        "qwen-plus",
                        "Qwen Plus",
                        128_000,
                        16_000,
                        price(0.0, 0.0, 0.0, "unknown"),
                    ),
                    thinking_budget(
                        8_192,
                        65_536,
                        true,
                        "enable_thinking + preserve_thinking + thinking_budget",
                    ),
                ),
            ],
            context_window: 1_000_000,
            max_output_tokens: 64_000,
            supports_thinking: true,
            supports_tools: true,
            supports_streaming: true,
            usage_mapping: standard_usage_mapping(),
        },
        ProviderProfile {
            id: "kimi".into(),
            display_name: "Kimi".into(),
            base_url: "https://api.moonshot.cn/v1".into(),
            auth: bearer_auth(),
            default_model: "kimi-k2.6".into(),
            models: vec![
                model(
                    "kimi-k2.6",
                    "Kimi K2.6",
                    256_000,
                    64_000,
                    price(0.0, 0.0, 0.0, "unknown"),
                ),
                model(
                    "kimi-k2",
                    "Kimi K2",
                    256_000,
                    64_000,
                    price(0.0, 0.0, 0.0, "unknown"),
                ),
            ],
            context_window: 256_000,
            max_output_tokens: 64_000,
            supports_thinking: false,
            supports_tools: true,
            supports_streaming: true,
            usage_mapping: standard_usage_mapping(),
        },
        ProviderProfile {
            id: "stepfun".into(),
            display_name: "StepFun".into(),
            base_url: "https://api.stepfun.ai/v1".into(),
            auth: bearer_auth(),
            default_model: "step-3.7-flash".into(),
            models: vec![with_thinking(
                model(
                    "step-3.7-flash",
                    "Step 3.7 Flash",
                    128_000,
                    32_000,
                    price(0.0, 0.0, 0.0, "unknown"),
                ),
                thinking_effort(
                    &["low", "medium", "high"],
                    "high",
                    false,
                    "reasoning_format(parsed) + reasoning_effort(low|medium|high)",
                ),
            )],
            context_window: 128_000,
            max_output_tokens: 32_000,
            supports_thinking: true,
            supports_tools: true,
            supports_streaming: true,
            usage_mapping: standard_usage_mapping(),
        },
        ProviderProfile {
            id: "minimax".into(),
            display_name: "MiniMax".into(),
            base_url: "https://api.minimax.io/v1".into(),
            auth: bearer_auth(),
            default_model: "MiniMax-M3".into(),
            models: vec![
                with_thinking(
                    model(
                        "MiniMax-M3",
                        "MiniMax M3",
                        1_000_000,
                        64_000,
                        price(0.0, 0.0, 0.0, "unknown"),
                    ),
                    thinking_adaptive(true, "thinking.type(adaptive) + reasoning_split"),
                ),
                with_thinking(
                    model(
                        "MiniMax-M2.7",
                        "MiniMax M2.7",
                        204_800,
                        32_000,
                        price(0.0, 0.0, 0.0, "unknown"),
                    ),
                    thinking_adaptive(true, "thinking.type(adaptive) + reasoning_split"),
                ),
            ],
            context_window: 1_000_000,
            max_output_tokens: 64_000,
            supports_thinking: true,
            supports_tools: true,
            supports_streaming: true,
            usage_mapping: standard_usage_mapping(),
        },
        ProviderProfile {
            id: "custom".into(),
            display_name: "Custom OpenAI-compatible".into(),
            base_url: "http://localhost:8000/v1".into(),
            auth: bearer_auth(),
            default_model: "custom-model".into(),
            models: vec![model(
                "custom-model",
                "Custom model",
                128_000,
                16_000,
                price(0.0, 0.0, 0.0, "unknown"),
            )],
            context_window: 128_000,
            max_output_tokens: 16_000,
            supports_thinking: false,
            supports_tools: true,
            supports_streaming: true,
            usage_mapping: standard_usage_mapping(),
        },
    ]
}

fn bearer_auth() -> AuthProfile {
    AuthProfile {
        header_name: "Authorization".into(),
        scheme: "Bearer".into(),
    }
}

fn price(
    cache_hit_per_m: f64,
    cache_miss_per_m: f64,
    output_per_m: f64,
    currency: &'static str,
) -> PriceProfile {
    PriceProfile {
        cache_hit_per_m,
        cache_miss_per_m,
        output_per_m,
        currency: currency.to_string(),
    }
}

fn model(
    id: &str,
    display_name: &str,
    context_window: u64,
    max_output_tokens: u64,
    price: PriceProfile,
) -> ModelProfile {
    ModelProfile {
        id: id.into(),
        display_name: display_name.into(),
        context_window,
        max_output_tokens,
        price,
        thinking: thinking_none(),
    }
}

fn with_thinking(mut model: ModelProfile, thinking: ThinkingProfile) -> ModelProfile {
    model.thinking = thinking;
    model
}

fn thinking_none() -> ThinkingProfile {
    ThinkingProfile {
        supported: false,
        kind: "none".into(),
        effort_values: Vec::new(),
        default_effort: None,
        budget_supported: false,
        default_budget_tokens: None,
        max_budget_tokens: None,
        preserve_reasoning_supported: false,
        history_policy: "never-send-reasoning-history".into(),
        request_mapping: "none".into(),
    }
}

fn thinking_effort(
    values: &[&str],
    default: &str,
    preserve_reasoning_supported: bool,
    request_mapping: &str,
) -> ThinkingProfile {
    ThinkingProfile {
        supported: true,
        kind: "effort".into(),
        effort_values: values.iter().map(|value| (*value).into()).collect(),
        default_effort: Some(default.into()),
        budget_supported: false,
        default_budget_tokens: None,
        max_budget_tokens: None,
        preserve_reasoning_supported,
        history_policy: if preserve_reasoning_supported {
            "provider-controlled-reasoning-history".into()
        } else {
            "do-not-send-reasoning-history".into()
        },
        request_mapping: request_mapping.into(),
    }
}

fn thinking_toggle(preserve_reasoning_supported: bool, request_mapping: &str) -> ThinkingProfile {
    ThinkingProfile {
        supported: true,
        kind: "toggle".into(),
        effort_values: Vec::new(),
        default_effort: None,
        budget_supported: false,
        default_budget_tokens: None,
        max_budget_tokens: None,
        preserve_reasoning_supported,
        history_policy: if preserve_reasoning_supported {
            "provider-controlled-reasoning-history".into()
        } else {
            "do-not-send-reasoning-history".into()
        },
        request_mapping: request_mapping.into(),
    }
}

fn thinking_budget(
    default_budget_tokens: u64,
    max_budget_tokens: u64,
    preserve_reasoning_supported: bool,
    request_mapping: &str,
) -> ThinkingProfile {
    ThinkingProfile {
        supported: true,
        kind: "budget".into(),
        effort_values: Vec::new(),
        default_effort: None,
        budget_supported: true,
        default_budget_tokens: Some(default_budget_tokens),
        max_budget_tokens: Some(max_budget_tokens),
        preserve_reasoning_supported,
        history_policy: if preserve_reasoning_supported {
            "provider-controlled-reasoning-history".into()
        } else {
            "do-not-send-reasoning-history".into()
        },
        request_mapping: request_mapping.into(),
    }
}

fn thinking_adaptive(preserve_reasoning_supported: bool, request_mapping: &str) -> ThinkingProfile {
    ThinkingProfile {
        supported: true,
        kind: "adaptive".into(),
        effort_values: Vec::new(),
        default_effort: None,
        budget_supported: false,
        default_budget_tokens: None,
        max_budget_tokens: None,
        preserve_reasoning_supported,
        history_policy: if preserve_reasoning_supported {
            "provider-controlled-reasoning-history".into()
        } else {
            "do-not-send-reasoning-history".into()
        },
        request_mapping: request_mapping.into(),
    }
}

fn standard_usage_mapping() -> UsageMapping {
    UsageMapping {
        cache_hit: vec![
            "usage.prompt_cache_hit_tokens".into(),
            "usage.prompt_tokens_details.cached_tokens".into(),
        ],
        cache_miss: vec![
            "usage.prompt_cache_miss_tokens".into(),
            "usage.prompt_tokens - cached_tokens".into(),
        ],
        reasoning_tokens: vec![
            "usage.completion_tokens_details.reasoning_tokens".into(),
            "delta.reasoning_details".into(),
        ],
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    provider_id: String,
    model: String,
    base_url: Option<String>,
    #[serde(default = "default_language")]
    language: String,
    thinking_enabled: bool,
    reasoning_effort: String,
    max_tokens: u64,
    context_window: u64,
    temperature: f64,
    preserve_reasoning: bool,
    #[serde(default)]
    web_search_enabled: bool,
    #[serde(default = "default_web_search_max_results")]
    web_search_max_results: u64,
    #[serde(default = "default_appearance_mode")]
    appearance_mode: String,
    #[serde(default = "default_appearance_theme")]
    appearance_theme: String,
    #[serde(default = "default_accent_color")]
    accent_color: String,
    #[serde(default = "default_background_color")]
    background_color: String,
    #[serde(default = "default_foreground_color")]
    foreground_color: String,
    #[serde(default = "default_ui_font")]
    ui_font: String,
    #[serde(default = "default_code_font")]
    code_font: String,
    #[serde(default = "default_font_scale")]
    font_scale: u64,
    #[serde(default = "default_ui_font_size")]
    ui_font_size: u64,
    #[serde(default = "default_code_font_size")]
    code_font_size: u64,
    #[serde(default = "default_density")]
    density: String,
    #[serde(default)]
    translucent_sidebar: bool,
    #[serde(default = "default_contrast")]
    contrast: u64,
    #[serde(default = "default_pointer_cursor")]
    pointer_cursor: bool,
    #[serde(default = "default_permission_mode")]
    permission_mode: String,
    #[serde(default)]
    workspace_path: Option<String>,
    #[serde(default)]
    workspace_history: Vec<String>,
    #[serde(default = "default_sidebar_width")]
    sidebar_width: u64,
    #[serde(default)]
    sidebar_collapsed: bool,
    custom_provider: Option<CustomProvider>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            provider_id: "deepseek".into(),
            model: "deepseek-v4-flash".into(),
            base_url: None,
            language: default_language().into(),
            thinking_enabled: true,
            reasoning_effort: "max".into(),
            max_tokens: 8192,
            context_window: 1_000_000,
            temperature: 0.2,
            preserve_reasoning: false,
            web_search_enabled: false,
            web_search_max_results: default_web_search_max_results(),
            appearance_mode: default_appearance_mode(),
            appearance_theme: default_appearance_theme(),
            accent_color: default_accent_color(),
            background_color: default_background_color(),
            foreground_color: default_foreground_color(),
            ui_font: default_ui_font(),
            code_font: default_code_font(),
            font_scale: default_font_scale(),
            ui_font_size: default_ui_font_size(),
            code_font_size: default_code_font_size(),
            density: default_density(),
            translucent_sidebar: false,
            contrast: default_contrast(),
            pointer_cursor: default_pointer_cursor(),
            permission_mode: default_permission_mode(),
            workspace_path: None,
            workspace_history: Vec::new(),
            sidebar_width: default_sidebar_width(),
            sidebar_collapsed: false,
            custom_provider: None,
        }
    }
}

fn default_web_search_max_results() -> u64 {
    5
}

fn default_appearance_mode() -> String {
    "dark".into()
}

fn default_appearance_theme() -> String {
    "deepx-default".into()
}

fn default_accent_color() -> String {
    "#0169cc".into()
}

fn default_background_color() -> String {
    "#111111".into()
}

fn default_foreground_color() -> String {
    "#FCFCFC".into()
}

fn default_ui_font() -> String {
    "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif".into()
}

fn default_code_font() -> String {
    "\"JetBrains Mono\", ui-monospace, \"SFMono-Regular\", \"SF Mono\", Menlo, Consolas, monospace".into()
}

fn default_font_scale() -> u64 {
    100
}

fn default_ui_font_size() -> u64 {
    14
}

fn default_code_font_size() -> u64 {
    12
}

fn default_density() -> String {
    "comfortable".into()
}

fn default_contrast() -> u64 {
    60
}

fn default_pointer_cursor() -> bool {
    true
}

fn default_permission_mode() -> String {
    "default".into()
}

fn default_language() -> String {
    "zh-CN".into()
}

fn default_sidebar_width() -> u64 {
    300
}

fn normalize_language(value: &str) -> &str {
    match value {
        "en-US" => "en-US",
        _ => "zh-CN",
    }
}

fn normalize_appearance_mode(value: &str) -> &str {
    match value {
        "light" => "light",
        "system" => "system",
        _ => "dark",
    }
}

fn normalize_theme(value: &str) -> String {
    let legacy_dark = ["cod", "ex"].concat();
    let legacy_light = format!("{legacy_dark}-light");
    if value == legacy_dark.as_str() {
        return "deepx-default".into();
    }
    if value == legacy_light.as_str() {
        return "deepx-light".into();
    }
    match value {
        "deepx-default" | "deepx-light" | "graphite" | "midnight" | "paper" => value.into(),
        _ => default_appearance_theme(),
    }
}

fn normalize_density(value: &str) -> &str {
    match value {
        "compact" => "compact",
        "spacious" => "spacious",
        _ => "comfortable",
    }
}

fn normalize_permission_mode(value: &str) -> &str {
    match value {
        "default" => "default",
        "auto-review" => "auto-review",
        "full-access" => "full-access",
        "custom" => "custom",
        _ => "default",
    }
}

fn normalize_non_empty(value: String, fallback: String) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback
    } else {
        trimmed.to_string()
    }
}

fn normalize_workspace_history(current: &Option<String>, history: &[String]) -> Vec<String> {
    let mut seen = BTreeMap::<String, ()>::new();
    let mut out = Vec::new();
    for raw in current
        .iter()
        .chain(history.iter())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        let key = raw.to_ascii_lowercase();
        if seen.insert(key, ()).is_none() {
            out.push(raw.to_string());
        }
        if out.len() >= 24 {
            break;
        }
    }
    out
}

fn normalize_hex_color(value: &str, fallback: String) -> String {
    let trimmed = value.trim();
    let Some(hex) = trimmed.strip_prefix('#') else {
        return fallback;
    };
    if hex.len() == 6 && hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
        format!("#{hex}")
    } else {
        fallback
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomProvider {
    display_name: String,
    base_url: String,
    model: String,
    auth_header_name: String,
    auth_scheme: String,
    supports_thinking: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Secrets {
    providers: BTreeMap<String, ProviderSecret>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderSecret {
    api_key: String,
    auth_header_name: Option<String>,
}

fn load_settings(root: &Path) -> Result<Settings> {
    let path = root.join("config").join("settings.json");
    if !path.exists() {
        let defaults = Settings::default();
        save_settings(root, &defaults)?;
        return Ok(defaults);
    }
    let raw =
        fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))?;
    let body = raw.trim_start_matches('\u{feff}');
    match serde_json::from_str::<Settings>(body) {
        Ok(mut settings) => {
            normalize_loaded_settings(&mut settings);
            if body.len() != raw.len() {
                save_settings(root, &settings)?;
            }
            Ok(settings)
        }
        Err(err) => {
            let backup = root.join("config").join(format!(
                "settings.invalid-{}.json",
                Utc::now().format("%Y%m%d%H%M%S")
            ));
            let _ = fs::write(&backup, raw);
            let defaults = Settings::default();
            save_settings(root, &defaults)?;
            let _ = err;
            Ok(defaults)
        }
    }
}

fn save_settings(root: &Path, settings: &Settings) -> Result<()> {
    let path = root.join("config").join("settings.json");
    write_json_pretty(&path, settings)
}

fn normalize_loaded_settings(settings: &mut Settings) {
    settings.language = normalize_language(&settings.language).to_string();
    settings.appearance_mode = normalize_appearance_mode(&settings.appearance_mode).to_string();
    settings.appearance_theme = normalize_theme(&settings.appearance_theme);
    settings.accent_color = normalize_hex_color(&settings.accent_color, default_accent_color());
    settings.background_color =
        normalize_hex_color(&settings.background_color, default_background_color());
    settings.foreground_color =
        normalize_hex_color(&settings.foreground_color, default_foreground_color());
    if settings.appearance_mode == "light"
        && settings
            .background_color
            .eq_ignore_ascii_case(&default_background_color())
        && settings
            .foreground_color
            .eq_ignore_ascii_case(&default_foreground_color())
    {
        settings.background_color = "#FFFFFF".into();
        settings.foreground_color = "#0D0D0D".into();
    }
    settings.ui_font = normalize_non_empty(settings.ui_font.clone(), default_ui_font());
    settings.code_font = normalize_non_empty(settings.code_font.clone(), default_code_font());
    settings.font_scale = settings.font_scale.clamp(90, 115);
    settings.ui_font_size = settings.ui_font_size.clamp(12, 18);
    settings.code_font_size = settings.code_font_size.clamp(10, 16);
    settings.density = normalize_density(&settings.density).to_string();
    settings.contrast = settings.contrast.clamp(35, 85);
    settings.permission_mode = normalize_permission_mode(&settings.permission_mode).to_string();
    settings.sidebar_width = settings.sidebar_width.clamp(220, 420);
    settings.context_window = settings.context_window.max(1024);
    settings.workspace_history =
        normalize_workspace_history(&settings.workspace_path, &settings.workspace_history);
}

fn load_secrets(root: &Path) -> Result<Secrets> {
    let path = root.join("secrets.local.json");
    if !path.exists() {
        return Ok(Secrets::default());
    }
    let raw =
        fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("failed to parse {}", path.display()))
}

fn save_secrets(root: &Path, secrets: &Secrets) -> Result<()> {
    let path = root.join("secrets.local.json");
    write_json_pretty(&path, secrets)
}

fn write_json_pretty<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    let body = serde_json::to_string_pretty(value)?;
    fs::write(&tmp, body)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

fn resolve_provider(settings: &Settings) -> Result<ProviderProfile, ApiError> {
    if settings.provider_id == "custom" {
        if let Some(custom) = &settings.custom_provider {
            let thinking = if custom.supports_thinking {
                thinking_effort(
                    &["low", "medium", "high"],
                    "high",
                    false,
                    "custom OpenAI-compatible reasoning_effort(low|medium|high)",
                )
            } else {
                thinking_none()
            };
            return Ok(ProviderProfile {
                id: "custom".into(),
                display_name: custom.display_name.clone(),
                base_url: custom.base_url.clone(),
                auth: AuthProfile {
                    header_name: custom.auth_header_name.clone(),
                    scheme: custom.auth_scheme.clone(),
                },
                default_model: custom.model.clone(),
                models: vec![with_thinking(
                    model(
                        &custom.model,
                        &custom.model,
                        settings.context_window,
                        settings.max_tokens,
                        price(0.0, 0.0, 0.0, "unknown"),
                    ),
                    thinking,
                )],
                context_window: settings.context_window,
                max_output_tokens: settings.max_tokens,
                supports_thinking: custom.supports_thinking,
                supports_tools: true,
                supports_streaming: true,
                usage_mapping: standard_usage_mapping(),
            });
        }
    }

    let mut provider = provider_profiles()
        .into_iter()
        .find(|p| p.id == settings.provider_id)
        .ok_or_else(|| ApiError::bad_request("unknown provider"))?;
    if let Some(base_url) = &settings.base_url {
        if !base_url.trim().is_empty() {
            provider.base_url = base_url.trim().to_string();
        }
    }
    Ok(provider)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveConfigRequest {
    provider_id: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    language: Option<String>,
    api_key: Option<String>,
    auth_header_name: Option<String>,
    thinking_enabled: Option<bool>,
    reasoning_effort: Option<String>,
    max_tokens: Option<u64>,
    context_window: Option<u64>,
    temperature: Option<f64>,
    preserve_reasoning: Option<bool>,
    web_search_enabled: Option<bool>,
    web_search_max_results: Option<u64>,
    appearance_mode: Option<String>,
    appearance_theme: Option<String>,
    accent_color: Option<String>,
    background_color: Option<String>,
    foreground_color: Option<String>,
    ui_font: Option<String>,
    code_font: Option<String>,
    font_scale: Option<u64>,
    ui_font_size: Option<u64>,
    code_font_size: Option<u64>,
    density: Option<String>,
    translucent_sidebar: Option<bool>,
    contrast: Option<u64>,
    pointer_cursor: Option<bool>,
    permission_mode: Option<String>,
    workspace_path: Option<String>,
    workspace_history: Option<Vec<String>>,
    sidebar_width: Option<u64>,
    sidebar_collapsed: Option<bool>,
    custom_provider: Option<CustomProvider>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestConnectionRequest {
    provider_id: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    api_key: Option<String>,
    auth_header_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebSearchRequest {
    query: String,
    max_results: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSearchResult {
    title: String,
    url: String,
    snippet: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    session_id: Option<String>,
    message: String,
    web_context: Option<String>,
    settings: Option<ChatSettingsOverride>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatSettingsOverride {
    provider_id: Option<String>,
    model: Option<String>,
    thinking_enabled: Option<bool>,
    reasoning_effort: Option<String>,
    max_tokens: Option<u64>,
    context_window: Option<u64>,
    temperature: Option<f64>,
    web_search_enabled: Option<bool>,
    web_search_max_results: Option<u64>,
    permission_mode: Option<String>,
}

struct PreparedChatTurn {
    path: PathBuf,
    session: Session,
    provider: ProviderProfile,
    settings: Settings,
    user_message: String,
    prefix_hash: String,
    prefix_changed: bool,
    prefix_change_reasons: Vec<String>,
    context_truncated: bool,
    context_truncated_messages: usize,
    checkpoint_id: Option<String>,
    call: ModelCall,
}

struct CompletedChatTurn {
    session_id: String,
    content: String,
    reasoning: Option<String>,
    usage: NormalizedUsage,
    metric: TurnMetric,
    prefix_hash: String,
    prefix_changed: bool,
    checkpoint_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    id: String,
    title: String,
    provider_id: String,
    model: String,
    #[serde(default)]
    workspace_path: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    prefix_hash: String,
    prefix_changed: bool,
    prefix_change_reasons: Vec<String>,
    messages: Vec<StoredMessage>,
    metrics: Vec<TurnMetric>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionSummary {
    id: String,
    title: String,
    provider_id: String,
    model: String,
    #[serde(default)]
    workspace_path: Option<String>,
    updated_at: DateTime<Utc>,
    message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredMessage {
    role: String,
    content: String,
    reasoning_content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    checkpoint_id: Option<String>,
    created_at: DateTime<Utc>,
}

impl StoredMessage {
    fn to_chat_message(&self, preserve_reasoning: bool) -> ChatMessage {
        ChatMessage {
            role: self.role.clone(),
            content: self.content.clone(),
            reasoning_content: if preserve_reasoning {
                self.reasoning_content.clone()
            } else {
                None
            },
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }
}

fn session_path(root: &Path, id: &str) -> Result<PathBuf, ApiError> {
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ApiError::bad_request("invalid session id"));
    }
    Ok(root.join("sessions").join(format!("{id}.json")))
}

fn read_session_file(path: &Path) -> Result<Session> {
    let raw =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("failed to parse {}", path.display()))
}

fn write_session_file(path: &Path, session: &Session) -> Result<()> {
    write_json_pretty(path, session)
}

fn new_session_id() -> String {
    format!(
        "s-{}-{}",
        Utc::now().format("%Y%m%d%H%M%S"),
        Uuid::new_v4().simple()
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TurnMetric {
    id: String,
    created_at: DateTime<Utc>,
    provider_id: String,
    model: String,
    cache_hit_tokens: u64,
    cache_miss_tokens: u64,
    hit_ratio: f64,
    prompt_tokens: u64,
    completion_tokens: u64,
    reasoning_tokens: u64,
    total_tokens: u64,
    estimated_cost: Option<EstimatedCost>,
    prefix_hash: String,
    prefix_changed: bool,
    prefix_change_reasons: Vec<String>,
    #[serde(default)]
    context_truncated: bool,
    #[serde(default)]
    context_truncated_messages: usize,
    #[serde(default)]
    context_window: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EstimatedCost {
    amount: f64,
    currency: String,
}

#[derive(Debug, Clone)]
struct ProjectInstructions {
    content: String,
    hash: String,
    files: Vec<String>,
}

fn write_metric_file(root: &Path, metric: &TurnMetric) -> Result<()> {
    let path = root
        .join("cache-metrics")
        .join(format!("{}.json", metric.id));
    write_json_pretty(&path, metric)
}

fn build_prefix(provider: &ProviderProfile, settings: &Settings) -> String {
    let mut facts = BTreeMap::new();
    let thinking = selected_thinking_profile(provider, &settings.model);
    let effective_effort =
        provider_reasoning_effort(&provider.id, &thinking, &settings.reasoning_effort);
    facts.insert("schemaVersion", json!(1));
    facts.insert("agent", json!("DeepX"));
    facts.insert("providerId", json!(provider.id));
    facts.insert("model", json!(settings.model));
    facts.insert("contextWindow", json!(settings.context_window));
    facts.insert(
        "thinkingEnabled",
        json!(settings.thinking_enabled && thinking.supported),
    );
    facts.insert("thinkingKind", json!(thinking.kind.clone()));
    facts.insert("reasoningEffort", json!(effective_effort));
    facts.insert(
        "thinkingBudgetTokens",
        json!(thinking
            .max_budget_tokens
            .map(|max| settings.max_tokens.min(max))),
    );
    facts.insert("supportsTools", json!(provider.supports_tools));
    facts.insert("supportsStreaming", json!(provider.supports_streaming));
    facts.insert("permissionMode", json!(settings.permission_mode));
    facts.insert("webSearchEnabled", json!(settings.web_search_enabled));
    facts.insert("webSearchProvider", json!("duckduckgo-instant-answer"));
    if let Some(project_instructions) = load_project_instructions(settings) {
        facts.insert("projectInstructionsHash", json!(project_instructions.hash));
        facts.insert("projectInstructionsFiles", json!(project_instructions.files));
        facts.insert("projectInstructions", json!(project_instructions.content));
    } else {
        facts.insert("projectInstructionsHash", Value::Null);
        facts.insert("projectInstructionsFiles", json!([]));
    }
    facts.insert("systemPrompt", json!(DEFAULT_SYSTEM_PROMPT));
    serde_json::to_string(&facts).unwrap_or_else(|_| DEFAULT_SYSTEM_PROMPT.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

impl ChatMessage {
    fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
            name: None,
        }
    }

    fn assistant_tool_calls(tool_calls: Value, reasoning_content: Option<String>) -> Self {
        Self {
            role: "assistant".into(),
            content: String::new(),
            reasoning_content,
            tool_calls: Some(tool_calls),
            tool_call_id: None,
            name: None,
        }
    }

    fn tool_result(id: String, name: String, content: String) -> Self {
        Self {
            role: "tool".into(),
            content,
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: Some(id),
            name: Some(name),
        }
    }
}

#[derive(Clone)]
struct ModelCall {
    provider: ProviderProfile,
    settings: Settings,
    secret: ProviderSecret,
    messages: Vec<ChatMessage>,
    stream: bool,
    tools_enabled: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NormalizedUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
    total_tokens: u64,
    cache_hit_tokens: u64,
    cache_miss_tokens: u64,
    reasoning_tokens: u64,
}

struct ModelResult {
    content: String,
    reasoning: Option<String>,
    usage: NormalizedUsage,
    tool_calls: Vec<ToolCallRequest>,
}

#[derive(Debug, Clone)]
struct ToolCallRequest {
    id: String,
    name: String,
    arguments: Value,
}

#[derive(Default)]
struct ParsedStreamDelta {
    content: String,
    reasoning: String,
    usage: Option<NormalizedUsage>,
}

async fn call_model(http: &reqwest::Client, call: ModelCall) -> Result<ModelResult, ApiError> {
    let url = chat_completions_url(&call.provider.base_url);
    let body = build_chat_body(&call);
    let headers = build_headers(&call.provider, &call.secret)?;

    let resp = http
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|err| ApiError::upstream(format!("provider request failed: {err}")))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(ApiError::upstream(format!(
            "provider returned {status}: {}",
            truncate(&text, 1200)
        )));
    }

    if call.stream && call.provider.supports_streaming {
        parse_sse_response(resp).await
    } else {
        let value: Value = resp
            .json()
            .await
            .map_err(|err| ApiError::upstream(format!("provider response decode failed: {err}")))?;
        Ok(parse_non_stream_response(&value))
    }
}

async fn stream_model_and_emit(
    http: &reqwest::Client,
    call: ModelCall,
    tx: &mpsc::Sender<Result<Event, Infallible>>,
) -> Result<ModelResult, ApiError> {
    if !call.provider.supports_streaming {
        let result = call_model(http, call).await?;
        if let Some(reasoning) = &result.reasoning {
            send_sse(tx, "reasoning.delta", json!({ "text": reasoning })).await;
        }
        if !result.content.is_empty() {
            send_sse(tx, "message.delta", json!({ "text": result.content })).await;
        }
        send_sse(tx, "usage", json!({ "usage": result.usage })).await;
        return Ok(result);
    }

    let url = chat_completions_url(&call.provider.base_url);
    let body = build_chat_body(&call);
    let headers = build_headers(&call.provider, &call.secret)?;
    let resp = http
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|err| ApiError::upstream(format!("provider request failed: {err}")))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(ApiError::upstream(format!(
            "provider returned {status}: {}",
            truncate(&text, 1200)
        )));
    }

    let mut stream = resp.bytes_stream();
    let mut pending = String::new();
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut usage = NormalizedUsage::default();

    while let Some(chunk) = stream.next().await {
        let bytes =
            chunk.map_err(|err| ApiError::upstream(format!("provider stream failed: {err}")))?;
        pending.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(idx) = pending.find('\n') {
            let line = pending[..idx].trim().to_string();
            pending = pending[idx + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }
            let data = line.trim_start_matches("data:").trim();
            if data == "[DONE]" {
                return Ok(ModelResult {
                    content,
                    reasoning: non_empty(reasoning),
                    usage,
                    tool_calls: Vec::new(),
                });
            }
            let value: Value = serde_json::from_str(data).map_err(|err| {
                ApiError::upstream(format!("provider stream JSON decode failed: {err}"))
            })?;
            let delta = parse_stream_delta(&value);
            if !delta.reasoning.is_empty() {
                reasoning.push_str(&delta.reasoning);
                send_sse(tx, "reasoning.delta", json!({ "text": delta.reasoning })).await;
            }
            if !delta.content.is_empty() {
                content.push_str(&delta.content);
                send_sse(tx, "message.delta", json!({ "text": delta.content })).await;
            }
            if let Some(u) = delta.usage {
                usage = u;
                send_sse(tx, "usage", json!({ "usage": usage })).await;
            }
        }
    }

    Ok(ModelResult {
        content,
        reasoning: non_empty(reasoning),
        usage,
        tool_calls: Vec::new(),
    })
}

async fn send_sse(tx: &mpsc::Sender<Result<Event, Infallible>>, event: &str, data: Value) {
    let body = serde_json::to_string(&data).unwrap_or_else(|_| "{}".to_string());
    let _ = tx.send(Ok(Event::default().event(event).data(body))).await;
}

fn chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn build_headers(
    provider: &ProviderProfile,
    secret: &ProviderSecret,
) -> Result<HeaderMap, ApiError> {
    if secret.api_key.trim().is_empty() {
        return Err(ApiError::bad_request(
            "missing API key for selected provider",
        ));
    }
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    let header_name = secret
        .auth_header_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(provider.auth.header_name.as_str());
    let name = HeaderName::from_bytes(header_name.as_bytes())
        .map_err(|_| ApiError::bad_request("invalid auth header name"))?;
    let value = if header_name.eq_ignore_ascii_case("authorization") {
        format!("{} {}", provider.auth.scheme, secret.api_key)
    } else {
        secret.api_key.clone()
    };
    headers.insert(
        if name == AUTHORIZATION {
            AUTHORIZATION
        } else {
            name
        },
        HeaderValue::from_str(&value)
            .map_err(|_| ApiError::bad_request("invalid API key/header value"))?,
    );
    Ok(headers)
}

fn selected_thinking_profile(provider: &ProviderProfile, model_id: &str) -> ThinkingProfile {
    provider
        .models
        .iter()
        .find(|model| model.id == model_id)
        .map(|model| model.thinking.clone())
        .unwrap_or_else(|| {
            if provider.supports_thinking {
                thinking_effort(
                    &["low", "medium", "high"],
                    "high",
                    false,
                    "fallback OpenAI-compatible reasoning_effort(low|medium|high)",
                )
            } else {
                thinking_none()
            }
        })
}

fn effective_thinking_enabled(call: &ModelCall, thinking: &ThinkingProfile) -> bool {
    call.settings.thinking_enabled && thinking.supported
}

fn provider_requires_tool_reasoning_history(provider: &ProviderProfile) -> bool {
    provider.id == "deepseek"
}

fn provider_reasoning_effort(
    provider_id: &str,
    thinking: &ThinkingProfile,
    effort: &str,
) -> String {
    if thinking.kind != "effort" {
        return thinking
            .default_effort
            .clone()
            .unwrap_or_else(|| "medium".into());
    }

    match provider_id {
        "deepseek" => normalize_deepseek_effort(effort, thinking),
        "mimo" | "stepfun" => normalize_openai_effort(effort, thinking),
        _ => normalize_openai_effort(effort, thinking),
    }
}

fn normalize_effort_for_profile(
    candidate: &str,
    thinking: &ThinkingProfile,
    fallback: &str,
) -> String {
    let normalized = candidate.trim().to_ascii_lowercase();
    if thinking
        .effort_values
        .iter()
        .any(|value| value == &normalized)
    {
        return normalized;
    }
    if let Some(default) = &thinking.default_effort {
        if thinking.effort_values.iter().any(|value| value == default) {
            return default.clone();
        }
    }
    if thinking.effort_values.iter().any(|value| value == fallback) {
        return fallback.into();
    }
    thinking
        .effort_values
        .first()
        .cloned()
        .unwrap_or_else(|| fallback.into())
}

fn build_chat_body(call: &ModelCall) -> Value {
    let mut body = Map::new();
    let thinking = selected_thinking_profile(&call.provider, &call.settings.model);
    let thinking_enabled = effective_thinking_enabled(call, &thinking);
    body.insert("model".into(), json!(call.settings.model));
    body.insert("messages".into(), json!(call.messages));
    body.insert(
        "stream".into(),
        json!(call.stream && call.provider.supports_streaming),
    );
    if call.stream && call.provider.supports_streaming {
        body.insert("stream_options".into(), json!({ "include_usage": true }));
    }
    let omit_temperature = call.provider.id == "deepseek" && thinking_enabled;
    if !omit_temperature {
        body.insert("temperature".into(), json!(call.settings.temperature));
    }
    body.insert("max_tokens".into(), json!(call.settings.max_tokens));
    if call.tools_enabled && call.provider.supports_tools && workspace_root(&call.settings).is_some() {
        body.insert("tools".into(), workspace_tool_definitions(&call.settings));
        body.insert("tool_choice".into(), json!("auto"));
    }

    match call.provider.id.as_str() {
        "deepseek" => {
            body.insert(
                "thinking".into(),
                json!({ "type": if thinking_enabled { "enabled" } else { "disabled" } }),
            );
            if thinking_enabled {
                body.insert(
                    "reasoning_effort".into(),
                    json!(provider_reasoning_effort(
                        "deepseek",
                        &thinking,
                        &call.settings.reasoning_effort
                    )),
                );
            }
        }
        "glm" => {
            body.insert(
                "thinking".into(),
                json!({
                    "type": if thinking_enabled { "enabled" } else { "disabled" },
                    "clear_thinking": !call.settings.preserve_reasoning
                }),
            );
        }
        "qwen" => {
            body.insert("enable_thinking".into(), json!(thinking_enabled));
            body.insert(
                "preserve_thinking".into(),
                json!(call.settings.preserve_reasoning),
            );
            if thinking_enabled {
                let max_budget = thinking.max_budget_tokens.unwrap_or(65_536);
                body.insert(
                    "thinking_budget".into(),
                    json!(call.settings.max_tokens.min(max_budget)),
                );
            }
        }
        "stepfun" => {
            if thinking_enabled {
                body.insert("reasoning_format".into(), json!("parsed"));
                body.insert(
                    "reasoning_effort".into(),
                    json!(provider_reasoning_effort(
                        "stepfun",
                        &thinking,
                        &call.settings.reasoning_effort
                    )),
                );
            }
        }
        "minimax" => {
            body.insert(
                "thinking".into(),
                json!({ "type": if thinking_enabled { "adaptive" } else { "disabled" } }),
            );
            body.insert("reasoning_split".into(), json!(true));
        }
        "mimo" => {
            if thinking_enabled {
                body.insert("thinking".into(), json!({ "type": "adaptive" }));
                body.insert(
                    "reasoning_effort".into(),
                    json!(provider_reasoning_effort(
                        "mimo",
                        &thinking,
                        &call.settings.reasoning_effort
                    )),
                );
            }
        }
        _ => {
            if thinking_enabled {
                body.insert(
                    "reasoning_effort".into(),
                    json!(provider_reasoning_effort(
                        &call.provider.id,
                        &thinking,
                        &call.settings.reasoning_effort
                    )),
                );
            }
        }
    }

    Value::Object(body)
}

fn normalize_deepseek_effort(effort: &str, thinking: &ThinkingProfile) -> String {
    let candidate = match effort.trim().to_ascii_lowercase().as_str() {
        "max" | "xhigh" => "max",
        _ => "high",
    };
    normalize_effort_for_profile(candidate, thinking, "high")
}

fn normalize_openai_effort(effort: &str, thinking: &ThinkingProfile) -> String {
    let candidate = match effort.trim().to_ascii_lowercase().as_str() {
        "low" => "low",
        "high" | "max" | "xhigh" => "high",
        _ => "medium",
    };
    normalize_effort_for_profile(candidate, thinking, "medium")
}

async fn parse_sse_response(resp: reqwest::Response) -> Result<ModelResult, ApiError> {
    let mut stream = resp.bytes_stream();
    let mut pending = String::new();
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut usage = NormalizedUsage::default();

    while let Some(chunk) = stream.next().await {
        let bytes =
            chunk.map_err(|err| ApiError::upstream(format!("provider stream failed: {err}")))?;
        pending.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(idx) = pending.find('\n') {
            let line = pending[..idx].trim().to_string();
            pending = pending[idx + 1..].to_string();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }
            let data = line.trim_start_matches("data:").trim();
            if data == "[DONE]" {
                return Ok(ModelResult {
                    content,
                    reasoning: non_empty(reasoning),
                    usage,
                    tool_calls: Vec::new(),
                });
            }
            let value: Value = serde_json::from_str(data).map_err(|err| {
                ApiError::upstream(format!("provider stream JSON decode failed: {err}"))
            })?;
            merge_stream_delta(&value, &mut content, &mut reasoning, &mut usage);
        }
    }

    Ok(ModelResult {
        content,
        reasoning: non_empty(reasoning),
        usage,
        tool_calls: Vec::new(),
    })
}

fn merge_stream_delta(
    value: &Value,
    content: &mut String,
    reasoning: &mut String,
    usage: &mut NormalizedUsage,
) {
    let delta = parse_stream_delta(value);
    if let Some(u) = delta.usage {
        *usage = u;
    }
    reasoning.push_str(&delta.reasoning);
    content.push_str(&delta.content);
}

fn parse_stream_delta(value: &Value) -> ParsedStreamDelta {
    let usage = value
        .get("usage")
        .filter(|u| !u.is_null())
        .map(normalize_usage);
    let mut parsed = ParsedStreamDelta {
        usage,
        ..ParsedStreamDelta::default()
    };
    let Some(delta) = value
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("delta"))
    else {
        return parsed;
    };
    if let Some(text) = delta.get("reasoning_content").and_then(Value::as_str) {
        parsed.reasoning.push_str(text);
    }
    if let Some(details) = delta.get("reasoning_details").and_then(Value::as_array) {
        for detail in details {
            if let Some(text) = detail.get("text").and_then(Value::as_str) {
                parsed.reasoning.push_str(text);
            }
        }
    }
    if let Some(text) = delta.get("content").and_then(Value::as_str) {
        let (r, c) = split_think_tags(text);
        parsed.reasoning.push_str(&r);
        parsed.content.push_str(&c);
    }
    parsed
}

fn parse_non_stream_response(value: &Value) -> ModelResult {
    let message = value
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("message"))
        .cloned()
        .unwrap_or(Value::Null);
    let raw_content = message.get("content").and_then(Value::as_str).unwrap_or("");
    let (tag_reasoning, content) = split_think_tags(raw_content);
    let mut reasoning = message
        .get("reasoning_content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    reasoning.push_str(&tag_reasoning);
    if let Some(details) = message.get("reasoning_details").and_then(Value::as_array) {
        for detail in details {
            if let Some(text) = detail.get("text").and_then(Value::as_str) {
                reasoning.push_str(text);
            }
        }
    }
    let usage = value.get("usage").map(normalize_usage).unwrap_or_default();
    let tool_calls = parse_tool_calls(&message);
    ModelResult {
        content,
        reasoning: non_empty(reasoning),
        usage,
        tool_calls,
    }
}

fn parse_tool_calls(message: &Value) -> Vec<ToolCallRequest> {
    let mut calls = Vec::new();
    let Some(items) = message.get("tool_calls").and_then(Value::as_array) else {
        return calls;
    };
    for item in items {
        let Some(function) = item.get("function") else {
            continue;
        };
        let Some(name) = function.get("name").and_then(Value::as_str) else {
            continue;
        };
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("call_{}", Uuid::new_v4().simple()));
        let raw_args = function.get("arguments").cloned().unwrap_or(Value::Null);
        let arguments = match raw_args {
            Value::String(s) => serde_json::from_str::<Value>(&s).unwrap_or_else(|_| json!({ "raw": s })),
            other => other,
        };
        calls.push(ToolCallRequest {
            id,
            name: name.to_string(),
            arguments,
        });
    }
    calls
}

async fn run_agent_turn(
    http: &reqwest::Client,
    mut call: ModelCall,
    data_root: &Path,
    session_id: &str,
    tx: Option<&mpsc::Sender<Result<Event, Infallible>>>,
) -> Result<ModelResult, ApiError> {
    if !call.tools_enabled || !call.provider.supports_tools || workspace_root(&call.settings).is_none() {
        return if let Some(tx) = tx {
            stream_model_and_emit(http, call, tx).await
        } else {
            call.stream = false;
            call_model(http, call).await
        };
    }

    let mut messages = call.messages.clone();
    let mut usage = NormalizedUsage::default();
    for round in 0..MAX_AGENT_TOOL_ROUNDS {
        let step_call = ModelCall {
            messages: messages.clone(),
            stream: false,
            tools_enabled: true,
            ..call.clone()
        };
        let mut result = call_model(http, step_call).await?;
        add_usage(&mut usage, &result.usage);
        if result.tool_calls.is_empty() {
            result.usage = usage;
            if let Some(tx) = tx {
                if let Some(reasoning) = &result.reasoning {
                    send_sse(tx, "reasoning.delta", json!({ "text": reasoning })).await;
                }
                if !result.content.is_empty() {
                    send_sse(tx, "message.delta", json!({ "text": result.content })).await;
                }
                send_sse(tx, "usage", json!({ "usage": result.usage })).await;
            }
            return Ok(result);
        }

        let tool_calls = result.tool_calls.clone();
        let tool_reasoning = if provider_requires_tool_reasoning_history(&call.provider) {
            result.reasoning.clone()
        } else {
            None
        };
        messages.push(ChatMessage::assistant_tool_calls(
            tool_calls_to_message_value(&tool_calls),
            tool_reasoning,
        ));
        for tool_call in tool_calls {
            if let Some(tx) = tx {
                send_sse(
                    tx,
                    "tool.start",
                    json!({
                        "id": tool_call.id,
                        "name": tool_call.name,
                        "round": round + 1,
                        "arguments": compact_tool_arguments(&tool_call.arguments)
                    }),
                )
                .await;
            }
            let output = execute_agent_tool(data_root, session_id, &call.settings, &tool_call).await;
            if let Some(tx) = tx {
                send_sse(
                    tx,
                    "tool.end",
                    json!({
                        "id": tool_call.id,
                        "name": tool_call.name,
                        "round": round + 1,
                        "ok": output.get("ok").and_then(Value::as_bool).unwrap_or(false),
                        "summary": output.get("summary").and_then(Value::as_str).unwrap_or(""),
                        "checkpointId": output.get("checkpointId").and_then(Value::as_str)
                    }),
                )
                .await;
            }
            let content = serialize_tool_output_for_model(&tool_call.name, &output);
            messages.push(ChatMessage::tool_result(tool_call.id, tool_call.name, content));
        }
        if round + 1 == MAX_AGENT_TOOL_ROUNDS {
            messages.push(ChatMessage::system("Tool round limit reached. Stop calling tools and provide the best final answer from the gathered evidence."));
        }
    }

    let final_call = ModelCall {
        messages,
        stream: tx.is_some(),
        tools_enabled: false,
        ..call
    };
    let mut final_result = if let Some(tx) = tx {
        stream_model_and_emit(http, final_call, tx).await?
    } else {
        call_model(http, final_call).await?
    };
    add_usage(&mut usage, &final_result.usage);
    final_result.usage = usage;
    Ok(final_result)
}

fn add_usage(total: &mut NormalizedUsage, item: &NormalizedUsage) {
    total.prompt_tokens += item.prompt_tokens;
    total.completion_tokens += item.completion_tokens;
    total.total_tokens += item.total_tokens;
    total.cache_hit_tokens += item.cache_hit_tokens;
    total.cache_miss_tokens += item.cache_miss_tokens;
    total.reasoning_tokens += item.reasoning_tokens;
}

fn tool_calls_to_message_value(calls: &[ToolCallRequest]) -> Value {
    Value::Array(
        calls
            .iter()
            .map(|call| {
                json!({
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": serde_json::to_string(&call.arguments).unwrap_or_else(|_| "{}".to_string())
                    }
                })
            })
            .collect(),
    )
}

fn compact_tool_arguments(value: &Value) -> Value {
    let text = serde_json::to_string(value).unwrap_or_default();
    if text.len() > 600 {
        json!({ "preview": truncate(&text, 600), "truncated": true })
    } else {
        value.clone()
    }
}

fn load_project_instructions(settings: &Settings) -> Option<ProjectInstructions> {
    let root = workspace_root(settings)?;
    let mut files = Vec::new();
    let mut sections = Vec::new();
    let mut total_bytes = 0usize;

    for candidate in project_instruction_candidates(&root) {
        let canonical = match fs::canonicalize(&candidate) {
            Ok(path) => path,
            Err(_) => continue,
        };
        if !canonical.starts_with(&root) || !canonical.is_file() {
            continue;
        }
        let relative = relative_path(&root, &canonical);
        let meta = fs::metadata(&canonical).ok()?;
        if meta.len() > MAX_PROJECT_INSTRUCTION_FILE_BYTES {
            files.push(relative.clone());
            sections.push(format!(
                "## {relative}\n<skipped: file exceeds {} bytes>",
                MAX_PROJECT_INSTRUCTION_FILE_BYTES
            ));
            continue;
        }
        let bytes = fs::read(&canonical).ok()?;
        if total_bytes + bytes.len() > MAX_PROJECT_INSTRUCTION_TOTAL_BYTES {
            sections.push(format!(
                "## {relative}\n<skipped: project instructions exceed {} bytes>",
                MAX_PROJECT_INSTRUCTION_TOTAL_BYTES
            ));
            break;
        }
        total_bytes += bytes.len();
        let text = String::from_utf8_lossy(&bytes).trim().to_string();
        if text.is_empty() {
            continue;
        }
        files.push(relative.clone());
        sections.push(format!("## {relative}\n{text}"));
    }

    if sections.is_empty() {
        return None;
    }
    let content = format!(
        "Project instructions loaded from workspace instruction files. Apply them to matching workspace paths unless they conflict with user instructions or DeepX safety rules. More deeply nested instruction files are more specific.\n\n{}",
        sections.join("\n\n")
    );
    let hash = sha256_hex(content.as_bytes());
    Some(ProjectInstructions {
        content,
        hash,
        files,
    })
}

fn project_instruction_candidates(root: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![
        root.join("AGENTS.override.md"),
        root.join("AGENTS.md"),
        root.join("CLAUDE.md"),
        root.join("CODEX.md"),
        root.join(".github").join("copilot-instructions.md"),
    ];
    for rules_dir in [root.join(".cursor").join("rules"), root.join(".windsurf").join("rules")] {
        let Ok(entries) = fs::read_dir(&rules_dir) else {
            continue;
        };
        let mut files: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|item| item.path()))
            .filter(|path| {
                path.is_file()
                    && path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
            })
            .collect();
        files.sort();
        candidates.extend(files);
    }
    let mut nested = Vec::new();
    collect_nested_project_instruction_candidates(root, root, 0, &mut nested);
    nested.sort();
    for candidate in nested {
        if candidates.len() >= MAX_PROJECT_INSTRUCTION_CANDIDATES {
            break;
        }
        if !candidates.iter().any(|existing| existing == &candidate) {
            candidates.push(candidate);
        }
    }
    candidates
}

fn collect_nested_project_instruction_candidates(
    root: &Path,
    dir: &Path,
    depth: usize,
    candidates: &mut Vec<PathBuf>,
) {
    if depth >= MAX_PROJECT_INSTRUCTION_SCAN_DEPTH
        || candidates.len() >= MAX_PROJECT_INSTRUCTION_CANDIDATES
    {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut dirs: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|item| item.path()))
        .filter(|path| path.is_dir())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map_or(true, |name| !should_skip_dir(name))
        })
        .collect();
    dirs.sort();
    for child in dirs {
        for file_name in ["AGENTS.override.md", "AGENTS.md", "CLAUDE.md", "CODEX.md"] {
            let candidate = child.join(file_name);
            if candidate.is_file() {
                candidates.push(candidate);
                if candidates.len() >= MAX_PROJECT_INSTRUCTION_CANDIDATES {
                    return;
                }
            }
        }
        if child.starts_with(root) {
            collect_nested_project_instruction_candidates(root, &child, depth + 1, candidates);
        }
    }
}

fn serialize_tool_output_for_model(tool_name: &str, output: &Value) -> String {
    let raw = serde_json::to_string(output)
        .unwrap_or_else(|_| "{\"ok\":false,\"error\":\"tool output serialization failed\"}".to_string());
    if raw.len() <= MAX_TOOL_RESULT_CHARS {
        return raw;
    }
    let summary = output
        .get("summary")
        .and_then(Value::as_str)
        .unwrap_or("tool output truncated");
    let compressed = json!({
        "ok": output.get("ok").and_then(Value::as_bool).unwrap_or(false),
        "tool": tool_name,
        "summary": summary,
        "truncated": true,
        "maxChars": MAX_TOOL_RESULT_CHARS,
        "preview": truncate(&raw, MAX_TOOL_RESULT_CHARS)
    });
    serde_json::to_string(&compressed)
        .unwrap_or_else(|_| "{\"ok\":false,\"error\":\"tool output truncation failed\"}".to_string())
}

fn workspace_tool_definitions(settings: &Settings) -> Value {
    let mut tools = vec![
        json!({
            "type": "function",
            "function": {
                "name": "workspace_tree",
                "description": "Show a bounded, gitignore-like workspace tree for orientation before choosing files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Workspace-relative directory path. Defaults to ." },
                        "depth": { "type": "integer", "minimum": 1, "maximum": 6, "default": 2 },
                        "maxEntries": { "type": "integer", "minimum": 1, "maximum": 400, "default": 160 }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": "List one workspace directory with entry type, size and relative paths.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Workspace-relative directory path. Defaults to ." },
                        "includeHidden": { "type": "boolean", "default": false },
                        "maxEntries": { "type": "integer", "minimum": 1, "maximum": 500, "default": 240 }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a UTF-8 text file inside the workspace with line ranges and size limits.",
                "parameters": {
                    "type": "object",
                    "required": ["path"],
                    "properties": {
                        "path": { "type": "string", "description": "Workspace-relative file path" },
                        "startLine": { "type": "integer", "minimum": 1, "default": 1 },
                        "limitLines": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 400 }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "file_info",
                "description": "Inspect metadata for a workspace path.",
                "parameters": {
                    "type": "object",
                    "required": ["path"],
                    "properties": { "path": { "type": "string" } }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search_files",
                "description": "Find workspace files/directories by relative path substring and optional extension.",
                "parameters": {
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": { "type": "string" },
                        "extension": { "type": "string", "description": "Optional extension without dot" },
                        "maxResults": { "type": "integer", "minimum": 1, "maximum": 200, "default": 80 }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "grep_workspace",
                "description": "Search text content in workspace files. Use this before reading many files.",
                "parameters": {
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": { "type": "string" },
                        "path": { "type": "string", "description": "Optional workspace-relative subdirectory" },
                        "caseSensitive": { "type": "boolean", "default": false },
                        "maxResults": { "type": "integer", "minimum": 1, "maximum": 200, "default": 80 }
                    }
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "git_status",
                "description": "Return git branch, porcelain status and diff stat for the current workspace.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
    ];

    if permission_allows_write(settings) {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace an exact text range in one workspace file. Only available in full access mode.",
                "parameters": {
                    "type": "object",
                    "required": ["path", "oldText", "newText"],
                    "properties": {
                        "path": { "type": "string" },
                        "oldText": { "type": "string" },
                        "newText": { "type": "string" },
                        "expectedReplacements": { "type": "integer", "minimum": 1, "maximum": 20, "default": 1 }
                    }
                }
            }
        }));
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Create or overwrite a UTF-8 text file inside the workspace. Only available in full access mode.",
                "parameters": {
                    "type": "object",
                    "required": ["path", "content"],
                    "properties": {
                        "path": { "type": "string" },
                        "content": { "type": "string" },
                        "createParents": { "type": "boolean", "default": true }
                    }
                }
            }
        }));
    }

    if settings.permission_mode == "full-access" {
        tools.push(json!({
            "type": "function",
            "function": {
                "name": "run_shell_command",
                "description": "Run a shell command in the workspace with timeout and captured output. Auto review allows read-only inspection commands; full access allows arbitrary commands.",
                "parameters": {
                    "type": "object",
                    "required": ["command"],
                    "properties": {
                        "command": { "type": "string" },
                        "cwd": { "type": "string", "description": "Optional workspace-relative working directory" },
                        "timeoutSeconds": { "type": "integer", "minimum": 1, "maximum": 120, "default": 30 },
                        "maxOutputChars": { "type": "integer", "minimum": 1000, "maximum": 100000, "default": 32000 }
                    }
                }
            }
        }));
    }

    Value::Array(tools)
}

async fn execute_agent_tool(data_root: &Path, session_id: &str, settings: &Settings, call: &ToolCallRequest) -> Value {
    let checkpoint_id = if tool_has_side_effect(&call.name) && permission_allows_write(settings) {
        create_workspace_checkpoint(data_root, settings, session_id).ok().flatten()
    } else {
        None
    };
    let result = match call.name.as_str() {
        "workspace_tree" => tool_workspace_tree(settings, &call.arguments),
        "list_directory" => tool_list_directory(settings, &call.arguments),
        "read_file" => tool_read_file(settings, &call.arguments),
        "file_info" => tool_file_info(settings, &call.arguments),
        "search_files" => tool_search_files(settings, &call.arguments),
        "grep_workspace" => tool_grep_workspace(settings, &call.arguments),
        "edit_file" => tool_edit_file(settings, &call.arguments),
        "write_file" => tool_write_file(settings, &call.arguments),
        "run_shell_command" => tool_run_shell_command(settings, &call.arguments).await,
        "git_status" => tool_git_status(settings).await,
        _ => Err(format!("unknown tool: {}", call.name)),
    };
    let mut value = match result {
        Ok(value) => value,
        Err(error) => json!({ "ok": false, "error": error, "summary": error }),
    };
    if let Some(checkpoint_id) = checkpoint_id {
        if let Some(object) = value.as_object_mut() {
            object.insert("checkpointId".into(), json!(checkpoint_id));
            object.insert("checkpointKind".into(), json!("before_tool"));
        }
    }
    value
}

fn tool_has_side_effect(name: &str) -> bool {
    matches!(name, "edit_file" | "write_file" | "run_shell_command")
}

fn build_workspace_turn_context(settings: &Settings) -> Option<String> {
    let root = workspace_root(settings)?;
    let tree = collect_workspace_tree(&root, &root, 2, MAX_WORKSPACE_TREE_ENTRIES).unwrap_or_else(|error| {
        vec![format!("<workspace tree unavailable: {error}>")]
    });
    let instruction_note = load_project_instructions(settings)
        .map(|instructions| {
            format!(
                "Project instructions loaded in stable context: {} (hash {}).",
                instructions.files.join(", "),
                truncate(&instructions.hash, 12)
            )
        })
        .unwrap_or_else(|| "No AGENTS.md project instructions were found.".to_string());
    Some(format!(
        "Current workspace is available to DeepX tools. Root: {}\nPermission mode: {}\n{}\nUse tools to inspect files instead of saying you cannot access the workspace. Default and auto-review permission modes expose only read-only tools; full-access exposes workspace write and shell tools. Top-level tree:\n{}",
        root.display(),
        settings.permission_mode,
        instruction_note,
        tree.join("\n")
    ))
}

fn workspace_root(settings: &Settings) -> Option<PathBuf> {
    let raw = settings.workspace_path.as_ref()?.trim();
    if raw.is_empty() {
        return None;
    }
    let path = PathBuf::from(raw);
    let canonical = fs::canonicalize(path).ok()?;
    if canonical.is_dir() {
        Some(canonical)
    } else {
        None
    }
}

fn resolve_existing_workspace_path(settings: &Settings, raw: &str) -> Result<(PathBuf, PathBuf), String> {
    let root = workspace_root(settings).ok_or_else(|| "no workspace selected".to_string())?;
    let candidate = path_candidate(&root, raw);
    let resolved = fs::canonicalize(&candidate).map_err(|err| format!("path not found: {err}"))?;
    ensure_under_workspace(&root, &resolved)?;
    Ok((root, resolved))
}

fn resolve_writable_workspace_path(settings: &Settings, raw: &str, create_parents: bool) -> Result<(PathBuf, PathBuf), String> {
    let root = workspace_root(settings).ok_or_else(|| "no workspace selected".to_string())?;
    let candidate = path_candidate(&root, raw);
    let candidate = lexical_normalize_path(&candidate);
    ensure_under_workspace_lexical(&root, &candidate)?;
    let parent = candidate.parent().ok_or_else(|| "invalid target path".to_string())?;
    ensure_under_workspace_lexical(&root, parent)?;
    if create_parents {
        let existing = nearest_existing_ancestor(parent)
            .ok_or_else(|| "no existing ancestor for target path".to_string())?;
        let existing = fs::canonicalize(existing).map_err(|err| format!("ancestor path unavailable: {err}"))?;
        ensure_under_workspace(&root, &existing)?;
        fs::create_dir_all(parent).map_err(|err| format!("failed to create parent directories: {err}"))?;
    }
    let parent = fs::canonicalize(parent).map_err(|err| format!("parent path not found: {err}"))?;
    ensure_under_workspace(&root, &parent)?;
    let file_name = candidate.file_name().ok_or_else(|| "invalid target file name".to_string())?;
    Ok((root, parent.join(file_name)))
}

fn path_candidate(root: &Path, raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "." {
        return root.to_path_buf();
    }
    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        path
    } else {
        root.join(path)
    }
}

fn lexical_normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

fn ensure_under_workspace_lexical(root: &Path, path: &Path) -> Result<(), String> {
    let normalized_root = lexical_normalize_path(root);
    let normalized_path = lexical_normalize_path(path);
    if normalized_path.starts_with(&normalized_root) {
        Ok(())
    } else {
        Err("path escapes workspace sandbox".into())
    }
}

fn nearest_existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut current = path;
    loop {
        if current.exists() {
            return Some(current.to_path_buf());
        }
        current = current.parent()?;
    }
}

fn ensure_under_workspace(root: &Path, path: &Path) -> Result<(), String> {
    let canonical_root = fs::canonicalize(root).map_err(|err| format!("workspace unavailable: {err}"))?;
    if path.starts_with(&canonical_root) {
        Ok(())
    } else {
        Err("path escapes workspace sandbox".into())
    }
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn arg_str<'a>(args: &'a Value, key: &str, default: &'a str) -> &'a str {
    args.get(key).and_then(Value::as_str).unwrap_or(default)
}

fn arg_bool(args: &Value, key: &str, default: bool) -> bool {
    args.get(key).and_then(Value::as_bool).unwrap_or(default)
}

fn arg_usize(args: &Value, key: &str, default: usize, min: usize, max: usize) -> usize {
    args.get(key)
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(default)
        .clamp(min, max)
}

fn permission_allows_write(settings: &Settings) -> bool {
    settings.permission_mode == "full-access"
}

fn permission_allows_shell(settings: &Settings, _command: &str) -> bool {
    match settings.permission_mode.as_str() {
        "full-access" => true,
        _ => false,
    }
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | "build" | ".next" | ".cache" | "coverage" | "vendor" | ".venv" | "__pycache__"
    )
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn collect_workspace_tree(root: &Path, dir: &Path, depth: usize, max_entries: usize) -> Result<Vec<String>, String> {
    let mut lines = Vec::new();
    collect_workspace_tree_inner(root, dir, depth, max_entries, 0, &mut lines)?;
    Ok(lines)
}

fn collect_workspace_tree_inner(
    root: &Path,
    dir: &Path,
    depth: usize,
    max_entries: usize,
    level: usize,
    lines: &mut Vec<String>,
) -> Result<(), String> {
    if lines.len() >= max_entries || level > depth {
        return Ok(());
    }
    let mut entries = sorted_entries(dir)?;
    entries.sort_by_key(|entry| {
        let is_file = entry.file_type().map(|t| t.is_file()).unwrap_or(false);
        (is_file, entry.file_name().to_string_lossy().to_ascii_lowercase())
    });
    for entry in entries {
        if lines.len() >= max_entries {
            lines.push("... truncated".into());
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let ty = entry.file_type().map_err(|err| err.to_string())?;
        if ty.is_dir() && should_skip_dir(&name) {
            continue;
        }
        let path = entry.path();
        let suffix = if ty.is_dir() { "/" } else { "" };
        lines.push(format!("{}{}{}", "  ".repeat(level), relative_path(root, &path), suffix));
        if ty.is_dir() && level + 1 < depth {
            collect_workspace_tree_inner(root, &path, depth, max_entries, level + 1, lines)?;
        }
    }
    Ok(())
}

fn sorted_entries(dir: &Path) -> Result<Vec<fs::DirEntry>, String> {
    let mut entries = fs::read_dir(dir)
        .map_err(|err| format!("failed to read directory {}: {err}", dir.display()))?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_ascii_lowercase());
    Ok(entries)
}

fn tool_workspace_tree(settings: &Settings, args: &Value) -> Result<Value, String> {
    let (root, dir) = resolve_existing_workspace_path(settings, arg_str(args, "path", "."))?;
    if !dir.is_dir() {
        return Err("path is not a directory".into());
    }
    let depth = arg_usize(args, "depth", 2, 1, 6);
    let max_entries = arg_usize(args, "maxEntries", MAX_WORKSPACE_TREE_ENTRIES, 1, 400);
    let tree = collect_workspace_tree(&root, &dir, depth, max_entries)?;
    Ok(json!({ "ok": true, "summary": format!("{} tree entries", tree.len()), "root": root, "path": relative_path(&root, &dir), "tree": tree }))
}

fn tool_list_directory(settings: &Settings, args: &Value) -> Result<Value, String> {
    let (root, dir) = resolve_existing_workspace_path(settings, arg_str(args, "path", "."))?;
    if !dir.is_dir() {
        return Err("path is not a directory".into());
    }
    let include_hidden = arg_bool(args, "includeHidden", false);
    let max_entries = arg_usize(args, "maxEntries", MAX_WORKSPACE_LIST_ENTRIES, 1, 500);
    let mut out = Vec::new();
    for entry in sorted_entries(&dir)? {
        if out.len() >= max_entries {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !include_hidden && is_hidden_name(&name) {
            continue;
        }
        let path = entry.path();
        let meta = entry.metadata().map_err(|err| err.to_string())?;
        out.push(json!({
            "name": name,
            "path": relative_path(&root, &path),
            "type": if meta.is_dir() { "directory" } else if meta.is_file() { "file" } else { "other" },
            "size": meta.len()
        }));
    }
    Ok(json!({ "ok": true, "summary": format!("{} entries", out.len()), "entries": out }))
}

fn tool_read_file(settings: &Settings, args: &Value) -> Result<Value, String> {
    let (root, path) = resolve_existing_workspace_path(settings, arg_str(args, "path", ""))?;
    let meta = fs::metadata(&path).map_err(|err| err.to_string())?;
    if !meta.is_file() {
        return Err("path is not a file".into());
    }
    if meta.len() > MAX_WORKSPACE_READ_BYTES {
        return Err(format!("file too large: {} bytes", meta.len()));
    }
    let content = fs::read_to_string(&path).map_err(|err| format!("failed to read UTF-8 file: {err}"))?;
    let start = arg_usize(args, "startLine", 1, 1, usize::MAX);
    let limit = arg_usize(args, "limitLines", 400, 1, 1000);
    let lines = content
        .lines()
        .enumerate()
        .skip(start.saturating_sub(1))
        .take(limit)
        .map(|(idx, line)| format!("{:>5}| {}", idx + 1, line))
        .collect::<Vec<_>>();
    let total_lines = content.lines().count();
    let truncated = start.saturating_sub(1) + lines.len() < total_lines;
    Ok(json!({
        "ok": true,
        "summary": format!("read {} lines from {}", lines.len(), relative_path(&root, &path)),
        "path": relative_path(&root, &path),
        "size": meta.len(),
        "startLine": start,
        "lineCount": lines.len(),
        "totalLines": total_lines,
        "truncated": truncated,
        "content": lines.join("\n")
    }))
}

fn tool_file_info(settings: &Settings, args: &Value) -> Result<Value, String> {
    let (root, path) = resolve_existing_workspace_path(settings, arg_str(args, "path", ""))?;
    let meta = fs::metadata(&path).map_err(|err| err.to_string())?;
    Ok(json!({
        "ok": true,
        "summary": relative_path(&root, &path),
        "path": relative_path(&root, &path),
        "type": if meta.is_dir() { "directory" } else if meta.is_file() { "file" } else { "other" },
        "size": meta.len(),
        "readonly": meta.permissions().readonly()
    }))
}

fn tool_search_files(settings: &Settings, args: &Value) -> Result<Value, String> {
    let root = workspace_root(settings).ok_or_else(|| "no workspace selected".to_string())?;
    let query = arg_str(args, "query", "").trim().to_ascii_lowercase();
    if query.is_empty() {
        return Err("query is required".into());
    }
    let extension = args.get("extension").and_then(Value::as_str).map(|s| s.trim().trim_start_matches('.').to_ascii_lowercase()).filter(|s| !s.is_empty());
    let max_results = arg_usize(args, "maxResults", MAX_WORKSPACE_SEARCH_RESULTS, 1, 200);
    let mut results = Vec::new();
    let mut visited = 0usize;
    walk_workspace(&root, &root, &mut visited, &mut |path, meta| {
        if results.len() >= max_results {
            return;
        }
        let rel = relative_path(&root, path);
        if let Some(ext) = &extension {
            if path.extension().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()) != Some(ext.clone()) {
                return;
            }
        }
        if rel.to_ascii_lowercase().contains(&query) {
            results.push(json!({ "path": rel, "type": if meta.is_dir() { "directory" } else { "file" }, "size": meta.len() }));
        }
    })?;
    Ok(json!({ "ok": true, "summary": format!("{} matches", results.len()), "results": results, "visited": visited }))
}

fn tool_grep_workspace(settings: &Settings, args: &Value) -> Result<Value, String> {
    let (root, start) = resolve_existing_workspace_path(settings, arg_str(args, "path", "."))?;
    let query = arg_str(args, "query", "");
    if query.trim().is_empty() {
        return Err("query is required".into());
    }
    let case_sensitive = arg_bool(args, "caseSensitive", false);
    let needle = if case_sensitive { query.to_string() } else { query.to_ascii_lowercase() };
    let max_results = arg_usize(args, "maxResults", MAX_WORKSPACE_SEARCH_RESULTS, 1, 200);
    let mut results = Vec::new();
    let mut visited = 0usize;
    walk_workspace(&root, &start, &mut visited, &mut |path, meta| {
        if results.len() >= max_results || !meta.is_file() || meta.len() > MAX_WORKSPACE_GREP_FILE_BYTES {
            return;
        }
        let Ok(content) = fs::read_to_string(path) else {
            return;
        };
        for (idx, line) in content.lines().enumerate() {
            let haystack = if case_sensitive { line.to_string() } else { line.to_ascii_lowercase() };
            if haystack.contains(&needle) {
                results.push(json!({ "path": relative_path(&root, path), "line": idx + 1, "text": truncate(line, 500) }));
                if results.len() >= max_results {
                    break;
                }
            }
        }
    })?;
    Ok(json!({ "ok": true, "summary": format!("{} matches", results.len()), "results": results, "visited": visited }))
}

fn walk_workspace<F>(root: &Path, dir: &Path, visited: &mut usize, f: &mut F) -> Result<(), String>
where
    F: FnMut(&Path, &fs::Metadata),
{
    if *visited >= MAX_WORKSPACE_VISITED_ENTRIES {
        return Ok(());
    }
    for entry in sorted_entries(dir)? {
        if *visited >= MAX_WORKSPACE_VISITED_ENTRIES {
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let meta = entry.metadata().map_err(|err| err.to_string())?;
        *visited += 1;
        if meta.is_dir() && should_skip_dir(&name) {
            continue;
        }
        ensure_under_workspace(root, &fs::canonicalize(&path).map_err(|err| err.to_string())?)?;
        f(&path, &meta);
        if meta.is_dir() {
            walk_workspace(root, &path, visited, f)?;
        }
    }
    Ok(())
}

fn tool_edit_file(settings: &Settings, args: &Value) -> Result<Value, String> {
    if !permission_allows_write(settings) {
        return Err("current permission mode does not allow workspace writes".into());
    }
    let (root, path) = resolve_existing_workspace_path(settings, arg_str(args, "path", ""))?;
    let old_text = arg_str(args, "oldText", "");
    let new_text = arg_str(args, "newText", "");
    let expected = arg_usize(args, "expectedReplacements", 1, 1, 20);
    if old_text.is_empty() {
        return Err("oldText is required".into());
    }
    if new_text.len() > MAX_WORKSPACE_WRITE_BYTES {
        return Err("newText too large".into());
    }
    let content = fs::read_to_string(&path).map_err(|err| format!("failed to read file: {err}"))?;
    let count = content.matches(old_text).count();
    if count != expected {
        return Err(format!("expected {expected} replacements, found {count}"));
    }
    let updated = content.replace(old_text, new_text);
    fs::write(&path, updated).map_err(|err| format!("failed to write file: {err}"))?;
    Ok(json!({ "ok": true, "summary": format!("edited {}", relative_path(&root, &path)), "path": relative_path(&root, &path), "replacements": count }))
}

fn tool_write_file(settings: &Settings, args: &Value) -> Result<Value, String> {
    if !permission_allows_write(settings) {
        return Err("current permission mode does not allow workspace writes".into());
    }
    let content = arg_str(args, "content", "");
    if content.len() > MAX_WORKSPACE_WRITE_BYTES {
        return Err("content too large".into());
    }
    let create_parents = arg_bool(args, "createParents", true);
    let (root, path) = resolve_writable_workspace_path(settings, arg_str(args, "path", ""), create_parents)?;
    fs::write(&path, content).map_err(|err| format!("failed to write file: {err}"))?;
    Ok(json!({ "ok": true, "summary": format!("wrote {}", relative_path(&root, &path)), "path": relative_path(&root, &path), "bytes": content.len() }))
}

async fn tool_run_shell_command(settings: &Settings, args: &Value) -> Result<Value, String> {
    let command = arg_str(args, "command", "").trim();
    if command.is_empty() {
        return Err("command is required".into());
    }
    if !permission_allows_shell(settings, command) {
        return Err("current permission mode does not allow this shell command".into());
    }
    let (root, cwd) = resolve_existing_workspace_path(settings, arg_str(args, "cwd", "."))?;
    if !cwd.is_dir() {
        return Err("cwd is not a directory".into());
    }
    let timeout_seconds = arg_usize(args, "timeoutSeconds", DEFAULT_SHELL_TIMEOUT_SECONDS as usize, 1, 120) as u64;
    let max_output = arg_usize(args, "maxOutputChars", MAX_SHELL_OUTPUT_CHARS, 1000, 100000);
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("powershell.exe");
        c.args(["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
        c
    } else {
        let mut c = Command::new("/bin/sh");
        c.args(["-lc", command]);
        c
    };
    cmd.current_dir(&cwd);
    let output = timeout(Duration::from_secs(timeout_seconds), cmd.output())
        .await
        .map_err(|_| format!("command timed out after {timeout_seconds}s"))?
        .map_err(|err| format!("failed to run command: {err}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok(json!({
        "ok": output.status.success(),
        "summary": format!("exit {}", output.status.code().unwrap_or(-1)),
        "cwd": relative_path(&root, &cwd),
        "exitCode": output.status.code(),
        "stdout": truncate(&stdout, max_output),
        "stderr": truncate(&stderr, max_output),
        "stdoutTruncated": stdout.len() > max_output,
        "stderrTruncated": stderr.len() > max_output
    }))
}

async fn tool_git_status(settings: &Settings) -> Result<Value, String> {
    let root = workspace_root(settings).ok_or_else(|| "no workspace selected".to_string())?;
    let branch = run_program(&root, "git", &["branch", "--show-current"], 10).await.unwrap_or_default();
    let status = run_program(&root, "git", &["status", "--short", "--branch"], 10).await?;
    let diff_stat = run_program(&root, "git", &["diff", "--stat"], 10).await.unwrap_or_default();
    Ok(json!({
        "ok": true,
        "summary": "git status",
        "branch": branch.trim(),
        "status": status,
        "diffStat": diff_stat
    }))
}

async fn run_program(cwd: &Path, program: &str, args: &[&str], timeout_seconds: u64) -> Result<String, String> {
    let output = timeout(
        Duration::from_secs(timeout_seconds),
        Command::new(program).args(args).current_dir(cwd).output(),
    )
    .await
    .map_err(|_| format!("{program} timed out"))?
    .map_err(|err| format!("failed to run {program}: {err}"))?;
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.status.success() {
        text.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    Ok(truncate(&text, MAX_SHELL_OUTPUT_CHARS))
}
fn split_think_tags(text: &str) -> (String, String) {
    let mut reasoning = String::new();
    let mut visible = String::new();
    let mut rest = text;
    loop {
        let Some(start) = rest.find("<think>") else {
            visible.push_str(rest);
            break;
        };
        visible.push_str(&rest[..start]);
        let after = &rest[start + "<think>".len()..];
        if let Some(end) = after.find("</think>") {
            reasoning.push_str(&after[..end]);
            rest = &after[end + "</think>".len()..];
        } else {
            reasoning.push_str(after);
            break;
        }
    }
    (reasoning, visible)
}

fn normalize_usage(u: &Value) -> NormalizedUsage {
    let prompt = get_u64(u, "prompt_tokens");
    let completion = get_u64(u, "completion_tokens");
    let total = get_u64(u, "total_tokens").max(prompt + completion);
    let mut hit = get_u64(u, "prompt_cache_hit_tokens");
    if hit == 0 {
        hit = u
            .get("prompt_tokens_details")
            .and_then(|d| d.get("cached_tokens"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
    }
    let mut miss = get_u64(u, "prompt_cache_miss_tokens");
    if miss == 0 && prompt > hit {
        miss = prompt - hit;
    }
    let reasoning = u
        .get("completion_tokens_details")
        .and_then(|d| d.get("reasoning_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0);

    NormalizedUsage {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: total,
        cache_hit_tokens: hit,
        cache_miss_tokens: miss,
        reasoning_tokens: reasoning,
    }
}

fn extract_duckduckgo_results(value: &Value, max_results: usize) -> Vec<WebSearchResult> {
    let mut results = Vec::new();
    let abstract_text = value
        .get("AbstractText")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let abstract_url = value
        .get("AbstractURL")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let heading = value
        .get("Heading")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !abstract_text.is_empty() && !abstract_url.is_empty() {
        results.push(WebSearchResult {
            title: if heading.is_empty() {
                "DuckDuckGo result".into()
            } else {
                heading.into()
            },
            url: abstract_url.into(),
            snippet: abstract_text.into(),
        });
    }

    if let Some(topics) = value.get("RelatedTopics").and_then(Value::as_array) {
        collect_duckduckgo_topics(topics, max_results, &mut results);
    }
    results.truncate(max_results);
    results
}

fn collect_duckduckgo_topics(
    topics: &[Value],
    max_results: usize,
    results: &mut Vec<WebSearchResult>,
) {
    for item in topics {
        if results.len() >= max_results {
            return;
        }
        if let Some(nested) = item.get("Topics").and_then(Value::as_array) {
            collect_duckduckgo_topics(nested, max_results, results);
            continue;
        }
        let text = item
            .get("Text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let url = item
            .get("FirstURL")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if text.is_empty() || url.is_empty() || results.iter().any(|result| result.url == url) {
            continue;
        }
        let title = text
            .split(" - ")
            .next()
            .filter(|title| !title.trim().is_empty())
            .unwrap_or("DuckDuckGo result")
            .trim()
            .to_string();
        results.push(WebSearchResult {
            title,
            url: url.into(),
            snippet: text.into(),
        });
    }
}

fn get_u64(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCheckpointManifest {
    id: String,
    session_id: String,
    workspace_path: String,
    created_at: DateTime<Utc>,
    files: Vec<WorkspaceCheckpointFile>,
    truncated: bool,
    total_bytes: u64,
    stored_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCheckpointFile {
    path: String,
    size: u64,
    sha256: String,
    stored: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckpointRestoreSummary {
    checkpoint_id: String,
    restored_files: usize,
    deleted_files: usize,
    skipped_files: usize,
    workspace_path: String,
}

fn create_workspace_checkpoint(
    data_root: &Path,
    settings: &Settings,
    session_id: &str,
) -> Result<Option<String>> {
    let Some(workspace) = workspace_root(settings) else {
        return Ok(None);
    };
    let checkpoint_id = format!("c-{}-{}", Utc::now().format("%Y%m%d%H%M%S"), Uuid::new_v4().simple());
    let checkpoint_dir = checkpoint_path(data_root, session_id, &checkpoint_id)
        .map_err(|err| anyhow!(err.message))?;
    let files_dir = checkpoint_dir.join("files");
    fs::create_dir_all(&files_dir)?;
    let mut files = Vec::new();
    let mut total_bytes = 0u64;
    let mut stored_bytes = 0u64;
    let mut truncated = false;
    collect_checkpoint_files(
        &workspace,
        &workspace,
        &files_dir,
        &mut files,
        &mut total_bytes,
        &mut stored_bytes,
        &mut truncated,
    )?;
    let manifest = WorkspaceCheckpointManifest {
        id: checkpoint_id.clone(),
        session_id: session_id.to_string(),
        workspace_path: workspace.to_string_lossy().to_string(),
        created_at: Utc::now(),
        files,
        truncated,
        total_bytes,
        stored_bytes,
    };
    write_json_pretty(&checkpoint_dir.join("manifest.json"), &manifest)?;
    Ok(Some(checkpoint_id))
}

fn restore_workspace_checkpoint(
    data_root: &Path,
    session_id: &str,
    checkpoint_id: &str,
) -> Result<CheckpointRestoreSummary, ApiError> {
    let checkpoint_dir = checkpoint_path(data_root, session_id, checkpoint_id)?;
    let manifest_path = checkpoint_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(ApiError::bad_request("checkpoint not found"));
    }
    let raw = fs::read_to_string(&manifest_path).map_err(ApiError::internal)?;
    let manifest: WorkspaceCheckpointManifest = serde_json::from_str(&raw).map_err(ApiError::internal)?;
    if manifest.session_id != session_id || manifest.id != checkpoint_id {
        return Err(ApiError::bad_request("checkpoint metadata mismatch"));
    }
    let workspace = fs::canonicalize(&manifest.workspace_path).map_err(ApiError::internal)?;
    let mut known = BTreeMap::new();
    for file in &manifest.files {
        known.insert(file.path.clone(), file.clone());
    }
    let mut restored_files = 0usize;
    let mut skipped_files = 0usize;
    let files_dir = checkpoint_dir.join("files");
    for file in &manifest.files {
        if !file.stored {
            skipped_files += 1;
            continue;
        }
        let source = files_dir.join(PathBuf::from(&file.path));
        let target = workspace.join(PathBuf::from(&file.path));
        ensure_under_workspace(&workspace, &target).map_err(ApiError::bad_request)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(ApiError::internal)?;
        }
        if target.is_dir() {
            skipped_files += 1;
            continue;
        }
        fs::copy(&source, &target).map_err(ApiError::internal)?;
        restored_files += 1;
    }
    let mut deleted_files = 0usize;
    if !manifest.truncated {
        let mut current = Vec::new();
        collect_workspace_file_paths(&workspace, &workspace, &mut current).map_err(ApiError::internal)?;
        for path in current {
            let rel = relative_path(&workspace, &path);
            if known.contains_key(&rel) {
                continue;
            }
            let Ok(meta) = fs::metadata(&path) else {
                continue;
            };
            if meta.is_file() && meta.len() <= MAX_CHECKPOINT_FILE_BYTES {
                fs::remove_file(&path).map_err(ApiError::internal)?;
                deleted_files += 1;
            }
        }
    }
    Ok(CheckpointRestoreSummary {
        checkpoint_id: checkpoint_id.to_string(),
        restored_files,
        deleted_files,
        skipped_files,
        workspace_path: workspace.to_string_lossy().to_string(),
    })
}

fn collect_checkpoint_files(
    root: &Path,
    dir: &Path,
    files_dir: &Path,
    files: &mut Vec<WorkspaceCheckpointFile>,
    total_bytes: &mut u64,
    stored_bytes: &mut u64,
    truncated: &mut bool,
) -> Result<()> {
    if files.len() >= MAX_CHECKPOINT_FILES {
        *truncated = true;
        return Ok(());
    }
    for entry in sorted_entries(dir).map_err(anyhow::Error::msg)? {
        if files.len() >= MAX_CHECKPOINT_FILES {
            *truncated = true;
            break;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let meta = entry.metadata()?;
        if meta.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            collect_checkpoint_files(root, &path, files_dir, files, total_bytes, stored_bytes, truncated)?;
            continue;
        }
        if !meta.is_file() {
            continue;
        }
        ensure_under_workspace(root, &fs::canonicalize(&path)?).map_err(anyhow::Error::msg)?;
        let rel = relative_path(root, &path);
        *total_bytes += meta.len();
        let can_store = meta.len() <= MAX_CHECKPOINT_FILE_BYTES
            && stored_bytes.saturating_add(meta.len()) <= MAX_CHECKPOINT_TOTAL_BYTES;
        if can_store {
            let bytes = fs::read(&path)?;
            let target = files_dir.join(PathBuf::from(&rel));
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&target, &bytes)?;
            *stored_bytes += meta.len();
            files.push(WorkspaceCheckpointFile {
                path: rel,
                size: meta.len(),
                sha256: sha256_hex(&bytes),
                stored: true,
            });
        } else {
            files.push(WorkspaceCheckpointFile {
                path: rel,
                size: meta.len(),
                sha256: String::new(),
                stored: false,
            });
        }
    }
    Ok(())
}

fn collect_workspace_file_paths(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in sorted_entries(dir).map_err(anyhow::Error::msg)? {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let meta = entry.metadata()?;
        if meta.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            collect_workspace_file_paths(root, &path, out)?;
        } else if meta.is_file() {
            ensure_under_workspace(root, &fs::canonicalize(&path)?).map_err(anyhow::Error::msg)?;
            out.push(path);
        }
    }
    Ok(())
}

fn checkpoint_path(data_root: &Path, session_id: &str, checkpoint_id: &str) -> Result<PathBuf, ApiError> {
    validate_storage_id(session_id, "session")?;
    validate_storage_id(checkpoint_id, "checkpoint")?;
    Ok(data_root.join("checkpoints").join(session_id).join(checkpoint_id))
}

fn validate_storage_id(value: &str, label: &str) -> Result<(), ApiError> {
    if value.is_empty()
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ApiError::bad_request(format!("invalid {label} id")));
    }
    Ok(())
}

fn non_empty(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn non_empty_str(value: &str) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value.trim().to_string())
    }
}

fn estimate_cost(
    provider: &ProviderProfile,
    model_id: &str,
    usage: &NormalizedUsage,
) -> Option<EstimatedCost> {
    let model = provider.models.iter().find(|m| m.id == model_id)?;
    if model.price.currency == "unknown" {
        return None;
    }
    let amount = usage.cache_hit_tokens as f64 / 1_000_000.0 * model.price.cache_hit_per_m
        + usage.cache_miss_tokens as f64 / 1_000_000.0 * model.price.cache_miss_per_m
        + usage.completion_tokens as f64 / 1_000_000.0 * model.price.output_per_m;
    Some(EstimatedCost {
        amount,
        currency: model.price.currency.clone(),
    })
}

fn truncate(value: &str, max: usize) -> String {
    if max == 0 {
        return String::new();
    }
    if value.len() <= max {
        value.to_string()
    } else {
        let end = value
            .char_indices()
            .map(|(idx, _)| idx)
            .take_while(|idx| *idx <= max)
            .last()
            .unwrap_or(0);
        format!("{}...", &value[..end])
    }
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    fn upstream(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_GATEWAY,
            message: message.into(),
        }
    }

    fn internal(err: impl std::fmt::Display) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            message: err.to_string(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(json!({
                "ok": false,
                "error": self.message
            })),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_loader_accepts_and_scrubs_utf8_bom() {
        let dir = tempfile::tempdir().unwrap();
        let config_dir = dir.path().join("config");
        fs::create_dir_all(&config_dir).unwrap();
        let mut settings = Settings::default();
        settings.appearance_mode = "light".into();
        settings.background_color = "#FFFFFF".into();
        settings.foreground_color = "#0D0D0D".into();
        let path = config_dir.join("settings.json");
        let body = format!("\u{feff}{}", serde_json::to_string_pretty(&settings).unwrap());
        fs::write(&path, body).unwrap();

        let loaded = load_settings(dir.path()).unwrap();

        assert_eq!(loaded.appearance_mode, "light");
        assert_eq!(loaded.background_color, "#FFFFFF");
        let bytes = fs::read(&path).unwrap();
        assert!(!bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
    }

    #[test]
    fn invalid_settings_are_backed_up_and_replaced_with_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let config_dir = dir.path().join("config");
        fs::create_dir_all(&config_dir).unwrap();
        let path = config_dir.join("settings.json");
        fs::write(&path, "{ invalid json").unwrap();

        let loaded = load_settings(dir.path()).unwrap();

        assert_eq!(loaded.provider_id, "deepseek");
        assert_eq!(loaded.model, "deepseek-v4-flash");
        let rewritten = fs::read_to_string(&path).unwrap();
        assert!(serde_json::from_str::<Settings>(&rewritten).is_ok());
        let backups = fs::read_dir(&config_dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().starts_with("settings.invalid-"))
            .count();
        assert_eq!(backups, 1);
    }

    #[test]
    fn deepseek_usage_top_level_cache_fields_are_normalized() {
        let usage = normalize_usage(&json!({
            "prompt_tokens": 100,
            "completion_tokens": 20,
            "total_tokens": 120,
            "prompt_cache_hit_tokens": 80,
            "prompt_cache_miss_tokens": 20,
            "completion_tokens_details": { "reasoning_tokens": 7 }
        }));
        assert_eq!(usage.cache_hit_tokens, 80);
        assert_eq!(usage.cache_miss_tokens, 20);
        assert_eq!(usage.reasoning_tokens, 7);
    }

    #[test]
    fn nested_cached_tokens_are_normalized() {
        let usage = normalize_usage(&json!({
            "prompt_tokens": 100,
            "completion_tokens": 20,
            "prompt_tokens_details": { "cached_tokens": 25 }
        }));
        assert_eq!(usage.cache_hit_tokens, 25);
        assert_eq!(usage.cache_miss_tokens, 75);
    }

    #[test]
    fn prefix_hash_is_stable_for_same_inputs() {
        let settings = Settings::default();
        let provider = provider_profiles().remove(0);
        let a = sha256_hex(build_prefix(&provider, &settings).as_bytes());
        let b = sha256_hex(build_prefix(&provider, &settings).as_bytes());
        assert_eq!(a, b);
    }

    #[test]
    fn prefix_hash_changes_when_context_window_changes() {
        let mut settings = Settings::default();
        let provider = provider_profiles().remove(0);
        let a = sha256_hex(build_prefix(&provider, &settings).as_bytes());
        settings.context_window = 128_000;
        let b = sha256_hex(build_prefix(&provider, &settings).as_bytes());
        assert_ne!(a, b);
    }

    #[test]
    fn context_budget_trims_oldest_history_turns() {
        let mut settings = Settings::default();
        settings.context_window = 1_024;
        settings.max_tokens = 256;
        let prefix = ChatMessage::system("stable prefix");
        let mut history = vec![
            ChatMessage::user("old user ".repeat(600)),
            ChatMessage::system("old assistant ".repeat(600)),
            ChatMessage::user("recent user"),
            ChatMessage::system("recent assistant"),
        ];
        history[1].role = "assistant".into();
        history[3].role = "assistant".into();
        let turn_context = Vec::new();
        let current_user = ChatMessage::user("current question");
        let result = trim_history_to_context_budget(
            &settings,
            &prefix,
            &mut history,
            &turn_context,
            &current_user,
        );
        assert_eq!(result.truncated_messages, 2);
        assert_eq!(history[0].content, "recent user");
        assert_eq!(history[1].content, "recent assistant");
    }

    #[test]
    fn think_tags_split_into_reasoning() {
        let (r, c) = split_think_tags("hello <think>hidden</think> world");
        assert_eq!(r, "hidden");
        assert_eq!(c, "hello  world");
    }

    #[test]
    fn provider_body_maps_deepseek_thinking() {
        let settings = Settings::default();
        let provider = provider_profiles().remove(0);
        let body = build_chat_body(&ModelCall {
            provider,
            settings,
            secret: ProviderSecret::default(),
            messages: vec![ChatMessage::user("hello")],
            stream: false,
            tools_enabled: false,
        });
        assert_eq!(body["thinking"]["type"], "enabled");
        assert_eq!(body["reasoning_effort"], "max");
        assert!(body.get("temperature").is_none());
    }

    #[test]
    fn deepseek_compatible_efforts_map_to_official_values() {
        let provider = provider_profiles()
            .into_iter()
            .find(|p| p.id == "deepseek")
            .unwrap();
        let thinking = selected_thinking_profile(&provider, "deepseek-v4-flash");
        assert_eq!(provider_reasoning_effort("deepseek", &thinking, "low"), "high");
        assert_eq!(
            provider_reasoning_effort("deepseek", &thinking, "medium"),
            "high"
        );
        assert_eq!(
            provider_reasoning_effort("deepseek", &thinking, "xhigh"),
            "max"
        );
        assert_eq!(provider_reasoning_effort("deepseek", &thinking, "max"), "max");
    }

    #[test]
    fn deepseek_saved_legacy_effort_is_normalized_to_official_values() {
        let mut settings = Settings::default();
        settings.reasoning_effort = "low".into();
        normalize_settings_for_provider(&mut settings);
        assert_eq!(settings.reasoning_effort, "high");
        settings.reasoning_effort = "xhigh".into();
        normalize_settings_for_provider(&mut settings);
        assert_eq!(settings.reasoning_effort, "max");
    }

    #[test]
    fn default_permission_exposes_only_read_workspace_tools() {
        let settings = Settings::default();
        let tools = workspace_tool_definitions(&settings);
        let tool_names: Vec<String> = tools
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|tool| tool["function"]["name"].as_str().map(str::to_string))
            .collect();
        assert!(tool_names.iter().any(|name| name == "read_file"));
        assert!(tool_names.iter().any(|name| name == "grep_workspace"));
        assert!(!tool_names.iter().any(|name| name == "edit_file"));
        assert!(!tool_names.iter().any(|name| name == "write_file"));
        assert!(!tool_names.iter().any(|name| name == "run_shell_command"));
    }

    #[test]
    fn agents_md_is_loaded_into_stable_prefix() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("AGENTS.md"),
            "Prefer read-only inspection first. Keep project answers concrete.",
        )
        .unwrap();
        let mut settings = Settings::default();
        settings.workspace_path = Some(dir.path().to_string_lossy().to_string());
        let provider = provider_profiles().remove(0);
        let prefix = build_prefix(&provider, &settings);
        assert!(prefix.contains("projectInstructionsHash"));
        assert!(prefix.contains("AGENTS.md"));
        assert!(prefix.contains("Prefer read-only inspection first"));
    }

    #[test]
    fn vendor_instruction_files_are_loaded_in_stable_order() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".cursor").join("rules")).unwrap();
        fs::create_dir_all(dir.path().join(".windsurf").join("rules")).unwrap();
        fs::create_dir_all(dir.path().join(".github")).unwrap();
        fs::write(dir.path().join("CLAUDE.md"), "Claude style project rule").unwrap();
        fs::write(
            dir.path().join(".cursor").join("rules").join("b.md"),
            "Cursor rule B",
        )
        .unwrap();
        fs::write(
            dir.path().join(".cursor").join("rules").join("a.md"),
            "Cursor rule A",
        )
        .unwrap();
        fs::write(
            dir.path().join(".windsurf").join("rules").join("team.md"),
            "Windsurf team memory rule",
        )
        .unwrap();
        fs::write(
            dir.path().join(".github").join("copilot-instructions.md"),
            "Copilot instruction file",
        )
        .unwrap();
        let mut settings = Settings::default();
        settings.workspace_path = Some(dir.path().to_string_lossy().to_string());
        let instructions = load_project_instructions(&settings).unwrap();
        assert!(instructions.content.contains("Claude style project rule"));
        assert!(instructions.content.contains("Copilot instruction file"));
        assert!(instructions.content.contains("Cursor rule A"));
        assert!(instructions.content.contains("Cursor rule B"));
        assert!(instructions.content.contains("Windsurf team memory rule"));
        let a = instructions.content.find("Cursor rule A").unwrap();
        let b = instructions.content.find("Cursor rule B").unwrap();
        assert!(a < b);
    }

    #[test]
    fn nested_project_instruction_files_are_loaded_in_stable_order() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("src").join("feature")).unwrap();
        fs::create_dir_all(dir.path().join("node_modules").join("pkg")).unwrap();
        fs::write(dir.path().join("AGENTS.md"), "Root project rule").unwrap();
        fs::write(
            dir.path().join("src").join("AGENTS.override.md"),
            "Source override rule",
        )
        .unwrap();
        fs::write(
            dir.path().join("src").join("feature").join("AGENTS.md"),
            "Feature subtree rule",
        )
        .unwrap();
        fs::write(
            dir.path()
                .join("node_modules")
                .join("pkg")
                .join("AGENTS.md"),
            "Skipped dependency rule",
        )
        .unwrap();
        let mut settings = Settings::default();
        settings.workspace_path = Some(dir.path().to_string_lossy().to_string());
        let instructions = load_project_instructions(&settings).unwrap();
        assert!(instructions.files.iter().any(|file| file == "AGENTS.md"));
        assert!(instructions
            .files
            .iter()
            .any(|file| file == "src/AGENTS.override.md"));
        assert!(instructions
            .files
            .iter()
            .any(|file| file == "src/feature/AGENTS.md"));
        assert!(!instructions.content.contains("Skipped dependency rule"));
        let root = instructions.content.find("Root project rule").unwrap();
        let source = instructions.content.find("Source override rule").unwrap();
        let feature = instructions.content.find("Feature subtree rule").unwrap();
        assert!(root < source);
        assert!(source < feature);
    }

    #[test]
    fn large_tool_output_is_truncated_for_model_context() {
        let output = json!({
            "ok": true,
            "summary": "large grep result",
            "items": "large tool output".repeat(MAX_TOOL_RESULT_CHARS)
        });
        let serialized = serialize_tool_output_for_model("grep_workspace", &output);
        let parsed: Value = serde_json::from_str(&serialized).unwrap();
        assert_eq!(parsed["ok"], true);
        assert_eq!(parsed["truncated"], true);
        assert!(serialized.len() < MAX_TOOL_RESULT_CHARS + 1200);
    }

    #[test]
    fn shell_permission_requires_auto_review_or_full_access() {
        let mut settings = Settings::default();
        assert!(!permission_allows_shell(&settings, "pwd"));
        settings.permission_mode = "auto-review".into();
        assert!(!permission_allows_shell(&settings, "pwd"));
        assert!(!permission_allows_shell(&settings, "rg foo; del bar"));
        settings.permission_mode = "full-access".into();
        assert!(permission_allows_shell(&settings, "cargo test"));
    }

    #[test]
    fn side_effect_tools_are_marked_for_checkpoints() {
        assert!(tool_has_side_effect("edit_file"));
        assert!(tool_has_side_effect("write_file"));
        assert!(tool_has_side_effect("run_shell_command"));
        assert!(!tool_has_side_effect("read_file"));
        assert!(!tool_has_side_effect("grep_workspace"));
        assert!(!tool_has_side_effect("git_status"));
    }

    #[test]
    fn writable_absolute_escape_does_not_create_outside_parent_dirs() {
        let workspace = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let target_dir = outside.path().join("created-by-deepx");
        let target = target_dir.join("file.txt");
        let mut settings = Settings::default();
        settings.workspace_path = Some(workspace.path().to_string_lossy().to_string());
        let err = resolve_writable_workspace_path(&settings, &target.to_string_lossy(), true)
            .expect_err("absolute path outside workspace must be rejected");
        assert!(err.contains("workspace sandbox"));
        assert!(!target_dir.exists());
    }

    #[test]
    fn writable_relative_parent_escape_does_not_create_outside_parent_dirs() {
        let workspace = tempfile::tempdir().unwrap();
        let outside_dir = workspace.path().parent().unwrap().join(format!(
            "deepx-outside-{}",
            Uuid::new_v4()
        ));
        let target = PathBuf::from("..").join(outside_dir.file_name().unwrap()).join("file.txt");
        let mut settings = Settings::default();
        settings.workspace_path = Some(workspace.path().to_string_lossy().to_string());
        let err = resolve_writable_workspace_path(&settings, &target.to_string_lossy(), true)
            .expect_err("relative parent escape must be rejected before mkdir");
        assert!(err.contains("workspace sandbox"));
        assert!(!outside_dir.exists());
    }

    #[test]
    fn provider_profiles_expose_model_specific_thinking() {
        let profiles = provider_profiles();
        let deepseek = profiles.iter().find(|p| p.id == "deepseek").unwrap();
        let deepseek_model = deepseek
            .models
            .iter()
            .find(|m| m.id == "deepseek-v4-flash")
            .unwrap();
        assert_eq!(deepseek_model.thinking.kind, "effort");
        assert_eq!(
            deepseek_model.thinking.effort_values,
            vec!["high", "max"]
        );

        let stepfun = profiles.iter().find(|p| p.id == "stepfun").unwrap();
        let step_model = stepfun
            .models
            .iter()
            .find(|m| m.id == "step-3.7-flash")
            .unwrap();
        assert_eq!(
            step_model.thinking.effort_values,
            vec!["low", "medium", "high"]
        );
        assert!(!step_model
            .thinking
            .effort_values
            .iter()
            .any(|value| value == "max"));

        let qwen = profiles.iter().find(|p| p.id == "qwen").unwrap();
        let qwen_model = qwen
            .models
            .iter()
            .find(|m| m.id == "qwen3-coder-plus")
            .unwrap();
        assert_eq!(qwen_model.thinking.kind, "budget");
        assert_eq!(qwen_model.thinking.max_budget_tokens, Some(65_536));

        let kimi = profiles.iter().find(|p| p.id == "kimi").unwrap();
        assert!(!kimi.models[0].thinking.supported);
    }

    #[test]
    fn stepfun_does_not_emit_deepseek_max_effort() {
        let mut settings = Settings::default();
        settings.provider_id = "stepfun".into();
        settings.model = "step-3.7-flash".into();
        settings.reasoning_effort = "max".into();
        let provider = provider_profiles()
            .into_iter()
            .find(|p| p.id == "stepfun")
            .unwrap();
        let body = build_chat_body(&ModelCall {
            provider,
            settings,
            secret: ProviderSecret::default(),
            messages: vec![ChatMessage::user("hello")],
            stream: false,
            tools_enabled: false,
        });
        assert_eq!(body["reasoning_effort"], "high");
    }

    #[test]
    fn qwen_uses_budget_instead_of_effort() {
        let mut settings = Settings::default();
        settings.provider_id = "qwen".into();
        settings.model = "qwen3-coder-plus".into();
        settings.max_tokens = 100_000;
        let provider = provider_profiles()
            .into_iter()
            .find(|p| p.id == "qwen")
            .unwrap();
        let body = build_chat_body(&ModelCall {
            provider,
            settings,
            secret: ProviderSecret::default(),
            messages: vec![ChatMessage::user("hello")],
            stream: false,
            tools_enabled: false,
        });
        assert_eq!(body["enable_thinking"], true);
        assert_eq!(body["thinking_budget"], 65_536);
        assert!(body.get("reasoning_effort").is_none());
    }
}
