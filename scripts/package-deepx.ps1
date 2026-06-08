$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PackageJson = Get-Content -Raw -LiteralPath (Join-Path $Root "package.json") | ConvertFrom-Json
$AppVersion = [string]$PackageJson.version
$BackupRoot = Join-Path (Split-Path $Root -Parent) "RainyReSearch-original-backup"
$Resources = Join-Path $Root "resources"
$Data = Join-Path $Root "data"
$IconOut = Join-Path $Resources "rainy-research-assets"
$LegacyIconOut = Join-Path $Resources "deepx-assets"
$PortableTransferDirName = [string]::Concat("Down", "loads")
$IconSource = $null
$PreferredIcon = Join-Path $Resources "YR.png"
$BundledIcon = Join-Path $IconOut "icon.png"
if (Test-Path -LiteralPath $PreferredIcon) {
  $IconSource = $PreferredIcon
} elseif (Test-Path -LiteralPath $BundledIcon) {
  $IconSource = $BundledIcon
} elseif (Test-Path -LiteralPath (Join-Path $LegacyIconOut "icon.png")) {
  $IconSource = Join-Path $LegacyIconOut "icon.png"
} else {
  $DownloadDirName = [string]::Concat("Down", "loads")
  $DownloadDir = Join-Path $env:USERPROFILE $DownloadDirName
  if (Test-Path -LiteralPath $DownloadDir) {
    $IconSource = Get-ChildItem -Path $DownloadDir -Filter "*00_27_33.png" |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
}

Write-Host "[RainyReSearch] root: $Root"
Write-Host "[RainyReSearch] backup: $BackupRoot"

function Copy-FileWithRetry {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [int]$Attempts = 12
  )
  $lastError = $null
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      Copy-Item -Force -LiteralPath $Source -Destination $Destination
      return
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds ([Math]::Min(5000, 350 * $i))
    }
  }
  throw $lastError
}

foreach ($dir in @(
  $Resources,
  $Data,
  (Join-Path $Data "config"),
  (Join-Path $Data "sessions"),
  (Join-Path $Data "logs"),
  (Join-Path $Data "plugins"),
  (Join-Path $Data "skills"),
  (Join-Path $Data "cache-metrics"),
  (Join-Path $Data "research"),
  (Join-Path $Data "research\repos"),
  (Join-Path $Data "research\reports"),
  (Join-Path $Data "electron-user-data"),
  (Join-Path $Data "home"),
  (Join-Path $Data "home\Desktop"),
  (Join-Path $Data "home\Documents"),
  (Join-Path $Data (Join-Path "home" $PortableTransferDirName)),
  (Join-Path $Data "home\Pictures"),
  (Join-Path $Data "appdata"),
  (Join-Path $Data "localappdata")
)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

Write-Host "[RainyReSearch] building rainy-research-core.exe"
$rustFlagSeparator = [char]0x1f
$encodedRustFlags = @()
if ($env:CARGO_ENCODED_RUSTFLAGS) {
  $encodedRustFlags += ($env:CARGO_ENCODED_RUSTFLAGS -split $rustFlagSeparator)
}
$encodedRustFlags += "--remap-path-prefix=$Root=RainyReSearch"
if ($env:USERPROFILE) {
  $encodedRustFlags += "--remap-path-prefix=$($env:USERPROFILE)=USERPROFILE"
}
$env:CARGO_ENCODED_RUSTFLAGS = ($encodedRustFlags | Where-Object { $_ }) -join $rustFlagSeparator
cargo build --release --manifest-path (Join-Path $Root "core\Cargo.toml")
Copy-FileWithRetry (Join-Path $Root "core\target\release\rainy-research-core.exe") (Join-Path $Resources "rainy-research-core.exe")

$ElectronApp = Join-Path $Root "electron"
Write-Host "[RainyReSearch] installing Electron renderer dependencies"
npm --prefix $ElectronApp install --omit=dev --omit=optional
if ($LASTEXITCODE -ne 0) {
  throw "npm install failed with exit code $LASTEXITCODE"
}
$ElectronStage = Join-Path $env:TEMP "rainy-research-electron-app-stage"
Remove-Item -Recurse -Force $ElectronStage -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force $ElectronApp $ElectronStage
$StageNodeModules = Join-Path $ElectronStage "node_modules"
function Remove-StagePath {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) { return }
  $resolvedStage = (Resolve-Path -LiteralPath $ElectronStage).Path
  $resolvedTarget = (Resolve-Path -LiteralPath $Path).Path
  if (-not $resolvedTarget.StartsWith($resolvedStage, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove outside Electron stage: $resolvedTarget"
  }
  Remove-Item -Recurse -Force -LiteralPath $resolvedTarget -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $StageNodeModules) {
  Get-ChildItem -LiteralPath $StageNodeModules -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match '\.(md|markdown)$' -or
      $_.Name -match '^(README|CHANGELOG|HISTORY)(\.|$)'
    } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  foreach ($noiseDir in @(
    (Join-Path $StageNodeModules "node-pty\deps"),
    (Join-Path $StageNodeModules "node-pty\scripts"),
    (Join-Path $StageNodeModules "node-pty\test"),
    (Join-Path $StageNodeModules "node-pty\tests"),
    (Join-Path $StageNodeModules "ssh2\.github"),
    (Join-Path $StageNodeModules "ssh2\examples"),
    (Join-Path $StageNodeModules "ssh2\test"),
    (Join-Path $StageNodeModules "ssh2\util"),
    (Join-Path $StageNodeModules "ssh2\lib\protocol\crypto\build"),
    (Join-Path $StageNodeModules "ssh2\lib\protocol\crypto\src"),
    (Join-Path $StageNodeModules "cpu-features"),
    (Join-Path $StageNodeModules "nan")
  )) {
    Remove-StagePath $noiseDir
  }
  foreach ($noiseFile in @(
    (Join-Path $StageNodeModules "ssh2\install.js"),
    (Join-Path $StageNodeModules "ssh2\lib\protocol\crypto\binding.gyp")
  )) {
    Remove-Item -Force -LiteralPath $noiseFile -ErrorAction SilentlyContinue
  }
  Get-ChildItem -LiteralPath $StageNodeModules -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension -match '^\.(pdb|ipdb|iobj|obj|lib|exp|ilk|sln|vcxproj|filters|gyp|gypi|cc|c|h|cpp|hpp|tlog|recipe)$'
    } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

if (!$IconSource -or !(Test-Path -LiteralPath $IconSource)) {
  throw "Icon source not found: $IconSource"
}
Write-Host "[RainyReSearch] generating icon assets"
python (Join-Path $Root "scripts\make-icon.py") $IconSource $IconOut

foreach ($iconFile in @("icon.png", "icon.ico", "icon-256.png")) {
  $iconPath = Join-Path $IconOut $iconFile
  if (!(Test-Path -LiteralPath $iconPath)) {
    throw "Icon asset missing after generation: $iconPath"
  }
}

$RainyReSearchExe = Join-Path $Root "RainyReSearch.exe"
$ElectronVersion = "v41.2.0"
$ElectronTmp = Join-Path $env:TEMP "rainy-research-electron-dist"
$ElectronZip = Join-Path $ElectronTmp "electron.zip"
$ElectronOut = Join-Path $ElectronTmp "dist"
New-Item -ItemType Directory -Force -Path $ElectronTmp | Out-Null
if (!(Test-Path $ElectronZip)) {
  Write-Host "[RainyReSearch] downloading official Electron $ElectronVersion"
  Invoke-WebRequest -Uri "https://github.com/electron/electron/releases/download/$ElectronVersion/electron-$ElectronVersion-win32-x64.zip" -OutFile $ElectronZip
}
Remove-Item -Recurse -Force $ElectronOut -ErrorAction SilentlyContinue
Expand-Archive -Path $ElectronZip -DestinationPath $ElectronOut -Force

$ElectronRuntimeFiles = @(
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "d3dcompiler_47.dll",
  "dxcompiler.dll",
  "dxil.dll",
  "ffmpeg.dll",
  "icudtl.dat",
  "libEGL.dll",
  "libGLESv2.dll",
  "LICENSES.chromium.html",
  "resources.pak",
  "snapshot_blob.bin",
  "v8_context_snapshot.bin",
  "version",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
  "vulkan-1.dll"
)
foreach ($runtimeFile in $ElectronRuntimeFiles) {
  $src = Join-Path $ElectronOut $runtimeFile
  if (!(Test-Path -LiteralPath $src)) {
    throw "Electron runtime file missing after extraction: $src"
  }
  Copy-FileWithRetry $src (Join-Path $Root $runtimeFile)
}

$ElectronLocales = Join-Path $ElectronOut "locales"
if (!(Test-Path -LiteralPath $ElectronLocales)) {
  throw "Electron locales folder missing after extraction: $ElectronLocales"
}
Remove-Item -Recurse -Force (Join-Path $Root "locales") -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force $ElectronLocales (Join-Path $Root "locales")

Copy-FileWithRetry (Join-Path $ElectronOut "electron.exe") $RainyReSearchExe

$Asar = Join-Path $Resources "app.asar"
$UpstreamAsarBackupName = [string]::Concat("app.asar.", "cod", "ex-original")
$Backup = Join-Path $BackupRoot (Join-Path "resources" $UpstreamAsarBackupName)
$LegacyInTreeBackup = Join-Path $Resources $UpstreamAsarBackupName
if ((Test-Path $LegacyInTreeBackup) -and !(Test-Path $Backup)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Backup -Parent) | Out-Null
  Copy-Item -Force $LegacyInTreeBackup $Backup
} elseif ((Test-Path $Asar) -and !(Test-Path $Backup)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Backup -Parent) | Out-Null
  Copy-Item -Force $Asar $Backup
}

Write-Host "[RainyReSearch] packing Electron app.asar"
$AsarUnpacked = Join-Path $Resources "app.asar.unpacked"
Remove-Item -Recurse -Force $AsarUnpacked -ErrorAction SilentlyContinue
npx --yes asar pack $ElectronStage $Asar --unpack "**/*.node"
if ($LASTEXITCODE -ne 0) {
  throw "asar pack failed with exit code $LASTEXITCODE"
}
$NativeNodes = @()
if (Test-Path -LiteralPath $AsarUnpacked) {
  $NativeNodes = @(Get-ChildItem -LiteralPath $AsarUnpacked -Recurse -Filter "*.node" -ErrorAction SilentlyContinue)
}
if ($NativeNodes.Count -eq 0) {
  throw "node-pty native module was not unpacked into resources\app.asar.unpacked"
}

$IconIco = Join-Path $IconOut "icon.ico"
Copy-FileWithRetry $IconIco (Join-Path $Resources "icon.ico")
Write-Host "[RainyReSearch] updating executable metadata and icon"
$rcedit = Get-Command rcedit.exe -ErrorAction SilentlyContinue
$rceditArgs = @(
  $RainyReSearchExe,
  "--set-icon", $IconIco,
  "--set-file-version", $AppVersion,
  "--set-product-version", $AppVersion,
  "--set-version-string", "CompanyName", "RainyReSearch",
  "--set-version-string", "FileDescription", "RainyReSearch",
  "--set-version-string", "ProductName", "RainyReSearch",
  "--set-version-string", "ProductVersion", $AppVersion,
  "--set-version-string", "FileVersion", $AppVersion,
  "--set-version-string", "InternalName", "RainyReSearch",
  "--set-version-string", "OriginalFilename", "RainyReSearch.exe"
)
$rceditExitCode = 1
if ($rcedit) {
  for ($i = 1; $i -le 8; $i++) {
    & $rcedit.Source @rceditArgs
    $rceditExitCode = $LASTEXITCODE
    if ($rceditExitCode -eq 0) { break }
    Start-Sleep -Milliseconds ([Math]::Min(5000, 500 * $i))
  }
} else {
  $RceditTmp = Join-Path $env:TEMP "rainy-research-rcedit"
  New-Item -ItemType Directory -Force -Path $RceditTmp | Out-Null
  npm --prefix $RceditTmp install rcedit@5.0.2 --no-save
  if ($LASTEXITCODE -ne 0) {
    throw "npm install rcedit failed with exit code $LASTEXITCODE"
  }
  $env:DEEPX_RCEDIT_MODULE = Join-Path $RceditTmp "node_modules\rcedit\lib\index.js"
  $env:RAINY_RESEARCH_RCEDIT_EXE = $RainyReSearchExe
  $env:RAINY_RESEARCH_RCEDIT_ICON = $IconIco
  $env:RAINY_RESEARCH_RCEDIT_VERSION = $AppVersion
  $RceditScript = Join-Path $RceditTmp "set-icon.mjs"
@'
import { pathToFileURL } from "node:url";

const { rcedit } = await import(pathToFileURL(process.env.DEEPX_RCEDIT_MODULE).href);
await rcedit(process.env.RAINY_RESEARCH_RCEDIT_EXE, {
  icon: process.env.RAINY_RESEARCH_RCEDIT_ICON,
  "version-string": {
    CompanyName: "RainyReSearch",
    FileDescription: "RainyReSearch",
    ProductName: "RainyReSearch",
    ProductVersion: process.env.RAINY_RESEARCH_RCEDIT_VERSION,
    FileVersion: process.env.RAINY_RESEARCH_RCEDIT_VERSION,
    InternalName: "RainyReSearch",
    OriginalFilename: "RainyReSearch.exe",
  },
});
'@ | Set-Content -LiteralPath $RceditScript -Encoding UTF8
  for ($i = 1; $i -le 8; $i++) {
    node $RceditScript
    $rceditExitCode = $LASTEXITCODE
    if ($rceditExitCode -eq 0) { break }
    Start-Sleep -Milliseconds ([Math]::Min(5000, 500 * $i))
  }
}
if ($rceditExitCode -ne 0) {
  throw "rcedit failed with exit code $rceditExitCode"
}

function Move-OriginalFile {
  param([string]$RelativePath)
  $src = Join-Path $Root $RelativePath
  if (!(Test-Path $src)) { return }
  $dest = Join-Path $BackupRoot $RelativePath
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  Move-Item -Force -Path $src -Destination $dest
}

Write-Host "[RainyReSearch] moving upstream shell-only files out of release folder"
foreach ($rel in @(
  ([string]::Concat("Cod", "ex.exe")),
  (Join-Path "resources" $UpstreamAsarBackupName),
  ([string]::Concat("resources\", "cod", "ex")),
  ([string]::Concat("resources\", "cod", "ex.exe")),
  ([string]::Concat("resources\", "cod", "ex-command-runner.exe")),
  ([string]::Concat("resources\", "cod", "ex-windows-sandbox-setup.exe")),
  ([string]::Concat("resources\", "cod", "ex-resources")),
  ([string]::Concat("resources\", "node", "_repl.exe")),
  ([string]::Concat("resources\", "cod", "ex-notification.wav")),
  "resources\native",
  "resources\plugins"
)) {
  Move-OriginalFile $rel
}

Write-Host "[RainyReSearch] packaged:"
Write-Host "  exe:  $RainyReSearchExe"
Write-Host "  core: $(Join-Path $Resources "rainy-research-core.exe")"
Write-Host "  data: $Data"
