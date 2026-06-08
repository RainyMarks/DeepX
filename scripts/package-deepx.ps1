$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PackageJson = Get-Content -Raw -LiteralPath (Join-Path $Root "package.json") | ConvertFrom-Json
$AppVersion = [string]$PackageJson.version
$BackupRoot = Join-Path (Split-Path $Root -Parent) "DeepX-original-backup"
$Resources = Join-Path $Root "resources"
$Data = Join-Path $Root "data"
$IconOut = Join-Path $Resources "deepx-assets"
$PortableTransferDirName = [string]::Concat("Down", "loads")
$IconSource = $null
$BundledIcon = Join-Path $IconOut "icon.png"
if (Test-Path -LiteralPath $BundledIcon) {
  $IconSource = $BundledIcon
} else {
  $DownloadDirName = [string]::Concat("Down", "loads")
  $DownloadDir = Join-Path $env:USERPROFILE $DownloadDirName
  if (Test-Path -LiteralPath $DownloadDir) {
    $IconSource = Get-ChildItem -Path $DownloadDir -Filter "*00_27_33.png" |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
}

Write-Host "[DeepX] root: $Root"
Write-Host "[DeepX] backup: $BackupRoot"

foreach ($dir in @(
  $Resources,
  $Data,
  (Join-Path $Data "config"),
  (Join-Path $Data "sessions"),
  (Join-Path $Data "logs"),
  (Join-Path $Data "plugins"),
  (Join-Path $Data "skills"),
  (Join-Path $Data "cache-metrics"),
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

Write-Host "[DeepX] building deepx-core.exe"
$rustFlagSeparator = [char]0x1f
$encodedRustFlags = @()
if ($env:CARGO_ENCODED_RUSTFLAGS) {
  $encodedRustFlags += ($env:CARGO_ENCODED_RUSTFLAGS -split $rustFlagSeparator)
}
$encodedRustFlags += "--remap-path-prefix=$Root=DeepX"
if ($env:USERPROFILE) {
  $encodedRustFlags += "--remap-path-prefix=$($env:USERPROFILE)=USERPROFILE"
}
$env:CARGO_ENCODED_RUSTFLAGS = ($encodedRustFlags | Where-Object { $_ }) -join $rustFlagSeparator
cargo build --release --manifest-path (Join-Path $Root "core\Cargo.toml")
Copy-Item -Force (Join-Path $Root "core\target\release\deepx-core.exe") (Join-Path $Resources "deepx-core.exe")

$ElectronApp = Join-Path $Root "electron"
Write-Host "[DeepX] installing Electron renderer dependencies"
npm --prefix $ElectronApp install --omit=dev
if ($LASTEXITCODE -ne 0) {
  throw "npm install failed with exit code $LASTEXITCODE"
}
$ElectronStage = Join-Path $env:TEMP "deepx-electron-app-stage"
Remove-Item -Recurse -Force $ElectronStage -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force $ElectronApp $ElectronStage
$StageNodeModules = Join-Path $ElectronStage "node_modules"
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
    (Join-Path $StageNodeModules "node-pty\tests")
  )) {
    Remove-Item -Recurse -Force $noiseDir -ErrorAction SilentlyContinue
  }
}

if (!$IconSource -or !(Test-Path -LiteralPath $IconSource)) {
  throw "Icon source not found: $IconSource"
}
Write-Host "[DeepX] generating icon assets"
python (Join-Path $Root "scripts\make-icon.py") $IconSource $IconOut

foreach ($iconFile in @("icon.png", "icon.ico", "icon-256.png")) {
  $iconPath = Join-Path $IconOut $iconFile
  if (!(Test-Path -LiteralPath $iconPath)) {
    throw "Icon asset missing after generation: $iconPath"
  }
}

$DeepXExe = Join-Path $Root "DeepX.exe"
$ElectronVersion = "v41.2.0"
$ElectronTmp = Join-Path $env:TEMP "deepx-electron-dist"
$ElectronZip = Join-Path $ElectronTmp "electron.zip"
$ElectronOut = Join-Path $ElectronTmp "dist"
New-Item -ItemType Directory -Force -Path $ElectronTmp | Out-Null
if (!(Test-Path $ElectronZip)) {
  Write-Host "[DeepX] downloading official Electron $ElectronVersion"
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
  Copy-Item -Force $src (Join-Path $Root $runtimeFile)
}

$ElectronLocales = Join-Path $ElectronOut "locales"
if (!(Test-Path -LiteralPath $ElectronLocales)) {
  throw "Electron locales folder missing after extraction: $ElectronLocales"
}
Remove-Item -Recurse -Force (Join-Path $Root "locales") -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force $ElectronLocales (Join-Path $Root "locales")

Copy-Item -Force (Join-Path $ElectronOut "electron.exe") $DeepXExe

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

Write-Host "[DeepX] packing Electron app.asar"
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
Copy-Item -Force $IconIco (Join-Path $Resources "icon.ico")
Write-Host "[DeepX] updating executable metadata and icon"
$rcedit = Get-Command rcedit.exe -ErrorAction SilentlyContinue
$rceditArgs = @(
  $DeepXExe,
  "--set-icon", $IconIco,
  "--set-file-version", $AppVersion,
  "--set-product-version", $AppVersion,
  "--set-version-string", "CompanyName", "DeepX",
  "--set-version-string", "FileDescription", "DeepX",
  "--set-version-string", "ProductName", "DeepX",
  "--set-version-string", "ProductVersion", $AppVersion,
  "--set-version-string", "FileVersion", $AppVersion,
  "--set-version-string", "InternalName", "DeepX",
  "--set-version-string", "OriginalFilename", "DeepX.exe"
)
if ($rcedit) {
  & $rcedit.Source @rceditArgs
} else {
  $RceditTmp = Join-Path $env:TEMP "deepx-rcedit"
  New-Item -ItemType Directory -Force -Path $RceditTmp | Out-Null
  npm --prefix $RceditTmp install rcedit@5.0.2 --no-save
  if ($LASTEXITCODE -ne 0) {
    throw "npm install rcedit failed with exit code $LASTEXITCODE"
  }
  $env:DEEPX_RCEDIT_MODULE = Join-Path $RceditTmp "node_modules\rcedit\lib\index.js"
  $env:DEEPX_RCEDIT_EXE = $DeepXExe
  $env:DEEPX_RCEDIT_ICON = $IconIco
  $env:DEEPX_RCEDIT_VERSION = $AppVersion
  $RceditScript = Join-Path $RceditTmp "set-icon.mjs"
@'
import { pathToFileURL } from "node:url";

const { rcedit } = await import(pathToFileURL(process.env.DEEPX_RCEDIT_MODULE).href);
await rcedit(process.env.DEEPX_RCEDIT_EXE, {
  icon: process.env.DEEPX_RCEDIT_ICON,
  "version-string": {
    CompanyName: "DeepX",
    FileDescription: "DeepX",
    ProductName: "DeepX",
    ProductVersion: process.env.DEEPX_RCEDIT_VERSION,
    FileVersion: process.env.DEEPX_RCEDIT_VERSION,
    InternalName: "DeepX",
    OriginalFilename: "DeepX.exe",
  },
});
'@ | Set-Content -LiteralPath $RceditScript -Encoding UTF8
  node $RceditScript
}
if ($LASTEXITCODE -ne 0) {
  throw "rcedit failed with exit code $LASTEXITCODE"
}

function Move-OriginalFile {
  param([string]$RelativePath)
  $src = Join-Path $Root $RelativePath
  if (!(Test-Path $src)) { return }
  $dest = Join-Path $BackupRoot $RelativePath
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  Move-Item -Force -Path $src -Destination $dest
}

Write-Host "[DeepX] moving upstream shell-only files out of release folder"
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

Write-Host "[DeepX] packaged:"
Write-Host "  exe:  $DeepXExe"
Write-Host "  core: $(Join-Path $Resources "deepx-core.exe")"
Write-Host "  data: $Data"
