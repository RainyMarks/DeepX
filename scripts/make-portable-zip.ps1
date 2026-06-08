$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PackageJson = Get-Content -Raw -LiteralPath (Join-Path $Root "package.json") | ConvertFrom-Json
$AppVersion = [string]$PackageJson.version
$Dist = Join-Path $Root "dist"
$Out = Join-Path $Dist "RainyReSearch-portable"
$Zip = Join-Path $Dist "RainyReSearch-portable-v$AppVersion.zip"

if (Test-Path $Out) {
  $resolved = (Resolve-Path $Out).Path
  if (-not $resolved.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove outside workspace: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$topFiles = @(
  "RainyReSearch.exe",
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "d3dcompiler_47.dll",
  "dxcompiler.dll",
  "dxil.dll",
  "ffmpeg.dll",
  "icudtl.dat",
  "libEGL.dll",
  "libGLESv2.dll",
  "LICENSE",
  "LICENSES.chromium.html",
  "package.json",
  "README_DEEPX.md",
  "resources.pak",
  "snapshot_blob.bin",
  "v8_context_snapshot.bin",
  "version",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
  "vulkan-1.dll"
)

foreach ($file in $topFiles) {
  Copy-Item -Force (Join-Path $Root $file) (Join-Path $Out $file)
}

Copy-Item -Recurse -Force (Join-Path $Root "locales") (Join-Path $Out "locales")
Copy-Item -Recurse -Force (Join-Path $Root "resources") (Join-Path $Out "resources")

foreach ($legacyResource in @(
  ([string]::Concat("node", "_repl.exe")),
  ([string]::Concat("cod", "ex-notification.wav"))
)) {
  Remove-Item -Force -LiteralPath (Join-Path (Join-Path $Out "resources") $legacyResource) -ErrorAction SilentlyContinue
}

$unpacked = Join-Path $Out "resources\app.asar.unpacked"
if (!(Test-Path -LiteralPath $unpacked)) {
  throw "Portable output is missing resources\app.asar.unpacked"
}
$nativeNodes = @(Get-ChildItem -LiteralPath $unpacked -Recurse -Filter "*.node" -ErrorAction SilentlyContinue)
if ($nativeNodes.Count -eq 0) {
  throw "Portable output is missing unpacked native .node modules"
}
$iconPng = Join-Path $Out "resources\rainy-research-assets\icon.png"
$iconIco = Join-Path $Out "resources\rainy-research-assets\icon.ico"
foreach ($icon in @($iconPng, $iconIco)) {
  if (!(Test-Path -LiteralPath $icon)) {
    throw "Portable output is missing icon asset: $icon"
  }
}

$dataOut = Join-Path $Out "data"
foreach ($dir in @(
  "appdata",
  "cache-metrics",
  "config",
  "electron-user-data",
  "home",
  "localappdata",
  "logs",
  "plugins",
  "research",
  "research\repos",
  "research\reports",
  "sessions",
  "skills",
  "tmp"
)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $dataOut $dir) | Out-Null
}

$defaultSettings = [ordered]@{
  providerId = "deepseek"
  model = "deepseek-v4-flash"
  baseUrl = "https://api.deepseek.com"
  language = "zh-CN"
  thinkingEnabled = $true
  reasoningEffort = "max"
  maxTokens = 8192
  contextWindow = 1000000
  temperature = 0.2
  preserveReasoning = $false
  webSearchEnabled = $false
  webSearchMaxResults = 5
  appearanceMode = "dark"
  appearanceTheme = "rainy-research-default"
  accentColor = "#0169cc"
  backgroundColor = "#111111"
  foregroundColor = "#FCFCFC"
  uiFont = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
  codeFont = '"JetBrains Mono", ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace'
  fontScale = 100
  uiFontSize = 14
  codeFontSize = 12
  density = "comfortable"
  translucentSidebar = $false
  contrast = 60
  pointerCursor = $true
  motionMode = "system"
  permissionMode = "default"
  workspacePath = $null
  workspaceHistory = @()
  sidebarWidth = 232
  sidebarCollapsed = $false
  customProvider = $null
}
$settingsJson = ($defaultSettings | ConvertTo-Json -Depth 8) + [Environment]::NewLine
$settingsPath = Join-Path $dataOut "config\settings.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($settingsPath, $settingsJson, $utf8NoBom)
$settingsBytes = [System.IO.File]::ReadAllBytes($settingsPath)
if ($settingsBytes.Length -ge 3 -and $settingsBytes[0] -eq 0xEF -and $settingsBytes[1] -eq 0xBB -and $settingsBytes[2] -eq 0xBF) {
  throw "Portable settings.json must be UTF-8 without BOM"
}

$secretPath = Join-Path $dataOut "secrets.local.json"
if (Test-Path -LiteralPath $secretPath) {
  Remove-Item -Force -LiteralPath $secretPath
}
if (Test-Path -LiteralPath $secretPath) {
  throw "Portable output must not contain secrets.local.json"
}

$needles = @(
  ([string]::Concat("C:", "\Users\", "Ra1ny")),
  ([string]::Concat("~", "/.", "cod", "ex")),
  ([string]::Concat("chat", "gpt.com/", "cod", "ex/", "desktop", "-auth")),
  ([string]::Concat("login-with-chat", "gpt")),
  ([string]::Concat("OpenAI", ".Cod", "ex"))
)
foreach ($dynamicNeedle in @($env:USERPROFILE, $Root)) {
  if ($dynamicNeedle -and $dynamicNeedle.Trim()) {
    $needles += $dynamicNeedle
  }
}
$needles = @($needles | Where-Object { $_ } | Sort-Object -Unique)

function Get-RipgrepPath {
  $bundled = Join-Path $Root "resources\rg.exe"
  if (Test-Path -LiteralPath $bundled) {
    return $bundled
  }
  $candidate = Get-Command rg.exe -ErrorAction SilentlyContinue
  if (!$candidate) {
    $candidate = Get-Command rg -ErrorAction SilentlyContinue
  }
  if ($candidate) {
    return $candidate.Source
  }
  throw "ripgrep is required for release scanning. Put rg.exe in resources or install rg on PATH."
}

$Rg = Get-RipgrepPath
foreach ($needle in $needles) {
  $matches = & $Rg -n --text --fixed-strings $needle $Out 2>$null
  if ($LASTEXITCODE -eq 0) {
    throw "Portable output contains forbidden text '$needle':`n$matches"
  }
}

if (Test-Path $Zip) {
  Remove-Item -Force $Zip
}
Compress-Archive -Path (Join-Path $Out "*") -DestinationPath $Zip -Force

Write-Host "Portable output: $Out"
Write-Host "Portable zip:    $Zip"
