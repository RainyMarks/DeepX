const DEFAULT_UI_FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const DEFAULT_CODE_FONT = '"JetBrains Mono", ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace';
const DEFAULT_UI_FONT_SIZE = 14;
const DEFAULT_CODE_FONT_SIZE = 12;
const APP_BRAND = "雨刃";
const APP_ENGLISH_NAME = "RainyReSearch";
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 360;
const SIDEBAR_DEFAULT = 232;
const RESEARCH_SPLIT_MIN = 380;
const RESEARCH_SPLIT_MAX = 920;
const RESEARCH_SPLIT_DEFAULT = 560;
const LEGACY_THEME_DARK = ["cod", "ex"].join("");
const LEGACY_THEME_LIGHT = `${LEGACY_THEME_DARK}-light`;

const THEME_PRESETS = [
  {
    id: "rainy-research-default",
    labelZh: "雨刃 深色",
    labelEn: "RainyReSearch Dark",
    mode: "dark",
    accent: "#0169cc",
    background: "#111111",
    foreground: "#fcfcfc",
    uiFont: DEFAULT_UI_FONT,
    codeFont: DEFAULT_CODE_FONT,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    codeFontSize: DEFAULT_CODE_FONT_SIZE,
    translucentSidebar: false,
    contrast: 60,
    density: "comfortable",
  },
  {
    id: "rainy-research-light",
    labelZh: "雨刃 浅色",
    labelEn: "RainyReSearch Light",
    mode: "light",
    accent: "#0169cc",
    background: "#ffffff",
    foreground: "#0d0d0d",
    uiFont: DEFAULT_UI_FONT,
    codeFont: DEFAULT_CODE_FONT,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    codeFontSize: DEFAULT_CODE_FONT_SIZE,
    translucentSidebar: false,
    contrast: 45,
    density: "comfortable",
  },
  {
    id: "graphite",
    labelZh: "石墨",
    labelEn: "Graphite",
    mode: "dark",
    accent: "#cc7d5e",
    background: "#2d2d2b",
    foreground: "#f9f9f7",
    uiFont: DEFAULT_UI_FONT,
    codeFont: DEFAULT_CODE_FONT,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    codeFontSize: DEFAULT_CODE_FONT_SIZE,
    translucentSidebar: false,
    contrast: 60,
    density: "comfortable",
  },
  {
    id: "midnight",
    labelZh: "午夜",
    labelEn: "Midnight",
    mode: "dark",
    accent: "#5aa7ff",
    background: "#0b0b0b",
    foreground: "#f4f4f4",
    uiFont: DEFAULT_UI_FONT,
    codeFont: DEFAULT_CODE_FONT,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    codeFontSize: DEFAULT_CODE_FONT_SIZE,
    translucentSidebar: true,
    contrast: 66,
    density: "compact",
  },
  {
    id: "paper",
    labelZh: "纸张",
    labelEn: "Paper",
    mode: "light",
    accent: "#0b72d9",
    background: "#fbfbfb",
    foreground: "#111111",
    uiFont: DEFAULT_UI_FONT,
    codeFont: DEFAULT_CODE_FONT,
    uiFontSize: DEFAULT_UI_FONT_SIZE,
    codeFontSize: DEFAULT_CODE_FONT_SIZE,
    translucentSidebar: false,
    contrast: 50,
    density: "comfortable",
  },
];

const PERMISSION_MODES = ["default", "auto-review", "full-access", "custom"];

const I18N = {
  "zh-CN": {
    coreStarting: "核心启动中",
    coreReady: "核心已就绪",
    newChat: "新对话",
    noWorkspace: "未选择工作区",
    serverMonitor: "服务器监控",
    workspaceSaved: "工作区已保存",
    workspaceUnavailable: "工作区不可用，已回退到 RainyReSearch 目录",
    projects: "项目",
    noProjects: "暂无项目",
    projectSwitched: "已切换项目",
    projectAdded: "项目已添加",
    recent: "最近",
    core: "核心",
    settings: "设置",
    data: "数据",
    toggleSidebar: "折叠或展开侧边栏",
    toggleTerminal: "切换底部终端",
    restartTerminal: "重启终端",
    terminalStarting: "终端启动中",
    terminalStarted: "终端已启动",
    terminalStopped: "终端已停止",
    preparing: "正在准备 RainyReSearch",
    workspacePreparing: "正在设置工作区",
    workspacePreparingDetail: "正在扫描目录树、AGENTS.md 和工具上下文",
    workspaceReady: "工作区已就绪",
    workspaceReadyDetail: "{treeEntries} 个目录项 · 说明: {instructions}",
    workspaceSetupFailed: "工作区设置失败",
    messagePlaceholder: "向雨刃发送消息",
    addContext: "添加文件",
    fileAttached: "已添加 {count} 个文件",
    fileAttachFailed: "文件添加失败",
    fileTooLarge: "文件过大，已截断",
    removeAttachment: "移除附件",
    send: "发送",
    close: "关闭",
    backToApp: "返回应用",
    settingsSubtitle: "配置会保存到 RainyReSearch/data，本机密钥不会进入发行包。",
    general: "常规",
    generalHelp: "基础偏好和当前运行状态。",
    modelAccess: "模型",
    modelAccessHelp: "服务商、模型、API key、上下文窗口和输出限制。",
    appearance: "外观",
    appearanceHelp: "调整 RainyReSearch 的颜色、字体、密度和交互细节。",
    provider: "服务商",
    providerFallback: "服务商",
    model: "模型",
    customModel: "自定义模型",
    baseUrl: "Base URL",
    apiKey: "API 密钥",
    authHeader: "认证 Header",
    temperature: "温度",
    contextWindow: "上下文窗口",
    contextEffective: "当前生效：{value}",
    maxTokens: "最大输出",
    preserveReasoning: "保留思考历史",
    preserveReasoningHelp: "仅在服务商明确支持并要求时启用。",
    language: "语言",
    languageHelp: "界面文案可在中文和英文之间切换。",
    theme: "主题",
    themeHelp: "使用浅色、深色，或匹配系统设置。",
    light: "浅色",
    dark: "深色",
    system: "系统",
    themePreset: "主题预设",
    background: "背景",
    foreground: "前景",
    uiFont: "UI 字体",
    codeFont: "代码字体",
    uiFontSize: "UI 字号",
    uiFontSizeHelp: "固定为 14px，保持 Codex 风格界面一致。",
    codeFontSize: "代码字号",
    codeFontSizeHelp: "固定为 12px，代码、终端和辅助信息统一使用。",
    density: "密度",
    densityCompact: "紧凑",
    densityComfortable: "标准",
    densitySpacious: "宽松",
    translucentSidebar: "半透明侧边栏",
    contrast: "对比度",
    pointerCursor: "使用指针光标",
    pointerCursorHelp: "悬停交互元素时切换为指针光标。",
    motionEffects: "动态效果",
    motionEffectsHelp: "控制界面过渡、弹层和流式光标动画。",
    restoreAppearance: "恢复外观默认值",
    restoreAppearanceHelp: "只重置外观控制项。",
    restore: "恢复",
    themePreviewSession: "会话",
    themePreviewTitle: "RainyReSearch 主题预览",
    cache: "缓存与用量",
    cacheHelp: "每轮显示缓存命中、prefix hash、裁剪状态和费用估算。",
    cacheLastTurn: "最近一轮",
    cacheNoMetric: "还没有缓存指标。",
    showInThread: "回到线程",
    portable: "环境",
    portableHelp: "运行时、配置、会话、日志和本机密钥都放在 RainyReSearch 目录内。",
    dataRoot: "数据目录",
    openDataDir: "打开数据目录",
    appUpdate: "应用更新",
    updateIdle: "当前版本 {version}，可检查 GitHub Release 更新。",
    checkUpdate: "检查更新",
    checkingUpdate: "正在检查更新",
    updateAvailable: "发现新版本 {version}",
    updateUpToDate: "已是最新版本 {version}",
    installUpdate: "下载并安装",
    updateDownloading: "正在下载 {percent}%",
    updateExtracting: "正在解压更新包",
    updateInstalling: "正在安装，应用将自动重启",
    updateFailed: "更新失败",
    updateApiFallback: "GitHub API 受限，已切换到公开发布页检查。",
    updateBannerTitle: "发现新版本",
    updateBannerText: "RainyReSearch {version} 可更新。",
    dismiss: "忽略",
    updateUnavailableInDev: "开发模式不能直接安装更新。",
    testConnection: "测试连接",
    save: "保存",
    saved: "已保存",
    saving: "保存中",
    testing: "测试中",
    connectionOk: "连接测试通过",
    connectionFailed: "连接测试失败",
    saveFailed: "保存失败",
    apiKeySaved: "API key 已保存",
    apiKeyConfigured: "已保存 API key；留空不会覆盖。",
    apiKeyMissing: "未保存 API key。",
    apiKeyOptional: "留空表示不修改已保存密钥。",
    thinking: "思考",
    thinkingEnabled: "开启思考",
    thinkingDisabled: "关闭思考",
    thinkingEnabledHelp: "本轮请求发送该模型支持的思考参数。",
    thinkingDisabledHelp: "本轮请求不发送思考参数。",
    effortLow: "低",
    effortMedium: "中",
    effortHigh: "高",
    effortXhigh: "极高",
    effortMax: "最大",
    effortEffective: "实际发送：{value}",
    effortCompatible: "兼容档位：{from} 会按官方规则映射为 {to}。",
    effortOfficial: "官方参数：{mapping}",
    webSearch: "联网搜索",
    webSearchHelp: "启用后，AI 可以主动调用更强的联网搜索工具。",
    webSearchMode: "搜索模式",
    webSearchModeHelp: "优先使用 Brave、Tavily、Serper 或 SearXNG；未配置时用公开搜索兜底。",
    webSearchResults: "结果数量",
    webSearchResultsHelp: "用于 Agent 检索论文、文档、报错和最新信息。",
    webBraveKey: "Brave Search API Key",
    webBraveHelp: "推荐。适合通用网页和技术文档搜索。",
    webTavilyKey: "Tavily API Key",
    webTavilyHelp: "适合研究和 RAG 风格的深度搜索。",
    webSerperKey: "Serper API Key",
    webSerperHelp: "Google 结果聚合，适合补全公开网页。",
    webSearxngUrl: "SearXNG 地址",
    webSearxngHelp: "可填你自己的 SearXNG 实例 URL。",
    on: "开启",
    off: "关闭",
    permissionDefault: "默认权限",
    permissionDefaultHelp: "读取工作区，额外访问需要确认。",
    permissionAuto: "自动审查",
    permissionAutoHelp: "首版仅使用只读工具；逐命令确认做好后再开放自动执行。",
    permissionFull: "完全访问权限",
    permissionFullHelp: "允许在工作区内写文件并运行 shell。",
    permissionCustom: "自定义 (config.toml)",
    permissionCustomHelp: "按本地配置文件里的权限策略运行；未配置时按默认只读策略。",
    webSearchRunning: "正在搜索网络",
    sending: "正在发送",
    streaming: "正在生成",
    toolRunning: "正在使用 {name}",
    toolDone: "{name} 完成",
    toolFailed: "{name} 失败",
    toolCalls: "工具调用",
    userLabel: "你",
    assistantLabel: "RainyReSearch",
    processed: "已处理",
    copied: "已复制",
    copy: "复制",
    restoreCheckpoint: "回到检查点",
    restoreCheckpointConfirm: "确定恢复到这条消息之前的文件状态吗？之后的对话会被移除。",
    checkpointRestored: "已回到检查点",
    reasoning: "思考过程",
    emptySessions: "暂无对话",
    cacheHitMiss: "缓存 hit {hit} / miss {miss}",
    hitRatio: "命中率 {ratio}%",
    tokenCount: "{count} tokens",
    prefixReset: "prefix {hash} 已重置",
    prefixStable: "prefix {hash}",
    truncated: "上下文已裁剪 {count} 条",
    noCost: "费用未知",
    statusConfigured: "{provider} 就绪",
    statusMissingKey: "{provider} 未配置 API key",
    streamError: "请求失败",
    selectWorkspace: "选择工作区",
    contextShort: "{value}",
  },
  "en-US": {
    coreStarting: "Starting core",
    coreReady: "Core ready",
    newChat: "New chat",
    noWorkspace: "No workspace selected",
    serverMonitor: "Server monitor",
    workspaceSaved: "Workspace saved",
    workspaceUnavailable: "Workspace unavailable; RainyReSearch root is used",
    projects: "Projects",
    noProjects: "No projects yet",
    projectSwitched: "Project switched",
    projectAdded: "Project added",
    recent: "Recent",
    core: "Core",
    settings: "Settings",
    data: "Data",
    toggleSidebar: "Toggle sidebar",
    toggleTerminal: "Toggle bottom terminal",
    restartTerminal: "Restart terminal",
    terminalStarting: "Starting terminal",
    terminalStarted: "Terminal started",
    terminalStopped: "Terminal stopped",
    preparing: "Preparing RainyReSearch",
    workspacePreparing: "Setting up workspace",
    workspacePreparingDetail: "Scanning the tree, AGENTS.md, and tool context",
    workspaceReady: "Workspace ready",
    workspaceReadyDetail: "{treeEntries} tree entries · instructions: {instructions}",
    workspaceSetupFailed: "Workspace setup failed",
    messagePlaceholder: "Message RainyReSearch",
    addContext: "Add files",
    fileAttached: "Added {count} file(s)",
    fileAttachFailed: "Failed to add file",
    fileTooLarge: "File is large and was truncated",
    removeAttachment: "Remove attachment",
    send: "Send",
    close: "Close",
    backToApp: "Back to app",
    settingsSubtitle: "Configuration is stored in RainyReSearch/data. Local secrets are not shipped.",
    general: "General",
    generalHelp: "Base preferences and current runtime state.",
    modelAccess: "Models",
    modelAccessHelp: "Provider, model, API key, context window, and output limits.",
    appearance: "Appearance",
    appearanceHelp: "Tune RainyReSearch colors, fonts, density, and interaction details.",
    provider: "Provider",
    providerFallback: "Provider",
    model: "Model",
    customModel: "Custom model",
    baseUrl: "Base URL",
    apiKey: "API key",
    authHeader: "Auth header",
    temperature: "Temperature",
    contextWindow: "Context window",
    contextEffective: "Effective: {value}",
    maxTokens: "Max output",
    preserveReasoning: "Preserve reasoning history",
    preserveReasoningHelp: "Enable only when the provider explicitly supports it.",
    language: "Language",
    languageHelp: "Switch interface copy between Chinese and English.",
    theme: "Theme",
    themeHelp: "Use light, dark, or match system settings.",
    light: "Light",
    dark: "Dark",
    system: "System",
    themePreset: "Theme preset",
    background: "Background",
    foreground: "Foreground",
    uiFont: "UI font",
    codeFont: "Code font",
    uiFontSize: "UI size",
    uiFontSizeHelp: "Fixed at 14px for a consistent Codex-style interface.",
    codeFontSize: "Code size",
    codeFontSizeHelp: "Fixed at 12px for code, terminal, and helper text.",
    density: "Density",
    densityCompact: "Compact",
    densityComfortable: "Comfortable",
    densitySpacious: "Spacious",
    translucentSidebar: "Translucent sidebar",
    contrast: "Contrast",
    pointerCursor: "Use pointer cursor",
    pointerCursorHelp: "Switch to pointer cursor over interactive elements.",
    motionEffects: "Motion effects",
    motionEffectsHelp: "Control interface transitions, popovers, and streaming cursor animation.",
    restoreAppearance: "Restore defaults",
    restoreAppearanceHelp: "Reset appearance controls only.",
    restore: "Restore",
    themePreviewSession: "Session",
    themePreviewTitle: "RainyReSearch theme preview",
    cache: "Cache & usage",
    cacheHelp: "Shows cache hit/miss, prefix hash, truncation, and estimated cost per turn.",
    cacheLastTurn: "Last turn",
    cacheNoMetric: "No cache metric yet.",
    showInThread: "Back to thread",
    portable: "Environment",
    portableHelp: "Runtime, config, sessions, logs, and local secrets stay inside the RainyReSearch directory.",
    dataRoot: "Data directory",
    openDataDir: "Open data directory",
    appUpdate: "App update",
    updateIdle: "Current version {version}. Check GitHub Releases for updates.",
    checkUpdate: "Check update",
    checkingUpdate: "Checking update",
    updateAvailable: "New version {version} is available",
    updateUpToDate: "Already up to date: {version}",
    installUpdate: "Download and install",
    updateDownloading: "Downloading {percent}%",
    updateExtracting: "Extracting update package",
    updateInstalling: "Installing. RainyReSearch will restart automatically",
    updateFailed: "Update failed",
    updateApiFallback: "GitHub API is limited, using the public release page instead.",
    updateBannerTitle: "Update available",
    updateBannerText: "RainyReSearch {version} is available.",
    dismiss: "Dismiss",
    updateUnavailableInDev: "Updates can only be installed from the packaged app.",
    testConnection: "Test connection",
    save: "Save",
    saved: "Saved",
    saving: "Saving",
    testing: "Testing",
    connectionOk: "Connection test passed",
    connectionFailed: "Connection test failed",
    saveFailed: "Save failed",
    apiKeySaved: "API key saved",
    apiKeyConfigured: "API key saved; leaving it blank will not overwrite it.",
    apiKeyMissing: "No API key saved.",
    apiKeyOptional: "Leave blank to keep the saved key.",
    thinking: "Thinking",
    thinkingEnabled: "Enable thinking",
    thinkingDisabled: "Disable thinking",
    thinkingEnabledHelp: "Send the thinking parameters supported by this model for this turn.",
    thinkingDisabledHelp: "Do not send thinking parameters for this turn.",
    effortLow: "Low",
    effortMedium: "Medium",
    effortHigh: "High",
    effortXhigh: "xHigh",
    effortMax: "Max",
    effortEffective: "Sent as: {value}",
    effortCompatible: "Compatibility: {from} is mapped to {to}.",
    effortOfficial: "Official parameter: {mapping}",
    webSearch: "Web search",
    webSearchHelp: "Let the AI call stronger web search while working.",
    webSearchMode: "Search mode",
    webSearchModeHelp: "Prefers Brave, Tavily, Serper, or SearXNG; falls back to public search.",
    webSearchResults: "Result count",
    webSearchResultsHelp: "Used for papers, docs, errors, and current information.",
    webBraveKey: "Brave Search API key",
    webBraveHelp: "Recommended for general web and technical documentation search.",
    webTavilyKey: "Tavily API key",
    webTavilyHelp: "Good for research and RAG-style deep search.",
    webSerperKey: "Serper API key",
    webSerperHelp: "Google result aggregation for public webpages.",
    webSearxngUrl: "SearXNG URL",
    webSearxngHelp: "Use your own SearXNG instance URL.",
    on: "On",
    off: "Off",
    permissionDefault: "Default permissions",
    permissionDefaultHelp: "Read workspace files; ask before extra access.",
    permissionAuto: "Auto review",
    permissionAutoHelp: "Read-only in the first release; command approval will unlock automation later.",
    permissionFull: "Full access",
    permissionFullHelp: "Allow workspace writes and shell commands.",
    permissionCustom: "Custom (config.toml)",
    permissionCustomHelp: "Use the local config permission policy; defaults to read-only when no policy exists.",
    webSearchRunning: "Searching the web",
    sending: "Sending",
    streaming: "Generating",
    toolRunning: "Using {name}",
    toolDone: "{name} done",
    toolFailed: "{name} failed",
    toolCalls: "Tool calls",
    userLabel: "You",
    assistantLabel: "RainyReSearch",
    processed: "Processed",
    copied: "Copied",
    copy: "Copy",
    restoreCheckpoint: "Undo changes up to this point",
    restoreCheckpointConfirm: "Restore files to the state before this message? Later conversation will be removed.",
    checkpointRestored: "Checkpoint restored",
    reasoning: "Reasoning",
    emptySessions: "No conversations yet",
    cacheHitMiss: "Cache hit {hit} / miss {miss}",
    hitRatio: "Hit {ratio}%",
    tokenCount: "{count} tokens",
    prefixReset: "prefix {hash} reset",
    prefixStable: "prefix {hash}",
    truncated: "Context truncated {count}",
    noCost: "Cost unknown",
    statusConfigured: "{provider} ready",
    statusMissingKey: "{provider} missing API key",
    streamError: "Request failed",
    selectWorkspace: "Select workspace",
    contextShort: "{value}",
  },
};

Object.assign(I18N["zh-CN"], {
  newChat: "科研会话",
  workspaceUnavailable: "工作区不可用，已回退到雨刃目录",
  preparing: "正在准备雨刃",
  messagePlaceholder: "向雨刃发送消息",
  settingsSubtitle: "配置会保存到 RainyReSearch/data，本机密钥不会进入发行包。",
  appearanceHelp: "调整雨刃的颜色、字体、密度和交互细节。",
  themePreviewTitle: "雨刃主题预览",
  portableHelp: "运行时、配置、会话、日志、研究数据和本机密钥都放在 RainyReSearch 目录内。",
  updateBannerText: "RainyReSearch {version} 可更新。",
  assistantLabel: "雨刃",
  researchWorkbenchTitle: "科研复现工作台",
  paperRadar: "论文雷达",
  searchPapers: "搜索",
  researchQueryPlaceholder: "输入论文标题、关键词、DOI 或 arXiv ID",
  paperCard: "情报卡",
  paperGraph: "关系图",
  reproAudit: "代码分析",
  researchGuide: "配置教程",
  openResearchSettings: "去填写配置",
  agentTrace: "智能体",
  paperCardEmpty: "搜索并选择论文后查看多源情报卡。",
  graphHelp: "当前论文的引用、代码、方法和数据集技术血缘。",
  reloadGraph: "重载关系图",
  repoUrl: "代码仓库链接或本地路径",
  runAudit: "运行审计",
  runTrickScore: "风险评分",
  exportReport: "导出报告",
  agentTraceHelp: "旧会话仍可用于开发任务和论文追问。",
  researchSources: "科研源",
  researchSourcesHelp: "可选 source keys 提升覆盖率；留空不会覆盖已保存密钥。",
  researchSearching: "正在聚合论文、代码和 AI 分析",
  researchSearchDone: "找到 {count} 篇候选论文",
  researchSearchFailed: "论文搜索失败",
  noResearchResults: "暂无结果。可以换更具体的标题、DOI、arXiv ID 或作者年份。",
  selectedPaperStatus: "已选择：{title}",
  graphLoading: "正在构建图谱",
  graphEmpty: "当前论文还没有可绘制的图谱边。",
  auditRunning: "正在审计 repo",
  auditDone: "审计完成",
  auditFailed: "审计失败",
  riskRunning: "正在计算复现/可信性风险",
  riskDone: "风险评分完成",
  reportExported: "报告已导出：{path}",
  sourceConfigured: "已配置",
  sourceMissing: "未配置",
  localOnlyOk: "无 key 时会降级到可用源和本地缓存",
  aiAnalysis: "AI 分析",
  riskLow: "低风险",
  riskMedium: "中风险",
  riskHigh: "高风险",
  riskUnknown: "风险未知",
});

Object.assign(I18N["en-US"], {
  workspaceUnavailable: "Workspace unavailable; RainyReSearch root is used",
  preparing: "Preparing RainyReSearch",
  messagePlaceholder: "Message RainyReSearch",
  settingsSubtitle: "Configuration is stored in RainyReSearch/data. Local secrets are not shipped.",
  appearanceHelp: "Tune RainyReSearch colors, fonts, density, and interaction details.",
  themePreviewTitle: "RainyReSearch theme preview",
  portableHelp: "Runtime, config, sessions, logs, research data, and local secrets stay inside the RainyReSearch directory.",
  updateInstalling: "Installing. RainyReSearch will restart automatically",
  updateBannerText: "RainyReSearch {version} is available.",
  assistantLabel: "RainyReSearch",
  researchWorkbenchTitle: "Research reproducibility workbench",
  paperRadar: "Paper search",
  searchPapers: "Search",
  researchQueryPlaceholder: "Enter paper title, keywords, DOI, or arXiv ID",
  paperCard: "Card",
  paperGraph: "Graph",
  reproAudit: "Code analysis",
  researchGuide: "Setup guide",
  openResearchSettings: "Open settings",
  agentTrace: "Agent",
  paperCardEmpty: "Search and select a paper to inspect its intelligence card.",
  graphHelp: "Citation, code, method, and dataset lineage for the selected paper.",
  reloadGraph: "Reload graph",
  repoUrl: "GitHub repo or local path",
  runAudit: "Run audit",
  runTrickScore: "Risk score",
  exportReport: "Export report",
  agentTraceHelp: "Legacy chat sessions remain available for development tasks and paper-specific follow-up.",
  researchSources: "Research",
  researchSourcesHelp: "Optional source keys improve coverage; blank values keep existing saved secrets.",
  researchSearching: "Aggregating paper, code, and AI analysis",
  researchSearchDone: "Found {count} candidate papers",
  researchSearchFailed: "Paper search failed",
  noResearchResults: "No results yet. Try a title, DOI, arXiv ID, or author-year query.",
  selectedPaperStatus: "Selected: {title}",
  graphLoading: "Building graph",
  graphEmpty: "No graph edges are available for this paper yet.",
  auditRunning: "Auditing repo",
  auditDone: "Audit complete",
  auditFailed: "Audit failed",
  riskRunning: "Computing reproducibility and credibility risk",
  riskDone: "Risk score complete",
  reportExported: "Report exported: {path}",
  sourceConfigured: "configured",
  sourceMissing: "missing",
  localOnlyOk: "Without keys, RainyReSearch falls back to available sources and local cache.",
  aiAnalysis: "AI analysis",
  riskLow: "low risk",
  riskMedium: "medium risk",
  riskHigh: "high risk",
  riskUnknown: "risk unknown",
});

const state = {
  core: null,
  paths: null,
  providers: [],
  settings: {},
  configuredProviders: {},
  configuredResearchSources: {},
  configuredWebSearch: {},
  sessions: [],
  projects: [],
  attachments: [],
  sessionId: null,
  busy: false,
  workspace: null,
  lastMetric: null,
  updateInfo: null,
  updateBusy: false,
  updateDismissedVersion: null,
  language: "zh-CN",
  thinkingEnabled: true,
  webSearchEnabled: false,
  permissionMode: "default",
  settingsSection: "general",
  sidebarWidth: SIDEBAR_DEFAULT,
  sidebarCollapsed: false,
  resizeSidebar: null,
  researchSplitWidth: RESEARCH_SPLIT_DEFAULT,
  resizeResearchSplit: null,
  workspaceSetup: {
    status: "idle",
    workspacePath: null,
    title: "",
    detail: "",
  },
  workspaceSetupPromise: null,
  workspaceSetupTimer: null,
  workspaceSetupHideTimer: null,
  messageDraft: null,
  terminalOpen: false,
  terminalStarted: false,
  terminalStarting: false,
  terminalCwd: null,
  terminal: null,
  terminalFit: null,
  terminalDataDispose: null,
  terminalDataListenerReady: false,
  sshDataDispose: null,
  sshDataListenerReady: false,
  ssh: {
    id: null,
    connected: false,
    monitorRunning: false,
  },
  research: {
    tab: "card",
    query: "",
    results: [],
    sources: [],
    selected: null,
    graph: null,
    audit: null,
    risk: null,
    ideas: [],
    exportedReportPath: null,
  },
};

const $ = (id) => document.getElementById(id);

const el = {
  app: $("app"),
  brandIcon: $("brandIcon"),
  mainSurface: $("mainSurface"),
  providerStatus: $("providerStatus"),
  updateStatusValue: $("updateStatusValue"),
  updateBanner: $("updateBanner"),
  updateBannerTitle: $("updateBannerTitle"),
  updateBannerText: $("updateBannerText"),
  updateBannerInstallButton: $("updateBannerInstallButton"),
  updateBannerDismissButton: $("updateBannerDismissButton"),
  checkUpdateButton: $("checkUpdateButton"),
  installUpdateButton: $("installUpdateButton"),
  threadTitle: $("threadTitle"),
  terminalToggleButton: $("terminalToggleButton"),
  providerMiniButton: $("providerMiniButton"),
  contextMiniButton: $("contextMiniButton"),
  effortMenuButton: $("effortMenuButton"),
  effortButtonText: $("effortButtonText"),
  effortMenu: $("effortMenu"),
  permissionButton: $("permissionButton"),
  permissionLabel: $("permissionLabel"),
  permissionMenu: $("permissionMenu"),
  webSearchButton: $("webSearchButton"),
  sidebarToggleButton: $("sidebarToggleButton"),
  sidebarResizeHandle: $("sidebarResizeHandle"),
  workspaceButton: $("workspaceButton"),
  workspaceValue: $("workspaceValue"),
  serverMonitorButton: $("serverMonitorButton"),
  workspaceStatus: $("workspaceStatus"),
  workspaceStatusTitle: $("workspaceStatusTitle"),
  workspaceStatusDetail: $("workspaceStatusDetail"),
  projectList: $("projectList"),
  newSessionButton: $("newSessionButton"),
  sessionList: $("sessionList"),
  settingsButton: $("settingsButton"),
  openDataButton: $("openDataButton"),
  transcript: $("transcript"),
  composer: $("composer"),
  messageInput: $("messageInput"),
  attachmentTray: $("attachmentTray"),
  addContextButton: $("addContextButton"),
  sendButton: $("sendButton"),
  settingsOverlay: $("settingsOverlay"),
  closeSettingsButton: $("closeSettingsButton"),
  closeSettingsIconButton: $("closeSettingsIconButton"),
  settingsTitle: $("settingsTitle"),
  settingsSubtitle: $("settingsSubtitle"),
  providerSelect: $("providerSelect"),
  modelSelect: $("modelSelect"),
  modelSelectRow: $("modelSelectRow"),
  customModelRow: $("customModelRow"),
  modelNameInput: $("modelNameInput"),
  baseUrlInput: $("baseUrlInput"),
  apiKeyInput: $("apiKeyInput"),
  apiKeyHelp: $("apiKeyHelp"),
  authHeaderInput: $("authHeaderInput"),
  languageSelect: $("languageSelect"),
  effortSelect: $("effortSelect"),
  effortHelp: $("effortHelp"),
  contextInput: $("contextInput"),
  contextEffectiveValue: $("contextEffectiveValue"),
  maxTokensInput: $("maxTokensInput"),
  temperatureInput: $("temperatureInput"),
  thinkingOn: $("thinkingOn"),
  thinkingOff: $("thinkingOff"),
  preserveReasoningInput: $("preserveReasoningInput"),
  webSearchOn: $("webSearchOn"),
  webSearchOff: $("webSearchOff"),
  webSearchMaxResultsInput: $("webSearchMaxResultsInput"),
  webBraveInput: $("webBraveInput"),
  webTavilyInput: $("webTavilyInput"),
  webSerperInput: $("webSerperInput"),
  webSearxngInput: $("webSearxngInput"),
  webBraveHelp: $("webBraveHelp"),
  webTavilyHelp: $("webTavilyHelp"),
  webSerperHelp: $("webSerperHelp"),
  webSearxngHelp: $("webSearxngHelp"),
  cacheStatusValue: $("cacheStatusValue"),
  cacheDetailsButton: $("cacheDetailsButton"),
  settingsDataRootValue: $("settingsDataRootValue"),
  openDataFromSettingsButton: $("openDataFromSettingsButton"),
  themeModeLight: $("themeModeLight"),
  themeModeDark: $("themeModeDark"),
  themeModeSystem: $("themeModeSystem"),
  themePresetSelect: $("themePresetSelect"),
  foregroundColorInput: $("foregroundColorInput"),
  uiFontInput: $("uiFontInput"),
  codeFontInput: $("codeFontInput"),
  uiFontSizeInput: $("uiFontSizeInput"),
  codeFontSizeInput: $("codeFontSizeInput"),
  densitySelect: $("densitySelect"),
  translucentSidebarInput: $("translucentSidebarInput"),
  contrastInput: $("contrastInput"),
  pointerCursorInput: $("pointerCursorInput"),
  motionModeButtons: [...document.querySelectorAll("[data-motion-mode]")],
  resetAppearanceButton: $("resetAppearanceButton"),
  testButton: $("testButton"),
  saveButton: $("saveButton"),
  toastHost: $("toastHost"),
  terminalPanel: $("terminalPanel"),
  terminalCwdLabel: $("terminalCwdLabel"),
  terminalRestartButton: $("terminalRestartButton"),
  terminalCloseButton: $("terminalCloseButton"),
  terminalContainer: $("terminalContainer"),
  researchWorkbench: $("researchWorkbench"),
  researchSplitHandle: $("researchSplitHandle"),
  researchQueryInput: $("researchQueryInput"),
  researchSearchButton: $("researchSearchButton"),
  researchSearchStatus: $("researchSearchStatus"),
  researchSourceStatus: $("researchSourceStatus"),
  researchSourcesList: $("researchSourcesList"),
  researchResults: $("researchResults"),
  paperCardPanel: $("paperCardPanel"),
  paperEvidencePanel: $("paperEvidencePanel"),
  reloadGraphButton: $("reloadGraphButton"),
  paperGraphCanvas: $("paperGraphCanvas"),
  repoAuditInput: $("repoAuditInput"),
  repoAuditButton: $("repoAuditButton"),
  trickScoreButton: $("trickScoreButton"),
  exportReportButton: $("exportReportButton"),
  repoAuditStatus: $("repoAuditStatus"),
  repoAuditReport: $("repoAuditReport"),
  trickScoreReport: $("trickScoreReport"),
  serverMonitorPanel: $("serverMonitorPanel"),
  sshHostInput: $("sshHostInput"),
  sshPortInput: $("sshPortInput"),
  sshUserInput: $("sshUserInput"),
  sshPasswordInput: $("sshPasswordInput"),
  sshConnectButton: $("sshConnectButton"),
  sshDisconnectButton: $("sshDisconnectButton"),
  sshCommandInput: $("sshCommandInput"),
  sshSendCommandButton: $("sshSendCommandButton"),
  sshMonitorCommandInput: $("sshMonitorCommandInput"),
  sshMonitorIntervalInput: $("sshMonitorIntervalInput"),
  sshStartMonitorButton: $("sshStartMonitorButton"),
  sshStopMonitorButton: $("sshStopMonitorButton"),
  sshOutput: $("sshOutput"),
  researchOpenAlexInput: $("researchOpenAlexInput"),
  researchSemanticScholarInput: $("researchSemanticScholarInput"),
  researchGithubInput: $("researchGithubInput"),
  researchCrossrefMailtoInput: $("researchCrossrefMailtoInput"),
  openAlexKeyHelp: $("openAlexKeyHelp"),
  semanticScholarKeyHelp: $("semanticScholarKeyHelp"),
  githubTokenHelp: $("githubTokenHelp"),
  crossrefMailtoHelp: $("crossrefMailtoHelp"),
};

boot().catch((error) => {
  console.error(error);
  toast(error.message || String(error), true);
});

async function boot() {
  configureMarkdown();
  applyLanguage("zh-CN");
  bindEvents();
  await loadBrandIcon();
  state.core = await window.deepx.getCoreInfo();
  state.paths = await window.deepx.getPaths().catch(() => null);
  updateCoreStatus();
  updateUpdateStatus();
  await loadInitialData();
  await loadSessions();
  setupTerminalDataListener();
  setupSshDataListener();
  setupUpdateStatusListener();
  updateSendButton();
}

function configureMarkdown() {
  if (!window.marked) return;
  window.marked.setOptions({
    gfm: true,
    breaks: false,
  });
}

async function loadBrandIcon() {
  try {
    let url = null;
    for (const asset of ["YR.png", "rainy-research-assets/icon.png", "deepx-assets/icon.png"]) {
      try {
        url = await window.deepx.getAssetUrl(asset);
        break;
      } catch {
        url = null;
      }
    }
    if (url && el.brandIcon) {
      el.brandIcon.src = url;
    }
  } catch (error) {
    console.warn("Failed to load brand icon", error);
  }
}

async function loadInitialData() {
  const health = await api("/health");
  const providersPayload = await api("/providers").catch((error) => {
    toast(`${t("streamError")}: ${error.message || error}`, true);
    return { providers: health.providers || [] };
  });
  let config = { settings: {}, configuredProviders: {} };
  try {
    config = await api("/config");
  } catch (error) {
    toast(`${t("streamError")}: ${error.message || error}`, true);
  }
  state.providers = providersPayload.providers || health.providers || [];
  state.settings = config.settings || {};
  state.configuredProviders = config.configuredProviders || {};
  state.configuredResearchSources = config.configuredResearchSources || {};
  state.configuredWebSearch = config.configuredWebSearch || {};
  normalizeLegacySettings();
  applySettingsToState();
  populateProviders();
  populateThemePresets();
  applySettingsToForm();
  applyAppearanceFromSettings();
  renderPermissionMenu();
  renderEffortMenu();
  updateProviderStatus();
  updateResearchSourceStatus();
  renderResearchSources();
  renderResearchResults();
  renderPaperCard();
  renderPaperGraph();
  renderRepoAudit();
  renderTrickScore();
  updateWorkspaceLabel();
  renderProjects();
  updateCacheStatus();
  updateLanguageOptions();
  updateContextLabels();
  if (state.workspace) {
    void ensureWorkspacePrepared({ immediate: false }).catch((error) => {
      console.warn("Workspace preparation failed", error);
      return null;
    });
  }
  if (!state.configuredProviders[state.settings.providerId]) {
    showSettings("models");
  }
}

function normalizeLegacySettings() {
  if (state.settings.appearanceTheme === LEGACY_THEME_DARK) {
    state.settings.appearanceTheme = "rainy-research-default";
  }
  if (state.settings.appearanceTheme === LEGACY_THEME_LIGHT) {
    state.settings.appearanceTheme = "rainy-research-light";
  }
  if (state.settings.appearanceTheme === "deepx-default") {
    state.settings.appearanceTheme = "rainy-research-default";
  }
  if (state.settings.appearanceTheme === "deepx-light") {
    state.settings.appearanceTheme = "rainy-research-light";
  }
}

function applySettingsToState() {
  state.language = normalizeLanguage(state.settings.language);
  state.thinkingEnabled = state.settings.thinkingEnabled !== false;
  state.webSearchEnabled = !!state.settings.webSearchEnabled;
  state.permissionMode = normalizePermissionMode(state.settings.permissionMode || "default");
  state.workspace = state.settings.workspacePath || null;
  state.projects = normalizeProjects(state.settings.workspaceHistory || [], state.workspace);
  state.sidebarWidth = clampInt(state.settings.sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT);
  state.sidebarCollapsed = !!state.settings.sidebarCollapsed;
  state.researchSplitWidth = readResearchSplitWidth();
  resetWorkspaceSetupState();
  document.documentElement.lang = state.language;
  applySidebarState(false);
  applyResearchSplitWidth(state.researchSplitWidth);
}

function bindEvents() {
  el.sidebarToggleButton.addEventListener("click", toggleSidebar);
  el.sidebarResizeHandle.addEventListener("pointerdown", startSidebarResize);
  el.researchSplitHandle?.addEventListener("pointerdown", startResearchSplitResize);
  el.workspaceButton.addEventListener("click", selectWorkspace);
  el.serverMonitorButton.addEventListener("click", toggleServerMonitorPanel);
  el.newSessionButton.addEventListener("click", newSession);
  el.addContextButton.addEventListener("click", addContextFiles);
  el.settingsButton.addEventListener("click", () => showSettings("general"));
  el.openDataButton.addEventListener("click", () => window.deepx.openDataDir());
  el.openDataFromSettingsButton.addEventListener("click", () => window.deepx.openDataDir());
  el.checkUpdateButton.addEventListener("click", checkAppUpdate);
  el.installUpdateButton.addEventListener("click", installAppUpdate);
  el.updateBannerInstallButton.addEventListener("click", installAppUpdate);
  el.updateBannerDismissButton.addEventListener("click", () => {
    state.updateDismissedVersion = state.updateInfo?.latestVersion || null;
    updateUpdateBanner();
  });
  el.closeSettingsButton.addEventListener("click", hideSettings);
  el.closeSettingsIconButton.addEventListener("click", hideSettings);
  document.querySelectorAll("[data-settings-target]").forEach((button) => {
    button.addEventListener("click", () => showSettings(button.dataset.settingsTarget || "general"));
  });
  el.cacheDetailsButton.addEventListener("click", hideSettings);
  el.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
  el.messageInput.addEventListener("input", () => {
    autoresizeComposer();
    updateSendButton();
  });
  el.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  el.providerSelect.addEventListener("change", onProviderChanged);
  el.modelSelect.addEventListener("change", onModelChanged);
  el.modelNameInput.addEventListener("input", updateModelChips);
  el.contextInput.addEventListener("input", updateContextLabels);
  el.languageSelect.addEventListener("change", () => {
    state.language = normalizeLanguage(el.languageSelect.value);
    applyLanguage(state.language);
  });
  el.webSearchButton.addEventListener("click", () => {
    state.webSearchEnabled = !state.webSearchEnabled;
    updateWebSearchControls();
  });
  el.webSearchOn.addEventListener("click", () => {
    state.webSearchEnabled = true;
    updateWebSearchControls();
  });
  el.webSearchOff.addEventListener("click", () => {
    state.webSearchEnabled = false;
    updateWebSearchControls();
  });
  el.permissionButton.addEventListener("click", (event) => {
    renderPermissionMenu();
    togglePopover(el.permissionMenu, el.permissionButton, event);
  });
  el.effortMenuButton.addEventListener("click", (event) => togglePopover(el.effortMenu, el.effortMenuButton, event));
  el.providerMiniButton.addEventListener("click", () => showSettings("models"));
  el.contextMiniButton.addEventListener("click", () => showSettings("models"));
  el.terminalToggleButton.addEventListener("click", () => toggleTerminal());
  el.terminalCloseButton.addEventListener("click", () => toggleTerminal(false));
  el.terminalRestartButton.addEventListener("click", restartTerminal);
  el.sshConnectButton?.addEventListener("click", connectSsh);
  el.sshDisconnectButton?.addEventListener("click", disconnectSsh);
  el.sshSendCommandButton?.addEventListener("click", sendSshCommand);
  el.sshCommandInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendSshCommand();
    }
  });
  el.sshStartMonitorButton?.addEventListener("click", startSshMonitor);
  el.sshStopMonitorButton?.addEventListener("click", stopSshMonitor);
  window.addEventListener("resize", () => applyResearchSplitWidth(state.researchSplitWidth));
  el.testButton.addEventListener("click", testConnection);
  el.saveButton.addEventListener("click", saveConfig);
  el.resetAppearanceButton.addEventListener("click", resetAppearance);
  bindResearchEvents();

  [el.themeModeLight, el.themeModeDark, el.themeModeSystem].forEach((button) => {
    button.addEventListener("click", () => {
      setThemeMode(button.dataset.themeMode);
      applyThemeModeDefaults(button.dataset.themeMode);
      applyAppearanceFromForm();
    });
  });
  [
    el.themePresetSelect,
    el.foregroundColorInput,
    el.uiFontInput,
    el.codeFontInput,
    el.densitySelect,
    el.translucentSidebarInput,
    el.contrastInput,
    el.pointerCursorInput,
  ].filter(Boolean).forEach((input) => {
    input.addEventListener("input", applyAppearanceFromForm);
    input.addEventListener("change", applyAppearanceFromForm);
  });
  el.motionModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMotionMode(button.dataset.motionMode);
      applyAppearanceFromForm();
    });
  });
  el.themePresetSelect.addEventListener("change", applyPresetToForm);
  document.addEventListener("dragover", handleFileDragOver, true);
  document.addEventListener("drop", handleFileDrop, true);
  document.addEventListener("dragleave", () => el.composer.classList.remove("drag-over"));
  el.composer.addEventListener("dragover", handleFileDragOver);
  el.composer.addEventListener("drop", handleFileDrop);
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
    if (selectedThemeMode() === "system") {
      applyThemeModeDefaults("system");
      applyAppearanceFromForm();
    }
  });
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener?.("change", () => {
    if (selectedMotionMode() === "system") applyAppearanceFromForm();
  });

  document.addEventListener("click", (event) => {
    closePopoverOnOutside(event, el.permissionMenu, el.permissionButton);
    closePopoverOnOutside(event, el.effortMenu, el.effortMenuButton);
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
      event.preventDefault();
      toggleTerminal();
    }
    if (event.key === "Escape") {
      closeAllPopovers();
      if (!el.settingsOverlay.classList.contains("hidden")) hideSettings();
    }
  });
  window.addEventListener("resize", () => {
    fitTerminal();
  });
}

async function api(path, options = {}) {
  if (!state.core?.baseUrl && path !== "/health") {
    state.core = await window.deepx.getCoreInfo();
  }
  const baseUrl = state.core?.baseUrl;
  if (!baseUrl) {
    throw new Error(`${APP_BRAND} core is not ready`);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.error || payload.message || JSON.stringify(payload);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `HTTP ${response.status}`);
  }
  return response.json();
}

function applyLanguage(language) {
  state.language = normalizeLanguage(language);
  const dict = I18N[state.language];
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const value = t(node.dataset.i18nTitle);
    node.title = value;
    node.setAttribute("aria-label", value);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  el.languageSelect.querySelector('option[value="zh-CN"]').textContent = "中文";
  el.languageSelect.querySelector('option[value="en-US"]').textContent = "English";
  el.densitySelect.querySelector('option[value="compact"]').textContent = dict.densityCompact;
  el.densitySelect.querySelector('option[value="comfortable"]').textContent = dict.densityComfortable;
  el.densitySelect.querySelector('option[value="spacious"]').textContent = dict.densitySpacious;
  populateThemePresets();
  el.themePresetSelect.value = normalizeTheme(state.settings.appearanceTheme || el.themePresetSelect.value);
  renderPermissionMenu();
  renderEffortMenu();
  updatePermissionButton();
  updateWebSearchControls();
  updateProviderStatus();
  updateContextLabels();
  updateCacheStatus();
  updateUpdateStatus();
  updateResearchSourceStatus();
  renderResearchSources();
  renderResearchResults();
  renderPaperCard();
  renderPaperGraph();
  renderRepoAudit();
  renderTrickScore();
  renderProjects();
  renderSessions();
}

function t(key, values = {}) {
  const template = I18N[state.language]?.[key] || I18N["zh-CN"][key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function normalizeLanguage(value) {
  return value === "en-US" ? "en-US" : "zh-CN";
}

function updateLanguageOptions() {
  el.languageSelect.value = state.language;
  applyLanguage(state.language);
}

function updateCoreStatus() {
  const text = state.core?.version ? `${t("coreReady")} : ${state.core.version}` : t("coreStarting");
  el.providerStatus.textContent = text;
  if (state.core?.dataRoot) {
    el.settingsDataRootValue.textContent = state.core.dataRoot;
  }
  updateUpdateStatus();
}

function appVersionLabel(version = currentAppVersion()) {
  const normalized = normalizeVersionLabel(version);
  return `v${normalized}`;
}

function normalizeVersionLabel(version) {
  let raw;
  if (Array.isArray(version)) {
    raw = version.join(".");
  } else if (version && typeof version === "object") {
    const parts = ["major", "minor", "patch"].map((key) => version[key]).filter((part) => part !== undefined);
    raw = parts.length ? parts.join(".") : String(version);
  } else {
    raw = String(version || "0.0.0");
  }
  const normalized = raw.trim().replace(/^v/i, "").replace(/[，,]+/g, ".");
  return normalized.match(/\d+(?:\.\d+)*/)?.[0] || "0.0.0";
}

function currentAppVersion() {
  return state.paths?.appVersion || state.core?.appVersion || "0.0.0";
}

function updateUpdateStatus(message) {
  if (!el.updateStatusValue) return;
  const info = state.updateInfo;
  let text = message || t("updateIdle", { version: appVersionLabel() });
  if (!message && info?.updateAvailable) {
    text = t("updateAvailable", { version: appVersionLabel(info.latestVersion) });
    if (!info.canInstall) text = `${text} · ${t("updateUnavailableInDev")}`;
  } else if (!message && info && !info.updateAvailable) {
    text = t("updateUpToDate", { version: appVersionLabel(info.currentVersion || currentAppVersion()) });
  }
  if (!message && info?.source === "release-page") {
    text = `${text} ${t("updateApiFallback")}`;
  }
  el.updateStatusValue.textContent = text;
  el.checkUpdateButton.disabled = !!state.updateBusy;
  const canInstall = !!info?.updateAvailable && info.canInstall !== false;
  el.installUpdateButton.classList.toggle("hidden", !canInstall);
  el.installUpdateButton.disabled = !!state.updateBusy || !canInstall;
  updateUpdateBanner(message);
}

function updateUpdateBanner(message) {
  if (!el.updateBanner) return;
  const info = state.updateInfo;
  const canShow = !!info?.updateAvailable && info.canInstall !== false && state.updateDismissedVersion !== info.latestVersion && !message;
  el.updateBanner.classList.toggle("hidden", !canShow);
  if (!canShow) return;
  const version = appVersionLabel(info.latestVersion);
  el.updateBannerTitle.textContent = t("updateBannerTitle");
  el.updateBannerText.textContent = t("updateBannerText", { version });
  el.updateBannerInstallButton.disabled = !!state.updateBusy;
}

async function checkAppUpdate() {
  state.updateBusy = true;
  updateUpdateStatus(t("checkingUpdate"));
  let failed = false;
  try {
    const info = await window.deepx.checkForUpdates();
    state.updateInfo = info;
    if (!info.updateAvailable) {
      state.updateDismissedVersion = null;
    }
    updateUpdateStatus();
  } catch (error) {
    failed = true;
    console.error(error);
    updateUpdateStatus(`${t("updateFailed")}: ${error.message || error}`);
  } finally {
    state.updateBusy = false;
    if (!failed) updateUpdateStatus();
  }
}

async function installAppUpdate() {
  if (!state.updateInfo?.updateAvailable) {
    await checkAppUpdate();
  }
  if (!state.updateInfo?.updateAvailable) return;
  state.updateBusy = true;
  updateUpdateStatus(t("updateDownloading", { percent: 0 }));
  try {
    const result = await window.deepx.installUpdate();
    if (result && result.updateAvailable === false) {
      state.updateBusy = false;
      state.updateInfo = { ...state.updateInfo, updateAvailable: false };
      updateUpdateStatus();
    }
  } catch (error) {
    console.error(error);
    state.updateBusy = false;
    updateUpdateStatus(`${t("updateFailed")}: ${error.message || error}`);
  }
}

function setupUpdateStatusListener() {
  if (!window.deepx.onUpdateStatus) return;
  window.deepx.onUpdateStatus((payload) => {
    if (!payload?.status) return;
    if (payload.status === "downloading") {
      const percent = payload.total ? Math.floor((payload.received / payload.total) * 100) : 0;
      updateUpdateStatus(t("updateDownloading", { percent }));
    } else if (payload.status === "extracting") {
      updateUpdateStatus(t("updateExtracting"));
    } else if (payload.status === "installing") {
      updateUpdateStatus(t("updateInstalling"));
    }
  });
}

function populateProviders() {
  el.providerSelect.innerHTML = "";
  for (const provider of state.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.displayName || provider.id;
    el.providerSelect.appendChild(option);
  }
  if (!state.providers.some((provider) => provider.id === "custom")) {
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "OpenAI-compatible";
    el.providerSelect.appendChild(custom);
  }
  el.providerSelect.value = state.settings.providerId || "deepseek";
  populateModels();
}

function populateModels() {
  const provider = currentProvider();
  el.modelSelect.innerHTML = "";
  if (provider?.models?.length) {
    for (const model of provider.models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.displayName || model.id;
      el.modelSelect.appendChild(option);
    }
    el.modelSelectRow.classList.remove("hidden");
    el.customModelRow.classList.add("hidden");
    const model = state.settings.model || provider.defaultModel || provider.models[0].id;
    el.modelSelect.value = provider.models.some((item) => item.id === model) ? model : provider.models[0].id;
  } else {
    el.modelSelectRow.classList.add("hidden");
    el.customModelRow.classList.remove("hidden");
    el.modelNameInput.value = state.settings.model || "";
  }
  updateModelDefaults(false);
}

function populateThemePresets() {
  const selected = el.themePresetSelect.value;
  el.themePresetSelect.innerHTML = "";
  for (const preset of THEME_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = themePresetLabel(preset);
    el.themePresetSelect.appendChild(option);
  }
  if (selected) {
    el.themePresetSelect.value = normalizeTheme(selected);
  }
}

function themePresetLabel(preset) {
  return state.language === "zh-CN" ? (preset.labelZh || preset.labelEn || preset.id) : (preset.labelEn || preset.labelZh || preset.id);
}

function currentThemePreset() {
  return THEME_PRESETS.find((item) => item.id === normalizeTheme(el.themePresetSelect?.value)) || THEME_PRESETS[0];
}

function applySettingsToForm() {
  const settings = state.settings;
  const mode = settings.appearanceMode || "dark";
  const dark = mode === "dark" || (mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  el.languageSelect.value = state.language;
  el.providerSelect.value = settings.providerId || "deepseek";
  populateModels();
  if (currentProvider()?.models?.length) {
    el.modelSelect.value = settings.model || currentProvider().defaultModel;
  } else {
    el.modelNameInput.value = settings.model || "";
  }
  el.baseUrlInput.value = settings.baseUrl || currentProvider()?.baseUrl || "";
  el.authHeaderInput.value = settings.authHeaderName || currentProvider()?.auth?.headerName || "Authorization";
  el.contextInput.value = settings.contextWindow || currentModel()?.contextWindow || currentProvider()?.contextWindow || 128000;
  el.maxTokensInput.value = settings.maxTokens || currentModel()?.maxOutputTokens || currentProvider()?.maxOutputTokens || 8192;
  el.temperatureInput.value = settings.temperature ?? 0.2;
  el.preserveReasoningInput.checked = !!settings.preserveReasoning;
  state.thinkingEnabled = settings.thinkingEnabled !== false;
  state.webSearchEnabled = !!settings.webSearchEnabled;
  state.permissionMode = normalizePermissionMode(settings.permissionMode || "default");
  el.webSearchMaxResultsInput.value = settings.webSearchMaxResults || 5;
  setThemeMode(mode);
  el.themePresetSelect.value = normalizeTheme(settings.appearanceTheme);
  el.foregroundColorInput.value = safeColor(settings.foregroundColor, dark ? "#fcfcfc" : "#0d0d0d");
  el.uiFontInput.value = settings.uiFont || DEFAULT_UI_FONT;
  el.codeFontInput.value = settings.codeFont || DEFAULT_CODE_FONT;
  el.uiFontSizeInput.value = DEFAULT_UI_FONT_SIZE;
  el.codeFontSizeInput.value = DEFAULT_CODE_FONT_SIZE;
  el.densitySelect.value = normalizeDensity(settings.density || "comfortable");
  el.translucentSidebarInput.checked = !!settings.translucentSidebar;
  el.contrastInput.value = clampInt(settings.contrast, 35, 85, 60);
  el.pointerCursorInput.checked = settings.pointerCursor !== false;
  setMotionMode(settings.motionMode || "system");
  updateApiKeyHelp();
  updateResearchSourceStatus();
  updateWebSearchControls();
  updatePermissionButton();
  updateModelChips();
  updateContextLabels();
}

function updateApiKeyHelp() {
  const providerId = el.providerSelect.value || state.settings.providerId;
  if (state.configuredProviders[providerId]) {
    el.apiKeyHelp.textContent = t("apiKeyConfigured");
  } else {
    el.apiKeyHelp.textContent = t("apiKeyMissing");
  }
}

function currentProvider() {
  const id = el.providerSelect?.value || state.settings.providerId || "deepseek";
  return state.providers.find((provider) => provider.id === id) || null;
}

function currentModel() {
  const provider = currentProvider();
  const id = provider?.models?.length ? el.modelSelect.value : el.modelNameInput.value;
  return provider?.models?.find((model) => model.id === id) || null;
}

function selectedModelId() {
  const provider = currentProvider();
  if (provider?.models?.length) return el.modelSelect.value || provider.defaultModel;
  return el.modelNameInput.value.trim();
}

function onProviderChanged() {
  const provider = currentProvider();
  state.settings.providerId = el.providerSelect.value;
  if (provider) {
    el.baseUrlInput.value = provider.baseUrl || "";
    el.authHeaderInput.value = provider.auth?.headerName || "Authorization";
    state.settings.model = provider.defaultModel || provider.models?.[0]?.id || "";
  }
  updateApiKeyHelp();
  populateModels();
  renderEffortMenu();
  updateProviderStatus();
  updateContextLabels();
}

function onModelChanged() {
  updateModelDefaults(true);
  renderEffortMenu();
  updateModelChips();
}

function updateModelDefaults(applyValues) {
  const provider = currentProvider();
  const model = currentModel();
  if (applyValues && model) {
    el.contextInput.value = model.contextWindow || provider?.contextWindow || el.contextInput.value;
    el.maxTokensInput.value = model.maxOutputTokens || provider?.maxOutputTokens || el.maxTokensInput.value;
    const thinking = model.thinking;
    state.thinkingEnabled = !!thinking?.supported;
    if (thinking?.defaultEffort) {
      state.settings.reasoningEffort = thinking.defaultEffort;
    }
  }
  updateContextLabels();
  updateModelChips();
}

function selectedThinking() {
  const model = currentModel();
  const provider = currentProvider();
  const thinking = model?.thinking || {
    supported: !!provider?.supportsThinking,
    kind: "effort",
    effortValues: ["medium"],
    defaultEffort: "medium",
    requestMapping: "",
  };
  return thinking;
}

function selectedEffort() {
  const thinking = selectedThinking();
  const values = thinking.effortValues || [];
  const current = state.settings.reasoningEffort || thinking.defaultEffort || values[0] || "medium";
  return values.includes(current) ? current : (thinking.defaultEffort || values[0] || current);
}

function renderEffortMenu() {
  const thinking = selectedThinking();
  el.effortMenu.innerHTML = "";
  const enabled = buttonMenuItem({
    title: t("thinkingEnabled"),
    help: thinkingEnabledHelp(thinking),
    selected: state.thinkingEnabled && !!thinking.supported,
    action: () => {
      state.thinkingEnabled = true;
      if (thinking.defaultEffort) state.settings.reasoningEffort = selectedEffort();
      renderEffortMenu();
      updateModelChips();
      closeAllPopovers();
    },
  });
  enabled.disabled = !thinking.supported;
  el.effortMenu.appendChild(enabled);
  el.effortMenu.appendChild(buttonMenuItem({
    title: t("thinkingDisabled"),
    help: t("thinkingDisabledHelp"),
    selected: !state.thinkingEnabled || !thinking.supported,
    action: () => {
      state.thinkingEnabled = false;
      renderEffortMenu();
      updateModelChips();
      closeAllPopovers();
    },
  }));
  if (thinking.supported) {
    for (const effort of thinking.effortValues || []) {
      el.effortMenu.appendChild(buttonMenuItem({
        title: effortLabel(effort),
        help: providerEffortHelp(thinking, effort),
        selected: state.thinkingEnabled && selectedEffort() === effort,
        action: () => {
          state.thinkingEnabled = true;
          state.settings.reasoningEffort = effort;
          renderEffortMenu();
          updateModelChips();
          closeAllPopovers();
        },
      }));
    }
  }
  updateModelChips();
}

function thinkingEnabledHelp(thinking) {
  if (!thinking.supported) {
    return state.language === "zh-CN" ? "当前模型不支持思考参数。" : "This model does not support thinking parameters.";
  }
  if (thinking.kind === "budget") {
    return state.language === "zh-CN"
      ? `使用思考预算；上限 ${formatNumber(thinking.maxBudgetTokens || 0)} tokens。`
      : `Uses thinking budget; max ${formatNumber(thinking.maxBudgetTokens || 0)} tokens.`;
  }
  if (thinking.kind === "toggle" || thinking.kind === "adaptive") {
    return t("thinkingEnabledHelp");
  }
  return state.language === "zh-CN"
    ? "开启后可选择该模型支持的思考强度。"
    : "Enable it to choose a supported reasoning effort for this model.";
}

function effortLabel(effort) {
  const raw = String(effort || "").trim();
  const key = {
    low: "effortLow",
    medium: "effortMedium",
    high: "effortHigh",
    xhigh: "effortXhigh",
    max: "effortMax",
  }[raw.toLowerCase()];
  return key ? `${t(key)} (${raw})` : raw;
}

function providerEffortHelp(thinking, effort) {
  const provider = currentProvider();
  const mapping = thinking.requestMapping || "provider thinking parameter";
  const effective = effectiveProviderEffort(provider?.id, effort);
  if (state.language === "zh-CN") {
    if (provider?.id === "deepseek" && effective !== effort) {
      return `${t("effortCompatible", { from: effort, to: effective })} ${t("effortOfficial", { mapping: "thinking.type + reasoning_effort(high|max)" })}`;
    }
    return `${t("effortEffective", { value: effective })}。${t("effortOfficial", { mapping })}`;
  }
  if (provider?.id === "deepseek" && effective !== effort) {
    return `${t("effortCompatible", { from: effort, to: effective })} ${t("effortOfficial", { mapping: "thinking.type + reasoning_effort(high|max)" })}`;
  }
  return `${t("effortEffective", { value: effective })}. ${t("effortOfficial", { mapping })}`;
}

function effectiveProviderEffort(providerId, effort) {
  const normalized = String(effort || "").trim().toLowerCase();
  if (providerId === "deepseek") {
    return normalized === "max" || normalized === "xhigh" ? "max" : "high";
  }
  if (normalized === "max" || normalized === "xhigh") return "high";
  if (["low", "medium", "high"].includes(normalized)) return normalized;
  return normalized || "medium";
}

function buttonMenuItem({ title, help, selected, action }) {
  const button = document.createElement("button");
  button.className = `popover-item${selected ? " selected" : ""}`;
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.innerHTML = `<span class="popover-copy"><strong></strong><small></small></span><span class="checkmark" aria-hidden="true">${selected ? "\u2713" : ""}</span>`;
  button.querySelector("strong").textContent = title;
  button.querySelector("small").textContent = help || "";
  button.addEventListener("click", action);
  return button;
}

function renderPermissionMenu() {
  if (!el.permissionMenu) return;
  const meta = {
    default: ["permissionDefault", "permissionDefaultHelp"],
    "auto-review": ["permissionAuto", "permissionAutoHelp"],
    "full-access": ["permissionFull", "permissionFullHelp"],
    custom: ["permissionCustom", "permissionCustomHelp"],
  };
  el.permissionMenu.innerHTML = "";
  for (const mode of PERMISSION_MODES) {
    const [title, help] = meta[mode];
    el.permissionMenu.appendChild(buttonMenuItem({
      title: t(title),
      help: t(help),
      selected: state.permissionMode === mode,
      action: () => {
        setPermissionMode(mode);
        closeAllPopovers();
      },
    }));
  }
}

async function setPermissionMode(mode) {
  const normalized = normalizePermissionMode(mode);
  state.permissionMode = normalized;
  state.settings.permissionMode = normalized;
  updatePermissionButton();
  renderPermissionMenu();
  try {
    const response = await api("/config", {
      method: "POST",
      body: JSON.stringify({ permissionMode: normalized }),
    });
    state.settings = response.settings || state.settings;
    state.permissionMode = normalizePermissionMode(state.settings.permissionMode || normalized);
    updatePermissionButton();
    renderPermissionMenu();
  } catch (error) {
    console.warn("Failed to save permission mode", error);
    toast(`${t("saveFailed")}: ${error.message || error}`, true);
  }
}

function updatePermissionButton() {
  const labels = {
    default: t("permissionDefault"),
    "auto-review": t("permissionAuto"),
    "full-access": t("permissionFull"),
    custom: t("permissionCustom"),
  };
  el.permissionLabel.textContent = labels[state.permissionMode] || labels.custom;
}

function updateWebSearchControls() {
  el.webSearchButton.classList.toggle("active", state.webSearchEnabled);
  el.webSearchButton.setAttribute("aria-pressed", String(state.webSearchEnabled));
  el.webSearchOn.classList.toggle("active", state.webSearchEnabled);
  el.webSearchOff.classList.toggle("active", !state.webSearchEnabled);
  const configured = state.configuredWebSearch || {};
  const help = {
    webBraveHelp: configured.brave,
    webTavilyHelp: configured.tavily,
    webSerperHelp: configured.serper,
    webSearxngHelp: configured.searxng,
  };
  for (const [id, ok] of Object.entries(help)) {
    const node = el[id];
    if (!node) continue;
    const base = t(id);
    node.textContent = ok ? `${t("sourceConfigured")}; ${t("apiKeyOptional")}` : `${t("sourceMissing")}; ${base}`;
  }
}

function updateModelChips() {
  const provider = currentProvider();
  const model = selectedModelId() || state.settings.model || provider?.defaultModel || "";
  const providerLabel = provider?.displayName || provider?.id || t("providerFallback");
  const effort = state.thinkingEnabled && selectedThinking().supported ? selectedEffort() : "off";
  el.providerMiniButton.textContent = providerLabel;
  el.effortButtonText.textContent = effort;
}

function updateContextLabels() {
  const value = numberValue(el.contextInput, state.settings.contextWindow || 128000);
  const formatted = formatContext(value);
  el.contextMiniButton.textContent = formatted;
  el.contextEffectiveValue.textContent = t("contextEffective", { value: formatted });
}

function updateProviderStatus() {
  const provider = currentProvider() || state.providers.find((item) => item.id === state.settings.providerId);
  const providerLabel = provider?.displayName || provider?.id || APP_BRAND;
  const configured = state.configuredProviders[provider?.id || state.settings.providerId];
  el.providerStatus.textContent = configured
    ? t("statusConfigured", { provider: providerLabel })
    : t("statusMissingKey", { provider: providerLabel });
}

function showResearchTab(tab) {
  state.research.tab = tab;
  document.querySelectorAll("[data-research-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.researchTab === tab);
  });
  document.querySelectorAll("[data-research-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.researchPanel === tab);
  });
}

function updateResearchSourceStatus() {
  const configured = state.configuredResearchSources || {};
  const provider = currentProvider() || state.providers.find((item) => item.id === state.settings.providerId);
  const providerId = provider?.id || state.settings.providerId;
  const aiConfigured = !!state.configuredProviders[providerId];
  const configuredSourceCount = ["openalex", "semanticScholar", "github", "crossref"].filter((key) => !!configured[key]).length;
  const sourceLabel = state.language === "en-US" ? "Paper sources" : "论文源";
  const configuredText = state.language === "en-US" ? `${configuredSourceCount}/4 configured` : `${configuredSourceCount}/4 已配置`;
  const sources = [
    [t("aiAnalysis"), aiConfigured ? t("sourceConfigured") : t("sourceMissing"), aiConfigured],
    [sourceLabel, configuredText, configuredSourceCount > 0],
  ];
  if (el.researchSourceStatus) {
    el.researchSourceStatus.innerHTML = "";
    for (const [label, value, ok] of sources) {
      const pill = document.createElement("span");
      pill.className = `status-pill ${ok ? "ok" : "warn"}`;
      pill.textContent = `${label}: ${value}`;
      el.researchSourceStatus.appendChild(pill);
    }
  }
  const help = {
    openAlexKeyHelp: configured.openalex,
    semanticScholarKeyHelp: configured.semanticScholar,
    githubTokenHelp: configured.github,
    crossrefMailtoHelp: configured.crossref,
  };
  for (const [id, ok] of Object.entries(help)) {
    if (el[id]) {
      el[id].textContent = ok ? `${t("sourceConfigured")}; ${t("apiKeyOptional")}` : `${t("sourceMissing")}; ${t("localOnlyOk")}`;
    }
  }
}

function sourceDisplayName(source) {
  const key = String(source || "").toLowerCase().replace(/[\s-]+/g, "_");
  const labels = {
    ai: t("aiAnalysis"),
    llm: t("aiAnalysis"),
    local: "本地索引",
    local_index: "本地索引",
    arxiv: "arXiv 预印本",
    crossref: "DOI 元数据",
    openalex: "开放论文库",
    semantic_scholar: "语义学术库",
    semantic: "语义学术库",
    github: "代码仓库",
    github_search: "代码仓库",
  };
  return labels[key] || source || "来源";
}

function userFacingError(error, context = "request") {
  const raw = String(error?.message || error || "").trim();
  const lower = raw.toLowerCase();
  const zh = state.language !== "en-US";
  if (!raw) return zh ? "操作失败，请稍后重试。" : "The operation failed. Try again later.";
  if (
    lower.includes("permissiondenied") ||
    lower.includes("access is denied") ||
    raw.includes("拒绝访问") ||
    lower.includes("failed to open file for write")
  ) {
    return zh
      ? "本地研究数据无法写入，请检查 data/research 权限，或关闭正在占用索引文件的程序后重试。"
      : "Local research data cannot be written. Check data/research permissions or close any process using the index files.";
  }
  if (lower.includes("api key") && lower.includes("not configured")) {
    return zh
      ? "相关来源还没有配置密钥。可以先使用可用来源，也可以到设置里的科研源教程补齐配置。"
      : "The source key is not configured. Use available sources now, or configure it in Research sources.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return zh
      ? "上游来源触发限流。请稍后重试，或在设置中配置对应 API key 提高额度。"
      : "The upstream source is rate limited. Retry later or configure an API key for a higher quota.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return zh ? "上游来源响应超时，雨刃会继续使用其他可用来源。" : "The upstream source timed out. RainyReSearch will keep using available sources.";
  }
  if (lower.includes("network") || lower.includes("dns") || lower.includes("connect") || lower.includes("fetch") || lower.includes("reqwest")) {
    return zh ? "网络连接失败，请检查代理、网络或对应来源服务状态。" : "Network connection failed. Check proxy, network, or source availability.";
  }
  if (context === "search") {
    return zh ? "论文搜索没有完成。请换更具体的标题、DOI、arXiv ID 或作者年份后重试。" : "Paper search did not complete. Try a more specific title, DOI, arXiv ID, or author/year.";
  }
  return truncateText(raw.replace(/\s+/g, " "), 180);
}

function riskLabel(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized.includes("high")) return t("riskHigh");
  if (normalized.includes("medium")) return t("riskMedium");
  if (normalized.includes("low")) return t("riskLow");
  return t("riskUnknown");
}

function riskMetricLabel(label) {
  const labels = {
    code: "代码完整度",
    protocol: "实验协议",
    result: "结果证据",
    novelty: "创新风险",
    community: "社区信号",
    repo: "仓库可信度",
    runtime: "运行环境",
  };
  return labels[label] || label;
}

function renderResearchSources() {
  if (!el.researchSourcesList) return;
  el.researchSourcesList.innerHTML = "";
  const sources = state.research.sources || [];
  if (!sources.length) return;
  const provider = currentProvider() || state.providers.find((item) => item.id === state.settings.providerId);
  const providerId = provider?.id || state.settings.providerId;
  const aiConfigured = !!state.configuredProviders[providerId];
  const displayedSources = [
    {
      source: "ai",
      ok: aiConfigured,
      fetched: state.research.results?.length || 0,
      degraded: !aiConfigured,
      message: aiConfigured ? "已启用 AI 分析" : "未配置模型密钥，AI 分析会降级",
    },
    ...sources,
  ];
  for (const source of displayedSources) {
    const pill = document.createElement("span");
    pill.className = `source-pill ${source.ok ? "ok" : "degraded"}`;
    pill.title = source.message || "";
    pill.textContent = `${sourceDisplayName(source.source)} ${source.fetched ?? 0}${source.degraded ? "（降级）" : ""}`;
    el.researchSourcesList.appendChild(pill);
  }
}

async function searchResearch() {
  const query = el.researchQueryInput?.value.trim() || "";
  if (!query) {
    el.researchQueryInput?.focus();
    return;
  }
  state.research.query = query;
  el.researchSearchButton.disabled = true;
  el.researchSearchStatus.textContent = t("researchSearching");
  try {
    const payload = await api("/research/search", {
      method: "POST",
      body: JSON.stringify({ query, maxResults: 12, useLlm: true }),
    });
    state.research.results = payload.results || [];
    state.research.sources = payload.sources || [];
    state.research.selected = state.research.results[0] || null;
    state.research.graph = null;
    state.research.audit = null;
    state.research.risk = null;
    state.research.ideas = [];
    el.researchSearchStatus.textContent = t("researchSearchDone", { count: state.research.results.length });
    renderResearchSources();
    renderResearchResults();
    renderPaperCard();
    renderRepoAudit();
    renderTrickScore();
    const firstRepo = state.research.selected?.repoCandidates?.[0]?.url || "";
    if (firstRepo && el.repoAuditInput) el.repoAuditInput.value = firstRepo;
    if (state.research.selected?.paper?.id) {
      void loadPaperGraph(state.research.selected.paper.id);
    }
  } catch (error) {
    const detail = userFacingError(error, "search");
    el.researchSearchStatus.textContent = `${t("researchSearchFailed")}：${detail}`;
    toast(`${t("researchSearchFailed")}：${detail}`, true);
  } finally {
    el.researchSearchButton.disabled = false;
  }
}

function renderResearchResults() {
  if (!el.researchResults) return;
  el.researchResults.innerHTML = "";
  const results = state.research.results || [];
  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "paper-card-empty";
    empty.textContent = t("noResearchResults");
    el.researchResults.appendChild(empty);
    return;
  }
  results.forEach((result, index) => {
    const paper = result.paper || {};
    const button = document.createElement("button");
    button.type = "button";
    button.className = `paper-result${state.research.selected === result ? " active" : ""}`;
    button.addEventListener("click", () => selectResearchResult(index));

    const title = document.createElement("div");
    title.className = "paper-result-title";
    title.textContent = paper.title || "未命名论文";

    const meta = document.createElement("div");
    meta.className = "paper-result-meta";
    meta.textContent = [paper.year, paper.venue, (paper.authors || []).slice(0, 3).join(", ")].filter(Boolean).join(" / ");

    const summary = document.createElement("div");
    summary.className = "paper-result-summary";
    summary.textContent = result.llmExplanation || truncateText(paper.abstract || paper.abstractText || "", 220);

    const chips = document.createElement("div");
    chips.className = "paper-result-chips";
    chips.appendChild(paperChip(t("aiAnalysis")));
    for (const source of result.sources || []) chips.appendChild(paperChip(sourceDisplayName(source)));
    chips.appendChild(paperChip(`相关度 ${formatPercent(result.scores?.relevance)}`));
    chips.appendChild(paperChip(`${riskLabel(result.riskPreview?.level)} ${formatScore(result.riskPreview?.score)}`, riskClass(result.riskPreview?.level)));
    if (result.repoCandidates?.length) chips.appendChild(paperChip(`代码 ${result.repoCandidates.length}`));

    button.append(title, meta, summary, chips);
    el.researchResults.appendChild(button);
  });
}

function selectResearchResult(index) {
  const result = state.research.results[index];
  if (!result) return;
  state.research.selected = result;
  state.research.graph = null;
  state.research.audit = null;
  state.research.risk = null;
  renderResearchResults();
  renderPaperCard();
  renderPaperGraph();
  renderRepoAudit();
  renderTrickScore();
  const firstRepo = result.repoCandidates?.[0]?.url || "";
  if (firstRepo && el.repoAuditInput) el.repoAuditInput.value = firstRepo;
  showResearchTab("card");
  el.researchSearchStatus.textContent = t("selectedPaperStatus", { title: truncateText(result.paper?.title || "", 80) });
  if (result.paper?.id) {
    void loadPaperGraph(result.paper.id);
  }
}

function renderPaperCard() {
  if (!el.paperCardPanel) return;
  const selected = state.research.selected;
  el.paperCardPanel.innerHTML = "";
  el.paperCardPanel.className = selected ? "paper-card" : "paper-card-empty";
  el.paperEvidencePanel.innerHTML = "";
  if (!selected) {
    el.paperCardPanel.textContent = t("paperCardEmpty");
    return;
  }
  const paper = selected.paper || {};
  const title = document.createElement("h3");
  title.textContent = paper.title || "未命名论文";
  const meta = document.createElement("div");
  meta.className = "paper-card-meta";
  meta.textContent = [
    paper.year,
    paper.venue,
    (paper.authors || []).slice(0, 6).join(", "),
    paper.doi ? `DOI ${paper.doi}` : "",
    paper.arxivId ? `arXiv ${paper.arxivId}` : "",
  ].filter(Boolean).join(" / ");
  const explanation = document.createElement("p");
  explanation.textContent = selected.llmExplanation || "";
  const abstract = document.createElement("p");
  abstract.textContent = truncateText(paper.abstract || paper.abstractText || "", 900);
  const chips = document.createElement("div");
  chips.className = "paper-card-chips";
  chips.appendChild(paperChip(t("aiAnalysis")));
  for (const source of selected.sources || []) chips.appendChild(paperChip(sourceDisplayName(source)));
  chips.appendChild(paperChip(`引用 ${paper.citationCount ?? 0}`));
  chips.appendChild(paperChip(`复现价值 ${formatPercent(selected.scores?.reproValue)}`));
  chips.appendChild(paperChip(`${riskLabel(selected.riskPreview?.level)} ${formatScore(selected.riskPreview?.score)}`, riskClass(selected.riskPreview?.level)));
  el.paperCardPanel.append(title, meta, chips, explanation, abstract);

  const evidence = [
    ...(selected.dedupEvidence || []),
    ...(selected.riskPreview?.evidence || []),
    ...(selected.repoCandidates || []).flatMap((repo) => repo.evidence || []),
  ];
  renderEvidenceList(el.paperEvidencePanel, evidence, selected.repoCandidates || []);
}

function renderEvidenceList(container, evidence, repos = []) {
  if (!container) return;
  container.innerHTML = "";
  for (const repo of repos.slice(0, 4)) {
    const item = document.createElement("div");
    item.className = "evidence-item";
    item.textContent = `${repo.url} / 官方匹配 ${formatScore(repo.officialScore)}`;
    container.appendChild(item);
  }
  for (const line of evidence.slice(0, 12)) {
    const item = document.createElement("div");
    item.className = "evidence-item";
    item.textContent = line;
    container.appendChild(item);
  }
}

async function loadPaperGraph(paperId) {
  if (!paperId) return;
  el.paperGraphCanvas.textContent = t("graphLoading");
  try {
    const graph = await api(`/research/papers/${encodeURIComponent(paperId)}/graph`);
    state.research.graph = graph;
    renderPaperGraph();
  } catch (error) {
    state.research.graph = { nodes: [], edges: [], error: error.message || String(error) };
    renderPaperGraph();
  }
}

function renderPaperGraph() {
  if (!el.paperGraphCanvas) return;
  el.paperGraphCanvas.innerHTML = "";
  const graph = state.research.graph;
  if (!graph) {
    el.paperGraphCanvas.textContent = state.research.selected ? t("graphLoading") : t("graphEmpty");
    return;
  }
  if (graph.error) {
    el.paperGraphCanvas.textContent = graph.error;
    return;
  }
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  if (!nodes.length) {
    el.paperGraphCanvas.textContent = t("graphEmpty");
    return;
  }
  el.paperGraphCanvas.appendChild(graphSvg(nodes, edges));
  for (const edge of edges.slice(0, 16)) {
    const row = document.createElement("div");
    row.className = "graph-node-row";
    const kind = document.createElement("span");
    kind.className = "graph-node-type";
    kind.textContent = edgeTypeLabel(edge.edgeType);
    const detail = document.createElement("strong");
    detail.textContent = `${nodeLabel(nodes, edge.source)} -> ${nodeLabel(nodes, edge.target)}: ${edge.evidence || ""}`;
    row.append(kind, detail);
    el.paperGraphCanvas.appendChild(row);
  }
}

function graphSvg(nodes, edges) {
  const width = 720;
  const height = 360;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "论文关系图");
  svg.style.width = "100%";
  svg.style.minHeight = "280px";
  svg.style.border = "1px solid var(--border)";
  svg.style.borderRadius = "8px";
  svg.style.background = "var(--surface-0)";
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const positions = new Map();
  nodes.slice(0, 18).forEach((node, index) => {
    if (index === 0 || node.nodeType === "Paper") {
      positions.set(node.id, index === 0 ? [cx, cy] : pointOnCircle(cx, cy, radius, index, nodes.length));
    } else {
      positions.set(node.id, pointOnCircle(cx, cy, radius, index, nodes.length));
    }
  });
  for (const edge of edges.slice(0, 28)) {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) continue;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", from[0]);
    line.setAttribute("y1", from[1]);
    line.setAttribute("x2", to[0]);
    line.setAttribute("y2", to[1]);
    line.setAttribute("stroke", "var(--border-strong)");
    line.setAttribute("stroke-width", String(Math.max(1, Number(edge.confidence || 0.4) * 2.5)));
    svg.appendChild(line);
  }
  for (const node of nodes.slice(0, 18)) {
    const [x, y] = positions.get(node.id) || [cx, cy];
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const isPaper = node.nodeType === "Paper";
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", isPaper ? "22" : "17");
    circle.setAttribute("fill", isPaper ? "var(--accent)" : "var(--surface-2)");
    circle.setAttribute("stroke", "var(--muted-strong)");
    circle.setAttribute("stroke-width", "1.2");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y + (isPaper ? 38 : 31));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "var(--app-fg)");
    text.setAttribute("font-size", "11");
    text.textContent = truncateText(node.label || node.id, 28);
    group.append(circle, text);
    svg.appendChild(group);
  }
  return svg;
}

function pointOnCircle(cx, cy, radius, index, total) {
  const angle = (Math.PI * 2 * index) / Math.max(2, total) - Math.PI / 2;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
}

function nodeLabel(nodes, id) {
  return nodes.find((node) => node.id === id)?.label || id;
}

function edgeTypeLabel(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("citation")) return "引用";
  if (normalized.includes("code")) return "代码";
  if (normalized.includes("dataset")) return "数据集";
  if (normalized.includes("method")) return "方法";
  if (normalized.includes("module")) return "模块";
  if (normalized.includes("similar")) return "相似";
  return "关系";
}

async function auditSelectedRepo() {
  const raw = el.repoAuditInput?.value.trim() || state.research.selected?.repoCandidates?.[0]?.url || state.workspace || "";
  if (!raw) {
    el.repoAuditInput?.focus();
    return;
  }
  el.repoAuditButton.disabled = true;
  el.repoAuditStatus.textContent = t("auditRunning");
  try {
    const body = /^https?:\/\//i.test(raw)
      ? { repoUrl: raw, paperId: state.research.selected?.paper?.id }
      : { localPath: raw, paperId: state.research.selected?.paper?.id };
    const payload = await api("/research/repos/audit", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.research.audit = payload.audit || null;
    state.research.risk = null;
    el.repoAuditStatus.textContent = t("auditDone");
    renderRepoAudit();
    renderTrickScore();
    showResearchTab("audit");
  } catch (error) {
    const detail = userFacingError(error, "audit");
    el.repoAuditStatus.textContent = `${t("auditFailed")}：${detail}`;
    toast(`${t("auditFailed")}：${detail}`, true);
  } finally {
    el.repoAuditButton.disabled = false;
  }
}

function renderRepoAudit() {
  if (!el.repoAuditReport) return;
  el.repoAuditReport.innerHTML = "";
  const audit = state.research.audit;
  if (!audit) return;
  const sections = [
    ["仓库", [`${audit.owner || ""}/${audit.name || ""}`, audit.repoUrl || ""], []],
    ["评分", [
      `官方匹配 ${formatScore(audit.officialnessScore)}`,
      `代码完整度 ${formatScore(audit.codeCompletenessScore)}`,
      `复现可行性 ${formatScore(audit.reproducibilityScore)}`,
      audit.minimumRunCommand ? `最小运行命令: ${audit.minimumRunCommand}` : "",
    ], []],
    ["缺失项", audit.missingPieces || [], []],
    ["可能失败点", audit.likelyFailurePoints || [], []],
    ["建议修复", audit.recommendedFixes || [], []],
    ["证据", audit.evidence || [], []],
    ["已检查文件", (audit.filesSeen || []).slice(0, 18), []],
    ["问题信号", audit.issueSignals || [], []],
  ];
  for (const [title, lines] of sections) {
    if (!lines.filter(Boolean).length) continue;
    el.repoAuditReport.appendChild(renderSection(title, lines));
  }
}

async function runTrickScore() {
  const repoUrl = el.repoAuditInput?.value.trim() || state.research.selected?.repoCandidates?.[0]?.url || "";
  el.trickScoreButton.disabled = true;
  el.repoAuditStatus.textContent = t("riskRunning");
  try {
    const payload = await api("/research/trick-score", {
      method: "POST",
      body: JSON.stringify({
        paperId: state.research.selected?.paper?.id,
        repoUrl: state.research.audit ? undefined : repoUrl || undefined,
        audit: state.research.audit || undefined,
      }),
    });
    state.research.risk = payload.risk || null;
    if (payload.audit) state.research.audit = payload.audit;
    el.repoAuditStatus.textContent = t("riskDone");
    renderRepoAudit();
    renderTrickScore();
    showResearchTab("audit");
  } catch (error) {
    const detail = userFacingError(error, "risk");
    el.repoAuditStatus.textContent = `${t("streamError")}：${detail}`;
    toast(`${t("streamError")}：${detail}`, true);
  } finally {
    el.trickScoreButton.disabled = false;
  }
}

function renderTrickScore() {
  if (!el.trickScoreReport) return;
  el.trickScoreReport.innerHTML = "";
  const risk = state.research.risk;
  if (!risk) return;
  const box = document.createElement("div");
  box.className = "risk-report-inner";
  const title = document.createElement("h3");
  title.textContent = `${riskLabel(risk.riskLevel)} / ${formatScore(risk.trickScore)}`;
  const meaning = document.createElement("small");
  meaning.textContent = risk.meaning || "";
  const meter = document.createElement("div");
  meter.className = "risk-meter";
  const fill = document.createElement("span");
  fill.style.width = `${Math.max(0, Math.min(100, Number(risk.trickScore || 0)))}%`;
  meter.appendChild(fill);
  box.append(title, meaning, meter);
  for (const [label, value] of [
    ["code", risk.codeRisk],
    ["protocol", risk.protocolRisk],
    ["result", risk.resultRisk],
    ["novelty", risk.noveltyRisk],
    ["community", risk.communityRisk],
    ["repo", risk.repoRisk],
    ["runtime", risk.runtimeRisk],
  ]) {
    const row = document.createElement("div");
    row.className = "risk-row";
    const name = document.createElement("small");
    name.textContent = riskMetricLabel(label);
    const score = document.createElement("strong");
    score.textContent = formatScore(value);
    row.append(name, score);
    box.appendChild(row);
  }
  const evidenceBox = document.createElement("div");
  evidenceBox.className = "evidence-drawer";
  renderEvidenceList(evidenceBox, risk.evidence || []);
  box.appendChild(evidenceBox);
  el.trickScoreReport.appendChild(box);
}

async function exportResearchReport() {
  const payload = {
    query: state.research.query,
    selectedPaper: state.research.selected,
    graph: state.research.graph,
    audit: state.research.audit,
    risk: state.research.risk,
    ideas: state.research.ideas,
  };
  try {
    const result = await api("/research/reports/export", {
      method: "POST",
      body: JSON.stringify({
        title: state.research.selected?.paper?.title || "RainyReSearch Report",
        kind: "rainy-research",
        payload,
      }),
    });
    state.research.exportedReportPath = result.path || null;
    toast(t("reportExported", { path: result.path || "" }));
  } catch (error) {
    toast(`${t("streamError")}：${userFacingError(error, "export")}`, true);
  }
}

function renderSection(title, lines) {
  const section = document.createElement("section");
  section.className = "audit-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);
  const list = document.createElement("ul");
  list.className = "audit-list";
  for (const line of (lines || []).filter(Boolean)) {
    const item = document.createElement("li");
    item.textContent = line;
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function paperChip(text, extraClass = "") {
  const chip = document.createElement("span");
  chip.className = `paper-chip ${extraClass}`.trim();
  chip.textContent = String(text || "");
  return chip;
}

function riskClass(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized.includes("high")) return "risk-high";
  if (normalized.includes("medium")) return "risk-medium";
  if (normalized.includes("low")) return "risk-low";
  return "";
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "0";
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0%";
  return `${Math.round(number <= 1 ? number * 100 : number)}%`;
}

function truncateText(value, maxLength) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

async function selectWorkspace() {
  const defaultPath = state.workspace || state.paths?.appRoot || parentDir(state.core?.dataRoot) || state.core?.dataRoot;
  const selected = await window.deepx.selectDirectory(defaultPath);
  if (!selected) return;
  await saveProjectSelection(selected, t("projectAdded"));
}

function updateWorkspaceLabel() {
  if (!state.workspace) {
    el.workspaceValue.textContent = t("noWorkspace");
    renderWorkspaceSetupState();
    return;
  }
  el.workspaceValue.textContent = basename(state.workspace);
  el.workspaceValue.title = state.workspace;
  renderWorkspaceSetupState();
}

function bindResearchEvents() {
  el.researchSearchButton?.addEventListener("click", searchResearch);
  el.researchQueryInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchResearch();
    }
  });
  document.querySelectorAll("[data-research-tab]").forEach((button) => {
    button.addEventListener("click", () => showResearchTab(button.dataset.researchTab || "card"));
  });
  el.reloadGraphButton?.addEventListener("click", () => {
    if (state.research.selected?.paper?.id) {
      loadPaperGraph(state.research.selected.paper.id);
    }
  });
  el.repoAuditButton?.addEventListener("click", auditSelectedRepo);
  el.trickScoreButton?.addEventListener("click", runTrickScore);
  el.exportReportButton?.addEventListener("click", exportResearchReport);
}

function resetWorkspaceSetupState() {
  clearWorkspaceSetupTimers();
  state.workspaceSetup = {
    status: "idle",
    workspacePath: state.workspace || null,
    title: "",
    detail: "",
  };
  renderWorkspaceSetupState();
}

function clearWorkspaceSetupTimers() {
  if (state.workspaceSetupTimer) {
    clearTimeout(state.workspaceSetupTimer);
    state.workspaceSetupTimer = null;
  }
  if (state.workspaceSetupHideTimer) {
    clearTimeout(state.workspaceSetupHideTimer);
    state.workspaceSetupHideTimer = null;
  }
}

function renderWorkspaceSetupState() {
  if (!el.workspaceStatus) return;
  const { status, workspacePath, title, detail } = state.workspaceSetup || {};
  const visible = !!workspacePath && status && status !== "idle";
  el.workspaceStatus.classList.toggle("hidden", !visible);
  el.workspaceStatus.classList.toggle("preparing", status === "preparing");
  el.workspaceStatus.classList.toggle("ready", status === "ready" || status === "cached");
  el.workspaceStatus.classList.toggle("error", status === "error");
  el.workspaceStatusTitle.textContent = title || "";
  el.workspaceStatusDetail.textContent = detail || "";
}

function scheduleWorkspaceSetupHide(delay = 1400, workspacePath = state.workspaceSetup.workspacePath) {
  if (!workspacePath) return;
  if (state.workspaceSetupHideTimer) {
    clearTimeout(state.workspaceSetupHideTimer);
  }
  state.workspaceSetupHideTimer = setTimeout(() => {
    if (!samePath(state.workspaceSetup.workspacePath, workspacePath)) return;
    resetWorkspaceSetupState();
  }, delay);
}

function setWorkspaceSetupState(next, options = {}) {
  const merged = { ...state.workspaceSetup, ...next };
  state.workspaceSetup = merged;
  renderWorkspaceSetupState();
  if (options.autoHide) {
    scheduleWorkspaceSetupHide(options.autoHideDelay || 1400, merged.workspacePath);
  }
}

async function ensureWorkspacePrepared({ force = false, immediate = false } = {}) {
  const workspacePath = state.workspace || state.settings.workspacePath || null;
  if (!workspacePath) {
    resetWorkspaceSetupState();
    return null;
  }
  if (state.workspaceSetupPromise && samePath(state.workspaceSetup.workspacePath, workspacePath) && !force) {
    return state.workspaceSetupPromise;
  }

  clearWorkspaceSetupTimers();
  state.workspaceSetup = {
    status: "preparing",
    workspacePath,
    title: t("workspacePreparing"),
    detail: t("workspacePreparingDetail"),
  };

  const showPreparing = () => renderWorkspaceSetupState();
  if (immediate) {
    showPreparing();
  } else {
    state.workspaceSetupTimer = setTimeout(() => {
      if (samePath(state.workspaceSetup.workspacePath, workspacePath) && state.workspaceSetup.status === "preparing") {
        showPreparing();
      }
    }, 220);
  }

  const promise = api("/workspace/prepare", {
    method: "POST",
    body: JSON.stringify({ force, workspacePath }),
  })
    .then((payload) => {
      if (!samePath(state.workspaceSetup.workspacePath, workspacePath)) return payload;
      const title = payload?.status === "cached" ? t("workspaceReady") : t("workspaceReady");
      const detail = payload?.detail || payload?.summary || t("workspaceReadyDetail", {
        treeEntries: payload?.treeEntries ?? 0,
        instructions: payload?.instructionFiles?.length ? payload.instructionFiles.join(", ") : "no AGENTS.md",
      });
      setWorkspaceSetupState(
        {
          status: payload?.status === "cached" ? "cached" : "ready",
          workspacePath,
          title,
          detail,
        },
        { autoHide: true, autoHideDelay: 1100 }
      );
      return payload;
    })
    .catch((error) => {
      if (samePath(state.workspaceSetup.workspacePath, workspacePath)) {
        setWorkspaceSetupState(
          {
            status: "error",
            workspacePath,
            title: t("workspaceSetupFailed"),
            detail: error.message || String(error),
          },
          { autoHide: false }
        );
      }
      throw error;
    })
    .finally(() => {
      if (state.workspaceSetupPromise === promise) {
        clearWorkspaceSetupTimers();
        state.workspaceSetupPromise = null;
      }
    });

  state.workspaceSetupPromise = promise;
  return promise;
}

function shouldWaitForWorkspacePreparation(message, attachments) {
  if (!state.workspace) return false;
  if (!message || !message.trim()) return false;
  return !isLightweightChatMessage(message);
}

function containsWorkspaceIntent(message) {
  const normalized = String(message || "").toLowerCase();
  return [
    "文件",
    "目录",
    "工作区",
    "项目",
    "代码",
    "读取",
    "查看",
    "搜索",
    "修改",
    "写入",
    "运行",
    "执行",
    "终端",
    "命令",
    "报错",
    "错误",
    "bug",
    "file",
    "folder",
    "directory",
    "workspace",
    "project",
    "code",
    "read",
    "search",
    "edit",
    "write",
    "run",
    "terminal",
    "shell",
    "error",
    "git",
    "cargo",
    "npm",
    "pnpm",
    "package.json",
    "cargo.toml",
    "readme",
  ].some((keyword) => normalized.includes(keyword));
}

function isLightweightChatMessage(message) {
  const compact = String(message || "")
    .trim()
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "");
  if (!compact) return true;
  if (compact.length > 48) return false;
  const lower = compact.toLowerCase();
  if (/^\d+$/.test(lower)) return true;
  if (containsWorkspaceIntent(lower)) return false;
  return [
    "你好",
    "hi",
    "hello",
    "hey",
    "test",
    "ping",
    "ok",
    "okay",
    "thanks",
    "thank you",
  ].some((phrase) => lower === phrase || lower.startsWith(`${phrase} `));
}

function normalizeProjects(paths, current) {
  const seen = new Set();
  const out = [];
  for (const candidate of [current, ...(Array.isArray(paths) ? paths : [])]) {
    const pathValue = String(candidate || "").trim();
    if (!pathValue) continue;
    const key = pathValue.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pathValue);
  }
  return out.slice(0, 24);
}

function samePath(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function renderProjects() {
  if (!el.projectList) return;
  el.projectList.innerHTML = "";
  if (!state.projects.length) {
    const empty = document.createElement("div");
    empty.className = "project-empty";
    empty.textContent = t("noProjects");
    el.projectList.appendChild(empty);
    return;
  }
  for (const projectPath of state.projects) {
    const button = document.createElement("button");
    button.className = `project-item${samePath(projectPath, state.workspace) ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h7l2 2h7v11H4z"></path><path d="M4 7V5h7l2 2"></path></svg><span></span>`;
    button.querySelector("span").textContent = basename(projectPath);
    button.title = projectPath;
    button.addEventListener("click", () => switchProject(projectPath));
    el.projectList.appendChild(button);
  }
}

async function switchProject(projectPath) {
  if (!projectPath || samePath(projectPath, state.workspace)) return;
  await saveProjectSelection(projectPath, t("projectSwitched"));
}

async function saveProjectSelection(projectPath, message) {
  state.workspace = projectPath;
  state.projects = normalizeProjects(state.projects, projectPath);
  state.sessionId = null;
  state.lastMetric = null;
  updateWorkspaceLabel();
  renderProjects();
  renderSessions();
  try {
    const payload = {
      ...formPayload(),
      workspacePath: projectPath,
      workspaceHistory: state.projects,
    };
    const response = await api("/config", { method: "POST", body: JSON.stringify(payload) });
    state.settings = response.settings || state.settings;
    state.configuredResearchSources = response.configuredResearchSources || state.configuredResearchSources;
    state.configuredWebSearch = response.configuredWebSearch || state.configuredWebSearch;
    state.workspace = state.settings.workspacePath || projectPath;
    state.projects = normalizeProjects(state.settings.workspaceHistory || state.projects, state.workspace);
    updateWorkspaceLabel();
    renderProjects();
    const prepPromise = ensureWorkspacePrepared({ immediate: true, force: true }).catch((error) => {
      console.warn("Workspace preparation failed", error);
      return null;
    });
    await loadSessions();
    await prepPromise;
    toast(message || t("workspaceSaved"));
  } catch (error) {
    toast(`${t("saveFailed")}: ${error.message}`, true);
  }
}

function basename(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean).pop() || path || "";
}

async function newSession() {
  state.sessionId = null;
  state.lastMetric = null;
  el.threadTitle.textContent = t("newChat");
  el.transcript.innerHTML = "";
  renderSessions();
  updateCacheStatus();
  el.messageInput.focus();
}

async function loadSessions() {
  try {
    const payload = await api("/sessions");
    state.sessions = payload.sessions || [];
    renderSessions();
  } catch (error) {
    console.warn(error);
  }
}

function renderSessions() {
  el.sessionList.innerHTML = "";
  const visibleSessions = state.workspace
    ? state.sessions.filter((session) => samePath(session.workspacePath, state.workspace))
    : state.sessions;
  if (!visibleSessions.length) {
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = t("emptySessions");
    el.sessionList.appendChild(empty);
    return;
  }
  for (const session of visibleSessions) {
    const button = document.createElement("button");
    button.className = `session-item${session.id === state.sessionId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<strong></strong><small></small>`;
    button.querySelector("strong").textContent = session.title || t("newChat");
    button.querySelector("small").textContent = `${session.providerId || ""} / ${session.model || ""} / ${session.messageCount || 0}`;
    button.addEventListener("click", () => loadSession(session.id));
    el.sessionList.appendChild(button);
  }
}

async function loadSession(id) {
  const payload = await api(`/sessions/${encodeURIComponent(id)}`);
  const session = payload.session;
  state.sessionId = session.id;
  if (session.workspacePath) {
    state.workspace = session.workspacePath;
    state.projects = normalizeProjects(state.projects, state.workspace);
    updateWorkspaceLabel();
    renderProjects();
    void ensureWorkspacePrepared({ immediate: false }).catch((error) => {
      console.warn("Workspace preparation failed", error);
      return null;
    });
  }
  state.lastMetric = session.metrics?.[session.metrics.length - 1] || null;
  el.threadTitle.textContent = session.title || t("newChat");
  el.transcript.innerHTML = "";
  for (const message of session.messages || []) {
    appendMessage({
      role: message.role,
      content: message.content,
      reasoning: message.reasoningContent,
      checkpointId: message.checkpointId,
    });
  }
  updateCacheStatus();
  renderSessions();
  scrollTranscript(true);
}

async function sendMessage() {
  const message = el.messageInput.value.trim();
  const attachments = [...state.attachments];
  if ((!message && !attachments.length) || state.busy) return;
  state.busy = true;
  setBusy(true);
  const wasPinned = isTranscriptPinned();
  el.messageInput.value = "";
  state.attachments = [];
  renderAttachments();
  autoresizeComposer();
  let assistant = null;
  try {
    const waitForWorkspace = shouldWaitForWorkspacePreparation(message, attachments);
    const workspacePreparation = waitForWorkspace
      ? ensureWorkspacePrepared({ immediate: false }).catch((error) => {
          console.warn("Workspace preparation failed", error);
          toast(`${t("workspaceSetupFailed")}: ${error.message || error}`, true);
          return null;
        })
      : null;
    const outbound = await buildMessageWithAttachments(message, attachments);
    const userDisplay = formatUserMessageWithAttachments(message, attachments);
    appendMessage({ role: "user", content: userDisplay });
    assistant = appendMessage({ role: "assistant", content: "", pending: true });
    if (wasPinned) scrollTranscript(true);
    if (workspacePreparation) {
      assistant.setStatus(t("workspacePreparing"));
      await workspacePreparation;
    }
    let webContext = null;
    if (state.webSearchEnabled) {
      assistant.setStatus(t("webSearchRunning"));
      webContext = await buildWebContext(message || attachments.map((item) => item.name).join(" "));
    }
    assistant.setStatus(t("sending"));
    await streamChat(outbound, webContext, assistant);
    await loadSessions();
  } catch (error) {
    if (!assistant) {
      assistant = appendMessage({ role: "assistant", content: "", pending: true });
    }
    assistant.setStatus(t("streamError"));
    assistant.setError(error.message || String(error));
    toast(`${t("streamError")}: ${error.message || error}`, true);
  } finally {
    state.busy = false;
    setBusy(false);
    updateSendButton();
  }
}

async function restoreCheckpoint(checkpointId) {
  if (!checkpointId || !state.sessionId || state.busy) return;
  if (!confirm(t("restoreCheckpointConfirm"))) return;
  state.busy = true;
  setBusy(true);
  try {
    await api(`/sessions/${encodeURIComponent(state.sessionId)}/checkpoints/${encodeURIComponent(checkpointId)}/restore`, {
      method: "POST",
    });
    toast(t("checkpointRestored"));
    await loadSession(state.sessionId);
    await loadSessions();
  } catch (error) {
    toast(`${t("streamError")}: ${error.message || error}`, true);
  } finally {
    state.busy = false;
    setBusy(false);
    updateSendButton();
  }
}

async function addContextFiles() {
  try {
    const defaultPath = state.workspace || state.paths?.appRoot || parentDir(state.core?.dataRoot) || state.core?.dataRoot;
    const files = await window.deepx.selectFiles(defaultPath);
    if (!files?.length) return;
    addAttachmentPaths(files);
  } catch (error) {
    toast(`${t("fileAttachFailed")}: ${error.message || error}`, true);
  }
}

function handleFileDragOver(event) {
  if (!hasDraggedFiles(event) && !hasDraggedUri(event)) return;
  event.preventDefault();
  event.stopPropagation();
  el.composer.classList.add("drag-over");
}

async function handleFileDrop(event) {
  if (!hasDraggedFiles(event) && !hasDraggedUri(event)) return;
  event.preventDefault();
  event.stopPropagation();
  el.composer.classList.remove("drag-over");
  const files = Array.from(event.dataTransfer.files || []);
  if (!files.length) return;
  try {
    const items = [];
    for (const file of files) {
      const pathValue = await window.deepx.getFilePath(file);
      if (!pathValue) continue;
      items.push({ path: pathValue, name: file.name || basename(pathValue), size: file.size || 0 });
    }
    addAttachments(items);
  } catch (error) {
    toast(`${t("fileAttachFailed")}: ${error.message || error}`, true);
  }
}

function hasDraggedFiles(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  const items = Array.from(event.dataTransfer?.items || []);
  return types.includes("Files") || items.some((item) => item.kind === "file");
}

function hasDraggedUri(event) {
  return Array.from(event.dataTransfer?.types || []).includes("text/uri-list");
}

function addAttachmentPaths(paths) {
  addAttachments((paths || []).map((pathValue) => ({
    path: pathValue,
    name: basename(pathValue),
    size: 0,
  })));
}

function addAttachments(items) {
  const existing = new Set(state.attachments.map((item) => item.path.toLowerCase()));
  for (const item of items) {
    if (!item?.path) continue;
    const key = item.path.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    state.attachments.push({
      path: item.path,
      name: item.name || basename(item.path),
      size: item.size || 0,
    });
  }
  renderAttachments();
  updateSendButton();
  if (items.length) toast(t("fileAttached", { count: state.attachments.length }));
}

function renderAttachments() {
  if (!el.attachmentTray) return;
  el.attachmentTray.innerHTML = "";
  el.attachmentTray.classList.toggle("hidden", state.attachments.length === 0);
  for (const attachment of state.attachments) {
    const chip = document.createElement("span");
    chip.className = "attachment-chip";
    chip.innerHTML = `<span></span><button type="button" title="${t("removeAttachment")}">x</button>`;
    chip.querySelector("span").textContent = attachment.name;
    chip.title = attachment.path;
    chip.querySelector("button").addEventListener("click", () => {
      state.attachments = state.attachments.filter((item) => item.path !== attachment.path);
      renderAttachments();
      updateSendButton();
    });
    el.attachmentTray.appendChild(chip);
  }
}

async function buildMessageWithAttachments(message, attachments) {
  if (!attachments.length) return message;
  const files = await window.deepx.readTextFiles(attachments.map((item) => item.path));
  const fileBlocks = files.map((file, index) => {
    const status = file.truncated ? `\n${t("fileTooLarge")}` : "";
    if (file.error) {
      return `\u6587\u4ef6 ${index + 1}: ${file.name}\n\u8def\u5f84: ${file.path}\n\u8bfb\u53d6\u5931\u8d25: ${file.error}`;
    }
    return [
      `\u6587\u4ef6 ${index + 1}: ${file.name}`,
      `\u8def\u5f84: ${file.path}`,
      `\u5927\u5c0f: ${formatBytes(file.size)}`,
      status.trim(),
      "\u5185\u5bb9:",
      file.content || "(\u7a7a\u6587\u4ef6)",
    ].filter(Boolean).join("\n");
  });
  const prompt = message || (state.language === "zh-CN" ? "\u8bf7\u6839\u636e\u9644\u4ef6\u5185\u5bb9\u8fdb\u884c\u5206\u6790\u3002" : "Please analyze the attached file content.");
  return `${prompt}\n\n[RainyReSearch \u9644\u4ef6\u4e0a\u4e0b\u6587]\n${fileBlocks.join("\n\n---\n\n")}`;
}

function formatUserMessageWithAttachments(message, attachments) {
  if (!attachments.length) return message;
  const names = attachments.map((item) => `- ${item.name}`).join("\n");
  const prefix = message || (state.language === "zh-CN" ? "\u5df2\u6dfb\u52a0\u9644\u4ef6\u3002" : "Attached files.");
  return `${prefix}\n\n${state.language === "zh-CN" ? "\u9644\u4ef6" : "Attachments"}:\n${names}`;
}
async function buildWebContext(query) {
  const payload = await api("/web-search", {
    method: "POST",
    body: JSON.stringify({
      query,
      maxResults: numberValue(el.webSearchMaxResultsInput, 5),
    }),
  });
  const lines = (payload.results || []).map((item, index) => {
    const source = item.source || payload.provider || "web";
    return `${index + 1}. ${item.title}\nSource: ${source}\nURL: ${item.url}\nSnippet: ${item.snippet}`;
  });
  return lines.length ? lines.join("\n\n") : null;
}

async function streamChat(message, webContext, assistant) {
  const response = await fetch(`${state.core.baseUrl}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: state.sessionId,
      message,
      webContext,
      settings: chatSettingsPayload(),
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n/);
    buffer = events.pop() || "";
    for (const raw of events) {
      handleSseEvent(raw, assistant);
    }
  }
  if (buffer.trim()) handleSseEvent(buffer, assistant);
  assistant.finish();
}

function handleSseEvent(raw, assistant) {
  const lines = raw.split(/\r?\n/);
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return;
  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    payload = { text: data };
  }
  if (event === "message.delta") {
    assistant.appendContent(payload.text || "");
  } else if (event === "reasoning.delta") {
    assistant.appendReasoning(payload.text || "");
  } else if (event === "tool.start") {
    assistant.updateTool(payload, "running");
  } else if (event === "tool.end") {
    assistant.updateTool(payload, payload.ok === false ? "failed" : "done");
  } else if (event === "usage") {
    assistant.setUsage(payload.usage);
  } else if (event === "metric") {
    assistant.setMetric(payload.metric);
    state.lastMetric = payload.metric;
    updateCacheStatus();
  } else if (event === "done") {
    state.sessionId = payload.sessionId || state.sessionId;
    assistant.setMetric(payload.metric || state.lastMetric);
    assistant.setCheckpoint(payload.checkpointId || null);
    state.lastMetric = payload.metric || state.lastMetric;
    updateCacheStatus();
  } else if (event === "error") {
    throw new Error(payload.error || JSON.stringify(payload));
  }
}

function appendMessage({ role, content = "", reasoning, metric, checkpointId = null, pending = false }) {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  const header = document.createElement("div");
  header.className = "message-header";
  header.innerHTML = `<span class="message-role"></span><span class="message-time"></span><button class="copy-button" type="button"></button><button class="checkpoint-button" type="button"></button>`;
  header.querySelector(".message-role").textContent = role === "user" ? t("userLabel") : t("assistantLabel");
  header.querySelector(".message-time").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  header.querySelector(".copy-button").textContent = t("copy");
  header.querySelector(".checkpoint-button").textContent = "↩";
  header.querySelector(".checkpoint-button").title = t("restoreCheckpoint");
  header.querySelector(".checkpoint-button").setAttribute("aria-label", t("restoreCheckpoint"));
  const body = document.createElement("div");
  body.className = role === "assistant" ? "message-body markdown" : "message-body";
  const footer = document.createElement("div");
  footer.className = "message-footer";
  item.append(header, body, footer);
  el.transcript.appendChild(item);

  const messageState = {
    rawContent: content || "",
    rawReasoning: reasoning || "",
    metric: metric || null,
    checkpointId,
    usage: null,
    tools: [],
    renderTimer: null,
    streamStarted: false,
  };
  updateCheckpointButton();

  header.querySelector(".copy-button").addEventListener("click", async () => {
    await navigator.clipboard.writeText(messageState.rawContent);
    toast(t("copied"));
  });
  header.querySelector(".checkpoint-button").addEventListener("click", () => {
    restoreCheckpoint(messageState.checkpointId);
  });

  function updateCheckpointButton() {
    const button = header.querySelector(".checkpoint-button");
    button.classList.toggle("visible", role === "assistant" && !!messageState.checkpointId);
    button.disabled = state.busy || !messageState.checkpointId;
  }

  function render(final = false) {
    if (role === "assistant") {
      renderMarkdown(body, messageState.rawContent, final);
    } else {
      body.textContent = messageState.rawContent;
    }
    renderReasoning(item, messageState.rawReasoning);
    renderToolCalls(item, messageState.tools);
    renderMetricFooter(footer, messageState.metric, messageState.usage);
  }

  function scheduleRender() {
    if (messageState.renderTimer) return;
    messageState.renderTimer = requestAnimationFrame(() => {
      messageState.renderTimer = null;
      render(false);
      if (isTranscriptPinned()) scrollTranscript(false);
    });
  }

  const controller = Object.assign(item, {
    appendContent(text) {
      if (text) this.markStreaming();
      messageState.rawContent += text;
      scheduleRender();
    },
    appendReasoning(text) {
      if (text) this.markStreaming();
      messageState.rawReasoning += text;
      scheduleRender();
    },
    markStreaming() {
      if (role !== "assistant" || messageState.streamStarted) return;
      messageState.streamStarted = true;
      this.setStatus(t("streaming"));
    },
    setMetric(next) {
      if (next) {
        messageState.metric = next;
        render(false);
      }
    },
    setUsage(next) {
      messageState.usage = next;
      render(false);
    },
    setCheckpoint(next) {
      messageState.checkpointId = next;
      updateCheckpointButton();
    },
    updateTool(payload, status) {
      const id = payload?.id || `${payload?.name || "tool"}-${messageState.tools.length}`;
      let tool = messageState.tools.find((item) => item.id === id);
      if (!tool) {
        tool = {
          id,
          name: payload?.name || "tool",
          status: "running",
          summary: "",
          arguments: payload?.arguments || null,
        };
        messageState.tools.push(tool);
      }
      tool.status = status || tool.status;
      tool.summary = payload?.summary || tool.summary || "";
      tool.arguments = payload?.arguments || tool.arguments || null;
      tool.checkpointId = payload?.checkpointId || tool.checkpointId || null;
      this.setStatus(t(tool.status === "failed" ? "toolFailed" : tool.status === "done" ? "toolDone" : "toolRunning", { name: tool.name }));
      render(false);
    },
    setStatus(text) {
      header.querySelector(".message-role").textContent = `${t("assistantLabel")} - ${text}`;
    },
    setError(text) {
      item.classList.add("error");
      body.textContent = text;
    },
    finish() {
      item.classList.remove("pending");
      header.querySelector(".message-role").textContent = role === "user" ? t("userLabel") : t("assistantLabel");
      render(true);
      scrollTranscript(false);
    },
  });
  if (pending) item.classList.add("pending");
  render(true);
  return controller;
}

function renderMarkdown(container, raw, final) {
  if (!raw) {
    container.textContent = "";
    return;
  }
  const markedApi = window.marked?.parse ? window.marked : window.marked?.marked ? window.marked.marked : null;
  if (!markedApi || !window.DOMPurify) {
    container.textContent = raw;
    container.dataset.markdownStatus = !markedApi ? "missing-marked" : "missing-dompurify";
    return;
  }
  delete container.dataset.markdownStatus;
  let html = "";
  try {
    html = parseMarkdown(markedApi, normalizeMarkdown(raw));
  } catch (error) {
    console.error("Markdown render failed", error);
    container.textContent = raw;
    container.dataset.markdownStatus = "parse-error";
    return;
  }
  if (html && typeof html.then === "function") {
    container.textContent = raw;
    container.dataset.markdownStatus = "async-marked-unsupported";
    return;
  }
  container.innerHTML = window.DOMPurify.sanitize(String(html), {
    ADD_ATTR: ["target", "rel", "class"],
    ADD_TAGS: ["table", "thead", "tbody", "tr", "th", "td"],
  });
  container.querySelectorAll("a").forEach((link) => {
    link.target = "_blank";
    link.rel = "noreferrer noopener";
  });
  if (final !== false && window.hljs) {
    container.querySelectorAll("pre code").forEach((block) => window.hljs.highlightElement(block));
  }
}

function parseMarkdown(markedApi, raw) {
  if (markedApi?.parse) return markedApi.parse(raw);
  if (typeof markedApi === "function") return markedApi(raw);
  throw new Error("marked parser is unavailable");
}

function normalizeMarkdown(raw) {
  return String(raw)
    .replace(/([:\uff1a])\s+\|(?=[^\n]*\|\s+\|\s*:?-{3,})/g, "$1\n\n|")
    .replace(/\|\s+\|(?=\s*(?:\|?\s*:?-{3,}|`|\*\*|[*_#A-Za-z0-9\u4e00-\u9fff]))/g, "|\n|");
}
function renderReasoning(item, reasoning) {
  let details = item.querySelector(".reasoning-block");
  if (!reasoning) {
    details?.remove();
    return;
  }
  if (!details) {
    details = document.createElement("details");
    details.className = "reasoning-block";
    details.innerHTML = `<summary></summary><pre></pre>`;
    details.querySelector("summary").textContent = t("reasoning");
    item.insertBefore(details, item.querySelector(".message-body"));
  }
  details.querySelector("pre").textContent = reasoning;
}

function renderToolCalls(item, tools) {
  let panel = item.querySelector(".tool-call-panel");
  if (!tools?.length) {
    panel?.remove();
    return;
  }
  if (!panel || panel.tagName !== "DETAILS") {
    panel?.remove();
    panel = document.createElement("details");
    panel.className = "tool-call-panel";
    panel.addEventListener("toggle", () => {
      if (panel.dataset.updating === "true") return;
      panel.dataset.userToggled = "true";
      panel.dataset.open = String(panel.open);
    });
    item.insertBefore(panel, item.querySelector(".message-body"));
  }
  const hasRunning = tools.some((tool) => !tool.status || tool.status === "running");
  const hasFailed = tools.some((tool) => tool.status === "failed");
  if (panel.dataset.userToggled === "true") {
    panel.open = panel.dataset.open !== "false";
  } else {
    panel.dataset.updating = "true";
    panel.open = hasRunning || hasFailed;
    setTimeout(() => {
      delete panel.dataset.updating;
    }, 0);
  }
  const completeCount = tools.filter((tool) => tool.status === "done").length;
  panel.innerHTML = `<summary class="tool-call-title"><span>${t("toolCalls")}</span><small>${completeCount}/${tools.length}</small></summary><div class="tool-call-list"></div>`;
  const list = panel.querySelector(".tool-call-list");
  for (const tool of tools) {
    const row = document.createElement("div");
    row.className = `tool-call-row ${tool.status || "running"}`;
    const status = tool.status === "failed" ? "!" : tool.status === "done" ? "ok" : "...";
    const checkpoint = tool.checkpointId ? `checkpoint ${tool.checkpointId}` : "";
    const details = [tool.summary, checkpoint, tool.arguments ? JSON.stringify(tool.arguments) : ""].filter(Boolean).join(" / ");
    row.innerHTML = `<span class="tool-call-status"></span><span class="tool-call-name"></span><span class="tool-call-summary"></span>`;
    row.querySelector(".tool-call-status").textContent = status;
    row.querySelector(".tool-call-name").textContent = tool.name || "tool";
    row.querySelector(".tool-call-summary").textContent = details;
    list.appendChild(row);
  }
}
function renderMetricFooter(footer, metric, usage) {
  const data = metric || (usage ? { promptTokens: usage.promptTokens, totalTokens: usage.totalTokens } : null);
  footer.innerHTML = "";
  if (!data) return;
  const chips = [];
  if (metric) {
    chips.push(t("cacheHitMiss", { hit: metric.cacheHitTokens || 0, miss: metric.cacheMissTokens || 0 }));
    chips.push(t("hitRatio", { ratio: Math.round((metric.hitRatio || 0) * 100) }));
    chips.push(t("tokenCount", { count: metric.totalTokens || 0 }));
    chips.push(formatCost(metric.estimatedCost));
    const hash = (metric.prefixHash || "").slice(0, 10);
    chips.push(metric.prefixChanged ? t("prefixReset", { hash }) : t("prefixStable", { hash }));
    if (metric.contextTruncated) {
      chips.push(t("truncated", { count: metric.contextTruncatedMessages || 0 }));
    }
  } else if (usage) {
    chips.push(t("tokenCount", { count: usage.totalTokens || 0 }));
  }
  for (const chipText of chips.filter(Boolean)) {
    const chip = document.createElement("span");
    chip.className = "metric-chip";
    chip.textContent = chipText;
    footer.appendChild(chip);
  }
}

function formatCost(cost) {
  if (!cost) return t("noCost");
  return `${cost.currency || "$"}${Number(cost.amount || 0).toFixed(6)}`;
}

function isTranscriptPinned() {
  return el.transcript.scrollHeight - el.transcript.scrollTop - el.transcript.clientHeight < 80;
}

function scrollTranscript(force) {
  if (force || isTranscriptPinned()) {
    el.transcript.scrollTop = el.transcript.scrollHeight;
  }
}

function autoresizeComposer() {
  el.messageInput.style.height = "auto";
  el.messageInput.style.height = `${Math.min(260, Math.max(56, el.messageInput.scrollHeight))}px`;
}

function updateSendButton() {
  el.sendButton.disabled = state.busy || (!el.messageInput.value.trim() && state.attachments.length === 0);
}

function setBusy(busy) {
  state.busy = busy;
  el.sendButton.disabled = busy || (!el.messageInput.value.trim() && state.attachments.length === 0);
  el.testButton.disabled = busy;
  el.saveButton.disabled = busy;
}

function chatSettingsPayload() {
  return {
    providerId: el.providerSelect.value,
    model: selectedModelId(),
    thinkingEnabled: state.thinkingEnabled,
    reasoningEffort: selectedEffort(),
    maxTokens: numberValue(el.maxTokensInput, 8192),
    contextWindow: numberValue(el.contextInput, 128000),
    temperature: numberValue(el.temperatureInput, 0.2),
    webSearchEnabled: state.webSearchEnabled,
    webSearchMaxResults: numberValue(el.webSearchMaxResultsInput, 5),
    webBraveApiKey: el.webBraveInput?.value ? el.webBraveInput.value : undefined,
    webTavilyApiKey: el.webTavilyInput?.value ? el.webTavilyInput.value : undefined,
    webSerperApiKey: el.webSerperInput?.value ? el.webSerperInput.value : undefined,
    webSearxngUrl: el.webSearxngInput?.value ? el.webSearxngInput.value : undefined,
    permissionMode: state.permissionMode,
  };
}

function formPayload() {
  const provider = currentProvider();
  const mode = selectedThemeMode();
  const dark = mode === "dark" || (mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  const preset = currentThemePreset();
  const uiFontSize = DEFAULT_UI_FONT_SIZE;
  const codeFontSize = DEFAULT_CODE_FONT_SIZE;
  return {
    providerId: el.providerSelect.value,
    model: selectedModelId(),
    baseUrl: el.baseUrlInput.value.trim(),
    language: state.language,
    apiKey: el.apiKeyInput.value ? el.apiKeyInput.value : undefined,
    authHeaderName: el.authHeaderInput.value.trim() || provider?.auth?.headerName || "Authorization",
    thinkingEnabled: state.thinkingEnabled,
    reasoningEffort: selectedEffort(),
    maxTokens: numberValue(el.maxTokensInput, 8192),
    contextWindow: numberValue(el.contextInput, 128000),
    temperature: numberValue(el.temperatureInput, 0.2),
    preserveReasoning: el.preserveReasoningInput.checked,
    webSearchEnabled: state.webSearchEnabled,
    webSearchMaxResults: numberValue(el.webSearchMaxResultsInput, 5),
    appearanceMode: mode,
    appearanceTheme: normalizeTheme(el.themePresetSelect.value),
    accentColor: safeColor(preset.accent, "#0169cc"),
    backgroundColor: safeColor(preset.background, dark ? "#111111" : "#ffffff"),
    foregroundColor: safeColor(el.foregroundColorInput.value, dark ? "#fcfcfc" : "#0d0d0d"),
    uiFont: normalizeFont(el.uiFontInput.value, DEFAULT_UI_FONT),
    codeFont: normalizeFont(el.codeFontInput.value, DEFAULT_CODE_FONT),
    fontScale: Math.round((uiFontSize / DEFAULT_UI_FONT_SIZE) * 100),
    uiFontSize,
    codeFontSize,
    density: normalizeDensity(el.densitySelect.value),
    translucentSidebar: el.translucentSidebarInput.checked,
    contrast: numberValue(el.contrastInput, 60),
    pointerCursor: el.pointerCursorInput.checked,
    motionMode: selectedMotionMode(),
    permissionMode: state.permissionMode,
    workspacePath: state.workspace || undefined,
    workspaceHistory: normalizeProjects(state.projects, state.workspace),
    sidebarWidth: state.sidebarWidth,
    sidebarCollapsed: state.sidebarCollapsed,
    researchOpenalexApiKey: el.researchOpenAlexInput?.value ? el.researchOpenAlexInput.value : undefined,
    researchSemanticScholarApiKey: el.researchSemanticScholarInput?.value ? el.researchSemanticScholarInput.value : undefined,
    researchGithubToken: el.researchGithubInput?.value ? el.researchGithubInput.value : undefined,
    researchCrossrefMailto: el.researchCrossrefMailtoInput?.value ? el.researchCrossrefMailtoInput.value : undefined,
  };
}

async function saveConfig() {
  const oldText = el.saveButton.textContent;
  el.saveButton.disabled = true;
  el.saveButton.textContent = t("saving");
  try {
    const payload = formPayload();
    const response = await api("/config", { method: "POST", body: JSON.stringify(payload) });
    state.settings = response.settings || state.settings;
    normalizeLegacySettings();
    state.configuredProviders[payload.providerId] = state.configuredProviders[payload.providerId] || !!payload.apiKey;
    if (payload.apiKey) {
      state.configuredProviders[payload.providerId] = true;
      el.apiKeyInput.value = "";
      toast(t("apiKeySaved"));
    }
    const researchSaved = [
      ["openalex", "researchOpenalexApiKey", el.researchOpenAlexInput],
      ["semanticScholar", "researchSemanticScholarApiKey", el.researchSemanticScholarInput],
      ["github", "researchGithubToken", el.researchGithubInput],
      ["crossref", "researchCrossrefMailto", el.researchCrossrefMailtoInput],
    ].filter(([, key]) => payload[key]);
    for (const [source, , input] of researchSaved) {
      state.configuredResearchSources[source] = true;
      if (input) input.value = "";
    }
    const webSaved = [
      ["brave", "webBraveApiKey", el.webBraveInput],
      ["tavily", "webTavilyApiKey", el.webTavilyInput],
      ["serper", "webSerperApiKey", el.webSerperInput],
      ["searxng", "webSearxngUrl", el.webSearxngInput],
    ].filter(([, key]) => payload[key]);
    for (const [source, , input] of webSaved) {
      state.configuredWebSearch[source] = true;
      if (input) input.value = "";
    }
    applySettingsToState();
    applySettingsToForm();
    renderProjects();
    renderSessions();
    updateProviderStatus();
    updateApiKeyHelp();
    updateWebSearchControls();
    updateResearchSourceStatus();
    el.saveButton.textContent = t("saved");
    el.saveButton.classList.add("saved");
    setTimeout(() => {
      el.saveButton.textContent = oldText || t("save");
      el.saveButton.classList.remove("saved");
      el.saveButton.disabled = false;
    }, 1400);
  } catch (error) {
    el.saveButton.textContent = oldText || t("save");
    el.saveButton.disabled = false;
    toast(`${t("saveFailed")}: ${error.message || error}`, true);
  }
}

async function testConnection() {
  el.testButton.disabled = true;
  const old = el.testButton.textContent;
  el.testButton.textContent = t("testing");
  try {
    await api("/test-connection", {
      method: "POST",
      body: JSON.stringify({
        providerId: el.providerSelect.value,
        model: selectedModelId(),
        baseUrl: el.baseUrlInput.value.trim(),
        apiKey: el.apiKeyInput.value || undefined,
        authHeaderName: el.authHeaderInput.value.trim(),
      }),
    });
    toast(t("connectionOk"));
  } catch (error) {
    toast(`${t("connectionFailed")}: ${error.message || error}`, true);
  } finally {
    el.testButton.textContent = old || t("testConnection");
    el.testButton.disabled = false;
  }
}

const SETTINGS_SECTION_COPY = {
  general: ["general", "generalHelp"],
  models: ["modelAccess", "modelAccessHelp"],
  appearance: ["appearance", "appearanceHelp"],
  web: ["webSearch", "webSearchHelp"],
  research: ["researchSources", "researchSourcesHelp"],
  cache: ["cache", "cacheHelp"],
  portable: ["portable", "portableHelp"],
};

function showSettings(section = state.settingsSection) {
  state.settingsSection = section;
  el.settingsOverlay.classList.remove("hidden");
  const copy = SETTINGS_SECTION_COPY[section] || SETTINGS_SECTION_COPY.general;
  el.settingsTitle.textContent = t(copy[0]);
  el.settingsSubtitle.textContent = t(copy[1]);
  document.querySelectorAll("[data-settings-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsTarget === section);
  });
  document.querySelectorAll("[data-settings-section]").forEach((panel) => {
    panel.classList.remove("active");
  });
  const target = document.querySelector(`[data-settings-section="${section}"]`);
  target?.classList.add("active");
  requestAnimationFrame(() => {
    const content = document.querySelector(".settings-content");
    if (!target || !content) return;
    const offset = target.offsetTop - 42;
    content.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
  });
}

function hideSettings() {
  el.settingsOverlay.classList.add("hidden");
}

function updateCacheStatus() {
  if (!state.lastMetric) {
    el.cacheStatusValue.textContent = t("cacheNoMetric");
    return;
  }
  const metric = state.lastMetric;
  const parts = [
    t("cacheHitMiss", { hit: metric.cacheHitTokens || 0, miss: metric.cacheMissTokens || 0 }),
    t("hitRatio", { ratio: Math.round((metric.hitRatio || 0) * 100) }),
    t("tokenCount", { count: metric.totalTokens || 0 }),
  ];
  if (metric.contextTruncated) {
    parts.push(t("truncated", { count: metric.contextTruncatedMessages || 0 }));
  }
  el.cacheStatusValue.textContent = parts.join(" · ");
}

function togglePopover(menu, button, event) {
  event?.stopPropagation();
  const wasHidden = menu.classList.contains("hidden");
  closeAllPopovers();
  menu.classList.toggle("hidden", !wasHidden);
  button?.setAttribute("aria-expanded", String(wasHidden));
}

function closePopoverOnOutside(event, menu, button) {
  if (!menu || menu.classList.contains("hidden")) return;
  if (!menu.contains(event.target) && !button?.contains(event.target)) {
    menu.classList.add("hidden");
    button?.setAttribute("aria-expanded", "false");
  }
}

function closeAllPopovers() {
  [el.permissionMenu, el.effortMenu].forEach((menu) => menu?.classList.add("hidden"));
  [el.permissionButton, el.effortMenuButton].forEach((button) => button?.setAttribute("aria-expanded", "false"));
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  applySidebarState(true);
}

function applySidebarState(save) {
  const width = state.sidebarCollapsed ? 64 : clampInt(state.sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT);
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  el.app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  if (save) {
    saveLayoutSettings();
  }
}

function startSidebarResize(event) {
  if (state.sidebarCollapsed) return;
  event.preventDefault();
  state.resizeSidebar = {
    startX: event.clientX,
    startWidth: state.sidebarWidth,
  };
  document.body.classList.add("resizing-sidebar");
  window.addEventListener("pointermove", onSidebarResize);
  window.addEventListener("pointerup", stopSidebarResize, { once: true });
}

function onSidebarResize(event) {
  if (!state.resizeSidebar) return;
  const next = clampInt(state.resizeSidebar.startWidth + event.clientX - state.resizeSidebar.startX, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT);
  state.sidebarWidth = next;
  state.sidebarCollapsed = false;
  applySidebarState(false);
}

function stopSidebarResize() {
  if (!state.resizeSidebar) return;
  state.resizeSidebar = null;
  document.body.classList.remove("resizing-sidebar");
  window.removeEventListener("pointermove", onSidebarResize);
  saveLayoutSettings();
}

function readResearchSplitWidth() {
  try {
    return clampResearchSplitWidth(window.localStorage.getItem("rainyResearchSplitWidth"));
  } catch {
    return RESEARCH_SPLIT_DEFAULT;
  }
}

function clampResearchSplitWidth(value) {
  const surfaceWidth = el.mainSurface?.clientWidth || window.innerWidth || 1200;
  const rightMinimum = 460;
  const handleWidth = 18;
  const dynamicMax = Math.max(RESEARCH_SPLIT_MIN, surfaceWidth - rightMinimum - handleWidth - 24);
  const max = Math.min(RESEARCH_SPLIT_MAX, dynamicMax);
  return clampInt(value, RESEARCH_SPLIT_MIN, max, RESEARCH_SPLIT_DEFAULT);
}

function applyResearchSplitWidth(width) {
  const next = clampResearchSplitWidth(width);
  state.researchSplitWidth = next;
  document.documentElement.style.setProperty("--research-left-width", `${next}px`);
}

function startResearchSplitResize(event) {
  event.preventDefault();
  state.resizeResearchSplit = {
    startX: event.clientX,
    startWidth: state.researchSplitWidth,
  };
  document.body.classList.add("resizing-research");
  window.addEventListener("pointermove", onResearchSplitResize);
  window.addEventListener("pointerup", stopResearchSplitResize, { once: true });
  window.addEventListener("pointercancel", stopResearchSplitResize, { once: true });
}

function onResearchSplitResize(event) {
  if (!state.resizeResearchSplit) return;
  applyResearchSplitWidth(state.resizeResearchSplit.startWidth + event.clientX - state.resizeResearchSplit.startX);
}

function stopResearchSplitResize() {
  if (!state.resizeResearchSplit) return;
  state.resizeResearchSplit = null;
  document.body.classList.remove("resizing-research");
  window.removeEventListener("pointermove", onResearchSplitResize);
  window.removeEventListener("pointerup", stopResearchSplitResize);
  window.removeEventListener("pointercancel", stopResearchSplitResize);
  try {
    window.localStorage.setItem("rainyResearchSplitWidth", String(state.researchSplitWidth));
  } catch (error) {
    console.warn("Failed to save research split width", error);
  }
}

async function saveLayoutSettings() {
  try {
    await api("/config", {
      method: "POST",
      body: JSON.stringify({
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    });
  } catch (error) {
    console.warn("Failed to save layout", error);
  }
}

function applyPresetToForm() {
  const preset = currentThemePreset();
  setThemeMode(preset.mode);
  el.foregroundColorInput.value = preset.foreground;
  el.uiFontInput.value = preset.uiFont;
  el.codeFontInput.value = preset.codeFont;
  el.uiFontSizeInput.value = DEFAULT_UI_FONT_SIZE;
  el.codeFontSizeInput.value = DEFAULT_CODE_FONT_SIZE;
  el.densitySelect.value = preset.density;
  el.translucentSidebarInput.checked = preset.translucentSidebar;
  el.contrastInput.value = preset.contrast;
  applyAppearanceFromForm();
}

function resetAppearance() {
  el.themePresetSelect.value = "rainy-research-default";
  setMotionMode("system");
  applyPresetToForm();
}

function setThemeMode(mode) {
  const normalized = ["light", "dark", "system"].includes(mode) ? mode : "dark";
  [el.themeModeLight, el.themeModeDark, el.themeModeSystem].forEach((button) => {
    button.classList.toggle("active", button.dataset.themeMode === normalized);
  });
}

function applyThemeModeDefaults(mode) {
  const normalized = ["light", "dark", "system"].includes(mode) ? mode : "dark";
  const dark = normalized === "dark" || (normalized === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  if (dark) {
    el.themePresetSelect.value = "rainy-research-default";
    el.foregroundColorInput.value = "#FCFCFC";
    el.contrastInput.value = 60;
  } else {
    el.themePresetSelect.value = "rainy-research-light";
    el.foregroundColorInput.value = "#0D0D0D";
    el.contrastInput.value = 45;
  }
}

function selectedThemeMode() {
  return document.querySelector(".segmented [data-theme-mode].active")?.dataset.themeMode || "dark";
}

function setMotionMode(mode) {
  const normalized = normalizeMotionMode(mode);
  el.motionModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.motionMode === normalized);
  });
}

function selectedMotionMode() {
  return document.querySelector("[data-motion-mode].active")?.dataset.motionMode || "system";
}

function applyAppearanceFromSettings() {
  applySettingsToForm();
  applyAppearanceFromForm();
}

function applyAppearanceFromForm() {
  const root = document.documentElement;
  const mode = selectedThemeMode();
  const dark = mode === "dark" || (mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  const preset = currentThemePreset();
  const bg = safeColor(preset.background, dark ? "#111111" : "#ffffff");
  const fg = safeColor(el.foregroundColorInput.value, dark ? "#fcfcfc" : "#0d0d0d");
  const accent = safeColor(preset.accent, "#0169cc");
  const contrast = numberValue(el.contrastInput, 60);
  const uiFontSize = DEFAULT_UI_FONT_SIZE;
  const codeFontSize = DEFAULT_CODE_FONT_SIZE;
  const density = normalizeDensity(el.densitySelect.value);
  const motionMode = normalizeMotionMode(selectedMotionMode());
  const prefersReducedMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const motionEnabled = motionMode === "on" || (motionMode === "system" && !prefersReducedMotion);
  const surface0 = mixColor(bg, fg, dark ? 0.03 : 0.02);
  const surface1 = mixColor(bg, fg, dark ? 0.06 : 0.035);
  const surface2 = mixColor(bg, fg, dark ? 0.1 : 0.07);
  const surface3 = mixColor(bg, fg, dark ? 0.15 : 0.11);
  const border = mixColor(bg, fg, dark ? 0.18 : 0.12);
  const hover = mixColor(bg, fg, dark ? 0.14 : 0.08);
  const muted = mixColor(bg, fg, dark ? 0.56 : 0.5);
  const titlebarBg = dark ? "#080808" : "#fafafa";
  const titlebarFg = dark ? "#f5f5f5" : "#111111";
  const sidebarBg = dark ? hexToRgba(bg, 0.98) : mixColor(bg, fg, 0.02);
  const sidebarTranslucent = dark ? hexToRgba(bg, 0.72) : hexToRgba(mixColor(bg, fg, 0.02), 0.82);
  const composerBg = dark ? mixColor(bg, fg, 0.12) : "#ffffff";
  const composerBorder = mixColor(bg, fg, dark ? 0.23 : 0.16);
  const userMessageBg = dark ? mixColor(bg, fg, 0.1) : mixColor(bg, fg, 0.07);
  const userMessageFg = dark ? "#f5f5f5" : "#111111";
  root.style.setProperty("--app-bg", bg);
  root.style.setProperty("--app-fg", fg);
  root.style.setProperty("--surface-0", surface0);
  root.style.setProperty("--surface-1", surface1);
  root.style.setProperty("--surface-2", surface2);
  root.style.setProperty("--surface-3", surface3);
  root.style.setProperty("--surface-hover", hover);
  root.style.setProperty("--border", border);
  root.style.setProperty("--border-strong", mixColor(bg, fg, dark ? 0.28 : 0.2));
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--muted-strong", mixColor(bg, fg, dark ? 0.72 : 0.62));
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--font-ui", normalizeFont(el.uiFontInput.value, DEFAULT_UI_FONT));
  root.style.setProperty("--font-code", normalizeFont(el.codeFontInput.value, DEFAULT_CODE_FONT));
  root.style.setProperty("--ui-font-size", `${uiFontSize}px`);
  root.style.setProperty("--code-font-size", `${codeFontSize}px`);
  root.style.setProperty("--font-scale", "1");
  root.style.setProperty("--density-scale", density === "compact" ? "0.86" : density === "spacious" ? "1.16" : "1");
  root.dataset.density = density;
  root.style.setProperty("--settings-bg", bg);
  root.style.setProperty("--settings-sidebar", dark ? surface0 : "#f4f6f7");
  root.style.setProperty("--settings-row", surface1);
  root.style.setProperty("--settings-card", surface2);
  root.style.setProperty("--settings-fg", fg);
  root.style.setProperty("--settings-muted", muted);
  root.style.setProperty("--titlebar-bg", titlebarBg);
  root.style.setProperty("--titlebar-fg", titlebarFg);
  root.style.setProperty("--titlebar-border", "transparent");
  root.style.setProperty("--sidebar-bg", sidebarBg);
  root.style.setProperty("--sidebar-bg-translucent", sidebarTranslucent);
  root.style.setProperty("--composer-bg", composerBg);
  root.style.setProperty("--composer-border", composerBorder);
  root.style.setProperty("--composer-shadow", "none");
  root.style.setProperty("--composer-input-fg", fg);
  root.style.setProperty("--composer-placeholder", muted);
  root.style.setProperty("--composer-fade", hexToRgba(bg, 0));
  root.style.setProperty("--send-bg", dark ? "#f4f4f4" : "#0d0d0d");
  root.style.setProperty("--send-fg", dark ? "#0b0b0b" : "#ffffff");
  root.style.setProperty("--user-message-bg", userMessageBg);
  root.style.setProperty("--user-message-fg", userMessageFg);
  root.style.setProperty("--popover-bg", dark ? surface2 : "#ffffff");
  root.style.setProperty("--popover-fg", fg);
  root.style.setProperty("--popover-hover", hover);
  root.style.setProperty("--scrollbar-thumb", dark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.14)");
  root.style.setProperty("--focus-ring", `0 0 0 2px ${hexToRgba(accent, 0.35)}`);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.translucentSidebar = String(el.translucentSidebarInput.checked);
  root.dataset.pointerCursor = String(el.pointerCursorInput.checked);
  root.dataset.motion = motionEnabled ? "on" : "off";
  root.dataset.motionMode = motionMode;
  root.style.setProperty("--composer-height", `${density === "compact" ? 146 : density === "spacious" ? 190 : 168}px`);
  root.style.setProperty("--thread-width", `${Math.round(68 + (contrast - 60) * 0.12)}rem`);
  if (window.deepx?.setWindowTheme) {
    window.deepx.setWindowTheme({ background: titlebarBg, foreground: titlebarFg }).catch((error) => {
      console.warn("Failed to update window theme", error);
    });
  }
  updateTerminalTheme();
  updateContextLabels();
}

function updateTerminalTheme() {
  if (!state.terminal) return;
  const styles = getComputedStyle(document.documentElement);
  state.terminal.options.theme = {
    background: styles.getPropertyValue("--surface-1").trim(),
    foreground: styles.getPropertyValue("--app-fg").trim(),
    cursor: styles.getPropertyValue("--app-fg").trim(),
    selectionBackground: hexToRgba(styles.getPropertyValue("--accent").trim(), 0.35),
  };
  state.terminal.options.fontFamily = normalizeFont(el.codeFontInput.value, DEFAULT_CODE_FONT);
  state.terminal.options.fontSize = DEFAULT_CODE_FONT_SIZE;
}

async function toggleTerminal(force = null) {
  const next = force === null ? !state.terminalOpen : !!force;
  state.terminalOpen = next;
  el.terminalPanel.classList.toggle("hidden", !next);
  el.mainSurface.classList.toggle("terminal-open", next);
  el.terminalToggleButton.classList.toggle("active", next);
  if (next) {
    await startTerminal();
    setTimeout(() => {
      fitTerminal();
      state.terminal?.focus();
    }, 0);
  }
}

async function startTerminal() {
  if (state.terminalStarted || state.terminalStarting) {
    state.terminal?.focus();
    return;
  }
  state.terminalStarting = true;
  initTerminal();
  const cwd = state.workspace || await fallbackCwd();
  el.terminalCwdLabel.textContent = basename(cwd) || cwd || "PowerShell";
  try {
    fitTerminal();
    const result = await window.deepx.terminalStart({
      cwd,
      cols: state.terminal.cols || 120,
      rows: state.terminal.rows || 24,
    });
    state.terminalStarted = true;
    state.terminalCwd = result?.cwd || cwd;
    el.terminalCwdLabel.textContent = state.terminalCwd;
    state.terminal.focus();
  } catch (error) {
    state.terminal.write(`\r\n${error.message || error}\r\n`);
    toast(`${t("streamError")}: ${error.message || error}`, true);
  } finally {
    state.terminalStarting = false;
  }
}

function initTerminal() {
  if (state.terminal) return;
  const TerminalCtor = window.Terminal;
  const FitCtor = window.FitAddon?.FitAddon;
  if (!TerminalCtor || !FitCtor) {
    throw new Error("xterm.js is not loaded");
  }
  const styles = getComputedStyle(document.documentElement);
  state.terminal = new TerminalCtor({
    convertEol: true,
    cursorBlink: true,
    fontFamily: normalizeFont(el.codeFontInput.value, DEFAULT_CODE_FONT),
    fontSize: DEFAULT_CODE_FONT_SIZE,
    scrollback: 10000,
    theme: {
      background: styles.getPropertyValue("--surface-1").trim(),
      foreground: styles.getPropertyValue("--app-fg").trim(),
      cursor: styles.getPropertyValue("--app-fg").trim(),
      selectionBackground: hexToRgba(styles.getPropertyValue("--accent").trim(), 0.35),
    },
  });
  state.terminalFit = new FitCtor();
  state.terminal.loadAddon(state.terminalFit);
  state.terminal.open(el.terminalContainer);
  state.terminal.onData((data) => {
    window.deepx.terminalWrite(data).catch((error) => {
      console.warn("terminal write failed", error);
    });
  });
  state.terminal.onResize(({ cols, rows }) => {
    if (state.terminalStarted) {
      window.deepx.terminalResize({ cols, rows }).catch((error) => console.warn("terminal resize failed", error));
    }
  });
  updateTerminalTheme();
}

function setupTerminalDataListener() {
  if (state.terminalDataListenerReady) return;
  state.terminalDataDispose = window.deepx.onTerminalData((payload) => {
    if (!state.terminal) initTerminal();
    if (payload?.text) {
      state.terminal.write(payload.text);
    }
  });
  state.terminalDataListenerReady = true;
}

function setupSshDataListener() {
  if (state.sshDataListenerReady || !window.deepx?.onSshData) return;
  state.sshDataDispose = window.deepx.onSshData((payload) => {
    if (payload?.id && state.ssh.id && payload.id !== state.ssh.id) return;
    appendSshOutput(payload?.text || "");
  });
  state.sshDataListenerReady = true;
}

function toggleServerMonitorPanel() {
  el.serverMonitorPanel?.classList.toggle("hidden");
  el.serverMonitorPanel?.scrollIntoView({ block: "nearest" });
}

function appendSshOutput(text) {
  if (!el.sshOutput || !text) return;
  el.sshOutput.textContent += text;
  const maxLength = 80_000;
  if (el.sshOutput.textContent.length > maxLength) {
    el.sshOutput.textContent = el.sshOutput.textContent.slice(-maxLength);
  }
  el.sshOutput.scrollTop = el.sshOutput.scrollHeight;
}

async function connectSsh() {
  el.serverMonitorPanel?.classList.remove("hidden");
  el.sshConnectButton.disabled = true;
  try {
    const result = await window.deepx.sshConnect({
      host: el.sshHostInput.value.trim(),
      port: numberValue(el.sshPortInput, 22),
      username: el.sshUserInput.value.trim(),
      password: el.sshPasswordInput.value,
    });
    state.ssh.id = result.id;
    state.ssh.connected = true;
    el.sshPasswordInput.value = "";
    appendSshOutput(`[本地] 已连接 ${result.username}@${result.host}:${result.port}\n`);
  } catch (error) {
    appendSshOutput(`[本地] SSH 连接失败: ${error.message || error}\n`);
    toast(`SSH 连接失败: ${error.message || error}`, true);
  } finally {
    el.sshConnectButton.disabled = false;
  }
}

async function disconnectSsh() {
  if (!state.ssh.id) return;
  await window.deepx.sshDisconnect(state.ssh.id).catch(() => {});
  appendSshOutput("[本地] SSH 已断开\n");
  state.ssh.id = null;
  state.ssh.connected = false;
  state.ssh.monitorRunning = false;
}

async function sendSshCommand() {
  const command = el.sshCommandInput.value.trim();
  if (!command || !state.ssh.id) return;
  el.sshCommandInput.value = "";
  appendSshOutput(`\n$ ${command}\n`);
  try {
    await window.deepx.sshWrite({ id: state.ssh.id, data: `${command}\n` });
  } catch (error) {
    appendSshOutput(`[本地] 命令发送失败: ${error.message || error}\n`);
  }
}

async function startSshMonitor() {
  const command = el.sshMonitorCommandInput.value.trim();
  if (!command || !state.ssh.id) return;
  try {
    const result = await window.deepx.sshMonitorStart({
      id: state.ssh.id,
      command,
      intervalMinutes: numberValue(el.sshMonitorIntervalInput, 60),
    });
    state.ssh.monitorRunning = true;
    appendSshOutput(`[本地] 已开始每 ${result.intervalMinutes} 分钟巡检: ${command}\n`);
  } catch (error) {
    appendSshOutput(`[本地] 启动巡检失败: ${error.message || error}\n`);
  }
}

async function stopSshMonitor() {
  if (!state.ssh.id) return;
  await window.deepx.sshMonitorStop(state.ssh.id).catch(() => {});
  state.ssh.monitorRunning = false;
  appendSshOutput("[本地] 已停止巡检\n");
}

async function restartTerminal() {
  await stopTerminal(false);
  if (state.terminal) {
    state.terminal.clear();
  }
  await startTerminal();
}

async function stopTerminal(dispose = false) {
  try {
    await window.deepx.terminalStop();
  } catch (error) {
    console.warn("terminal stop failed", error);
  }
  state.terminalStarted = false;
  state.terminalStarting = false;
  if (dispose && state.terminal) {
    state.terminal.dispose();
    state.terminal = null;
    state.terminalFit = null;
  }
  el.terminalCwdLabel.textContent = "PowerShell";
}

function fitTerminal() {
  if (!state.terminalOpen || !state.terminalFit) return;
  try {
    state.terminalFit.fit();
  } catch (error) {
    console.warn("terminal fit failed", error);
  }
}

async function fallbackCwd() {
  const paths = state.paths || await window.deepx.getPaths().catch(() => null);
  return state.workspace || paths?.appRoot || state.core?.dataRoot || ".";
}

function parentDir(pathValue) {
  const parts = String(pathValue || "").split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return null;
  const prefix = /^[a-zA-Z]:/.test(parts[0]) ? `${parts.shift()}\\` : "";
  parts.pop();
  return prefix + parts.join("\\");
}

function normalizePermissionMode(mode) {
  return PERMISSION_MODES.includes(mode) ? mode : "default";
}

function normalizeTheme(theme) {
  if (theme === LEGACY_THEME_DARK || theme === "deepx-default") return "rainy-research-default";
  if (theme === LEGACY_THEME_LIGHT || theme === "deepx-light") return "rainy-research-light";
  return THEME_PRESETS.some((item) => item.id === theme) ? theme : "rainy-research-default";
}

function normalizeDensity(density) {
  return ["compact", "comfortable", "spacious"].includes(density) ? density : "comfortable";
}

function normalizeMotionMode(mode) {
  return ["system", "on", "off"].includes(mode) ? mode : "system";
}

function normalizeFont(value, fallback) {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function safeColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : fallback;
}

function numberValue(input, fallback) {
  const raw = typeof input === "object" ? input.value : input;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(state.language === "zh-CN" ? "zh-CN" : "en-US");
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function formatContext(value) {
  const numeric = Number(value) || 0;
  if (numeric >= 1_000_000) return `${Math.round(numeric / 1_000_000)}M`;
  if (numeric >= 1000) return `${Math.round(numeric / 1000)}K`;
  return String(numeric);
}

function mixColor(a, b, amount) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const mix = ca.map((value, index) => Math.round(value + (cb[index] - value) * amount));
  return `#${mix.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(color) {
  const safe = safeColor(color, "#000000").slice(1);
  return [0, 2, 4].map((index) => parseInt(safe.slice(index, index + 2), 16));
}

function hexToRgba(color, alpha) {
  const [r, g, b] = parseHex(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toast(message, error = false) {
  const item = document.createElement("div");
  item.className = `toast${error ? " error" : ""}`;
  item.textContent = message;
  el.toastHost.appendChild(item);
  setTimeout(() => {
    item.classList.add("leaving");
    setTimeout(() => item.remove(), 220);
  }, 2600);
}
