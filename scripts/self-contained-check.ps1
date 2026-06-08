$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Needles = @(
  ([string]::Concat("C:", "\Users\", "Ra1ny")),
  ([string]::Concat("Down", "loads")),
  ([string]::Concat("~", "/.", "cod", "ex")),
  ([string]::Concat("chat", "gpt.com/", "cod", "ex/", "desktop", "-auth")),
  ([string]::Concat("login-with-chat", "gpt")),
  ([string]::Concat("OpenAI", ".Cod", "ex"))
)
foreach ($dynamicNeedle in @($env:USERPROFILE, $Root)) {
  if ($dynamicNeedle -and $dynamicNeedle.Trim()) {
    $Needles += $dynamicNeedle
  }
}
$Needles = @($Needles | Where-Object { $_ } | Sort-Object -Unique)

$Targets = @(
  (Join-Path $Root "electron\main.js"),
  (Join-Path $Root "electron\preload.js"),
  (Join-Path $Root "electron\renderer"),
  (Join-Path $Root "electron\package.json"),
  (Join-Path $Root "resources\app.asar"),
  (Join-Path $Root "resources\app.asar.unpacked"),
  (Join-Path $Root "resources\deepx-core.exe"),
  (Join-Path $Root "core\src")
)

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
  throw "ripgrep is required for self-contained scanning. Put rg.exe in resources or install rg on PATH."
}

$Rg = Get-RipgrepPath
$failures = @()
foreach ($needle in $Needles) {
  foreach ($target in $Targets) {
    if (Test-Path $target) {
      $matches = & $Rg -n --text --fixed-strings $needle $target 2>$null
      if ($LASTEXITCODE -eq 0) {
        $failures += "Found '$needle' in $target`n$matches"
      }
    }
  }
}

if ($failures.Count -gt 0) {
  $failures -join "`n`n" | Write-Error
  exit 1
}

foreach ($required in @(
  (Join-Path $Root "resources\deepx-assets\icon.png"),
  (Join-Path $Root "resources\deepx-assets\icon.ico")
)) {
  if (!(Test-Path -LiteralPath $required)) {
    throw "Missing required release asset: $required"
  }
}

foreach ($forbidden in @(
  (Join-Path $Root ([string]::Concat("resources\node", "_repl.exe"))),
  (Join-Path $Root ([string]::Concat("resources\cod", "ex-notification.wav")))
)) {
  if (Test-Path -LiteralPath $forbidden) {
    throw "Forbidden legacy resource must not be present: $forbidden"
  }
}

$Unpacked = Join-Path $Root "resources\app.asar.unpacked"
if (Test-Path -LiteralPath $Unpacked) {
  $nativeNodes = @(Get-ChildItem -LiteralPath $Unpacked -Recurse -Filter "*.node" -ErrorAction SilentlyContinue)
  if ($nativeNodes.Count -eq 0) {
    throw "resources\app.asar.unpacked exists but contains no native .node modules"
  }
}

Write-Host "Self-contained check passed."
