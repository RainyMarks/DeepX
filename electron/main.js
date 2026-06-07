const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const pty = require("node-pty");
const packageInfo = require("./package.json");

const isDev = !app.isPackaged || process.env.DEEPX_DEV === "1";
const appVersion = packageInfo.version || app.getVersion() || "0.0.0";
const appRoot = process.env.DEEPX_APP_ROOT || path.dirname(process.execPath);
const resourcesRoot = process.resourcesPath || path.join(appRoot, "resources");
const dataRoot = process.env.DEEPX_HOME || path.join(appRoot, "data");
const logPath = path.join(dataRoot, "logs", "deepx-electron.log");
const homeRoot = path.join(dataRoot, "home");
const realHomeRoot = process.env.USERPROFILE || os.homedir();
const realDesktopRoot = path.join(realHomeRoot, "Desktop");
const downloadsDirName = ["Down", "loads"].join("");
const MAX_INLINE_FILE_BYTES = 512 * 1024;
const UPDATE_REPOSITORY = "RainyMarks/DeepX";
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;
const UPDATE_LATEST_URL = `https://github.com/${UPDATE_REPOSITORY}/releases/latest`;

for (const dir of [
  dataRoot,
  path.join(dataRoot, "logs"),
  path.join(dataRoot, "config"),
  path.join(dataRoot, "sessions"),
  path.join(dataRoot, "cache-metrics"),
  path.join(dataRoot, "plugins"),
  path.join(dataRoot, "skills"),
  path.join(dataRoot, "electron-user-data"),
  homeRoot,
  path.join(homeRoot, "Desktop"),
  path.join(homeRoot, "Documents"),
  path.join(homeRoot, downloadsDirName),
  path.join(homeRoot, "Pictures"),
  path.join(dataRoot, "appdata"),
  path.join(dataRoot, "localappdata"),
]) {
  fs.mkdirSync(dir, { recursive: true });
}

const portableEnv = {
  DEEPX_HOME: dataRoot,
  HOME: homeRoot,
  USERPROFILE: homeRoot,
  APPDATA: path.join(dataRoot, "appdata"),
  LOCALAPPDATA: path.join(dataRoot, "localappdata"),
  TMP: path.join(dataRoot, "tmp"),
  TEMP: path.join(dataRoot, "tmp"),
};
fs.mkdirSync(portableEnv.TMP, { recursive: true });

app.setName("DeepX");
app.setAppUserModelId("DeepX");
app.setPath("userData", path.join(dataRoot, "electron-user-data"));
Menu.setApplicationMenu(null);

let mainWindow = null;
let coreProcess = null;
let coreInfo = null;
let coreReadyPromise = null;
let terminalPty = null;
let terminalCwd = null;
let lastUpdateInfo = null;

function sanitizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
}

function applyWindowTheme(theme = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const background = sanitizeHexColor(theme.background, "#080808");
  const foreground = sanitizeHexColor(theme.foreground, "#e6e6e6");
  mainWindow.setBackgroundColor(background);
  if (typeof mainWindow.setTitleBarOverlay === "function") {
    mainWindow.setTitleBarOverlay({
      color: background,
      symbolColor: foreground,
      height: 32,
    });
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line, "utf8");
}

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("deepx:update-status", payload);
  }
}

function stringifyVersion(value) {
  if (Array.isArray(value)) return value.join(".");
  if (value && typeof value === "object") {
    const parts = ["major", "minor", "patch"].map((key) => value[key]).filter((part) => part !== undefined);
    if (parts.length) return parts.join(".");
  }
  return String(value || "0.0.0");
}

function normalizeVersion(value) {
  const raw = stringifyVersion(value).trim().replace(/^v/i, "").replace(/[，,]+/g, ".");
  const match = raw.match(/\d+(?:\.\d+)*/);
  return (match ? match[0] : "0.0.0").split(/[+-]/)[0];
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = normalizeVersion(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
}

function requestJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `DeepX/${appVersion}`,
        },
        timeout: 20000,
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          if (redirects >= 5) {
            reject(new Error("too many redirects"));
            return;
          }
          resolve(requestJson(new URL(response.headers.location, url).toString(), redirects + 1));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          const error = new Error(`request failed: HTTP ${response.statusCode}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 5 * 1024 * 1024) {
            request.destroy(new Error("response is too large"));
          }
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
  });
}

function requestText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": `DeepX/${appVersion}`,
        },
        timeout: 20000,
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          if (redirects >= 8) {
            reject(new Error("too many redirects"));
            return;
          }
          resolve(requestText(new URL(response.headers.location, url).toString(), redirects + 1));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          const error = new Error(`request failed: HTTP ${response.statusCode}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 3 * 1024 * 1024) {
            request.destroy(new Error("response is too large"));
          }
        });
        response.on("end", () => resolve({ body, finalUrl: url }));
      }
    );
    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
  });
}

function downloadFile(url, destination, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": `DeepX/${appVersion}`,
        },
        timeout: 30000,
      },
      (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          if (redirects >= 8) {
            file.close(() => fs.rm(destination, { force: true }, () => {}));
            reject(new Error("too many download redirects"));
            return;
          }
          file.close(() => {
            fs.rm(destination, { force: true }, () => {
              resolve(downloadFile(new URL(response.headers.location, url).toString(), destination, onProgress, redirects + 1));
            });
          });
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          file.close(() => fs.rm(destination, { force: true }, () => {}));
          reject(new Error(`download failed: HTTP ${response.statusCode}`));
          return;
        }
        const total = Number(response.headers["content-length"]) || 0;
        let received = 0;
        response.on("data", (chunk) => {
          received += chunk.length;
          if (typeof onProgress === "function") onProgress({ received, total });
        });
        response.pipe(file);
        file.on("finish", () => file.close(() => resolve({ received, total })));
      }
    );
    request.on("timeout", () => request.destroy(new Error("download timed out")));
    request.on("error", (error) => {
      file.close(() => fs.rm(destination, { force: true }, () => {}));
      reject(error);
    });
    file.on("error", (error) => {
      request.destroy();
      fs.rm(destination, { force: true }, () => {});
      reject(error);
    });
  });
}

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(powershellPath(), args, {
      cwd: appRoot,
      env: { ...process.env, ...portableEnv },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `PowerShell exited with ${code}`));
    });
  });
}

async function extractZip(zipPath, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  await runPowerShell([
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
    zipPath,
    destination,
  ]);
}

function portableRootFromExtracted(stageRoot) {
  const candidates = [
    stageRoot,
    ...fs
      .readdirSync(stageRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(stageRoot, entry.name)),
  ];
  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "DeepX.exe")) &&
      fs.existsSync(path.join(candidate, "resources", "app.asar"))
    ) {
      return candidate;
    }
  }
  throw new Error("downloaded update package is not a DeepX portable build");
}

function findUpdateAsset(release, latestVersion) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const exactName = `DeepX-portable-v${latestVersion}.zip`;
  return (
    assets.find((asset) => asset.name === exactName) ||
    assets.find((asset) => /^DeepX-portable-v?\d+\.\d+\.\d+\.zip$/i.test(asset.name || "")) ||
    assets.find((asset) => /^DeepX-portable.*\.zip$/i.test(asset.name || ""))
  );
}

async function latestReleaseFromPublicPage(errorKind = "network") {
  const result = await requestText(UPDATE_LATEST_URL);
  const tagFromUrl = result.finalUrl.match(/\/releases\/tag\/([^/?#]+)/i)?.[1];
  const tagFromBody = result.body.match(/\/releases\/tag\/([^"?#<]+)/i)?.[1];
  const tag = decodeURIComponent(tagFromUrl || tagFromBody || "").trim();
  if (!tag) {
    const error = new Error("latest release tag was not found on the public release page");
    error.errorKind = "asset-missing";
    throw error;
  }
  const latestVersion = normalizeVersion(tag);
  const releaseTag = tag || `v${latestVersion}`;
  const assetHref = result.body.match(/href="([^"]*\/releases\/download\/[^"]*DeepX-portable[^"]*\.zip)"/i)?.[1];
  const assetDownloadUrl = assetHref
    ? new URL(assetHref.replace(/&amp;/g, "&"), "https://github.com").toString()
    : `https://github.com/${UPDATE_REPOSITORY}/releases/download/${releaseTag}/DeepX-portable-v${latestVersion}.zip`;
  const assetName = path.basename(decodeURIComponent(new URL(assetDownloadUrl).pathname));
  const assetFound = !!assetHref;
  const canInstall = app.isPackaged && process.env.DEEPX_DISABLE_UPDATES !== "1";
  return {
    currentVersion: appVersion,
    latestVersion,
    updateAvailable: compareVersions(appVersion, latestVersion) < 0,
    releaseUrl: `https://github.com/${UPDATE_REPOSITORY}/releases/tag/${releaseTag}`,
    assetName,
    assetSize: 0,
    publishedAt: null,
    notes: "",
    canInstall,
    checkedAt: new Date().toISOString(),
    assetDownloadUrl,
    source: "release-page",
    errorKind: assetFound ? errorKind : "release-page-fallback",
  };
}

async function checkForUpdates() {
  let release;
  let source = "api";
  let errorKind = null;
  try {
    release = await requestJson(UPDATE_API_URL);
  } catch (error) {
    const status = Number(error.statusCode || 0);
    errorKind = status === 403 || status === 429 ? "rate-limit" : "network";
    log(`update api check failed (${errorKind}): ${error.message}`);
    const fallback = await latestReleaseFromPublicPage(errorKind);
    lastUpdateInfo = fallback;
    return { ...fallback, assetDownloadUrl: undefined };
  }
  const latestVersion = normalizeVersion(release.tag_name || release.name);
  const asset = findUpdateAsset(release, latestVersion);
  if (!asset?.browser_download_url) {
    const fallback = await latestReleaseFromPublicPage("asset-missing");
    lastUpdateInfo = fallback;
    return { ...fallback, assetDownloadUrl: undefined };
  }
  const updateInfo = {
    currentVersion: appVersion,
    latestVersion,
    updateAvailable: compareVersions(appVersion, latestVersion) < 0,
    releaseUrl: release.html_url,
    assetName: asset.name,
    assetSize: asset.size || 0,
    publishedAt: release.published_at || null,
    notes: release.body || "",
    canInstall: app.isPackaged && process.env.DEEPX_DISABLE_UPDATES !== "1",
    checkedAt: new Date().toISOString(),
    source,
    errorKind,
  };
  updateInfo.assetDownloadUrl = asset.browser_download_url;
  lastUpdateInfo = updateInfo;
  return { ...updateInfo, assetDownloadUrl: undefined };
}

function writeUpdateScript(scriptPath) {
  const script = `
param(
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$Target,
  [Parameter(Mandatory=$true)][int]$ParentPid
)
$ErrorActionPreference = "Stop"
$logDir = Join-Path $Target "data\\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "deepx-updater.log"
function Write-UpdateLog([string]$Message) {
  Add-Content -LiteralPath $logPath -Encoding UTF8 -Value ("[{0}] {1}" -f (Get-Date).ToString("o"), $Message)
}
try {
  Write-UpdateLog "waiting for DeepX process $ParentPid"
  Wait-Process -Id $ParentPid -Timeout 120 -ErrorAction SilentlyContinue
} catch {}
Start-Sleep -Milliseconds 900
$preserve = @("data")
Write-UpdateLog "copying update from $Source to $Target"
Get-ChildItem -LiteralPath $Source -Force | Where-Object { $preserve -notcontains $_.Name } | ForEach-Object {
  $dest = Join-Path $Target $_.Name
  if (Test-Path -LiteralPath $dest) {
    Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue
  }
  Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
}
$exe = Join-Path $Target "DeepX.exe"
if (!(Test-Path -LiteralPath $exe)) {
  throw "DeepX.exe missing after update"
}
Write-UpdateLog "starting updated DeepX"
Start-Process -FilePath $exe -WorkingDirectory $Target
`;
  fs.writeFileSync(scriptPath, script.trimStart(), "utf8");
}

async function downloadAndInstallUpdate() {
  if (!lastUpdateInfo?.updateAvailable) {
    await checkForUpdates();
  }
  const info = lastUpdateInfo;
  if (!info.updateAvailable) {
    return { ok: true, updateAvailable: false, currentVersion: appVersion, latestVersion: info.latestVersion };
  }
  if (!info.canInstall) {
    throw new Error("updates can only be installed from the packaged portable app");
  }

  const updateRoot = path.join(dataRoot, "updates");
  fs.mkdirSync(updateRoot, { recursive: true });
  const zipPath = path.join(updateRoot, info.assetName);
  const stageRoot = path.join(updateRoot, `stage-${Date.now()}`);

  sendUpdateStatus({ status: "downloading", latestVersion: info.latestVersion, received: 0, total: info.assetSize || 0 });
  await downloadFile(info.assetDownloadUrl, zipPath, (progress) => {
    sendUpdateStatus({ status: "downloading", latestVersion: info.latestVersion, ...progress });
  });

  sendUpdateStatus({ status: "extracting", latestVersion: info.latestVersion });
  await extractZip(zipPath, stageRoot);
  const sourceRoot = portableRootFromExtracted(stageRoot);
  const updateScript = path.join(updateRoot, "apply-update.ps1");
  writeUpdateScript(updateScript);

  sendUpdateStatus({ status: "installing", latestVersion: info.latestVersion });
  const updater = spawn(
    powershellPath(),
    [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      updateScript,
      "-Source",
      sourceRoot,
      "-Target",
      appRoot,
      "-ParentPid",
      String(process.pid),
    ],
    {
      cwd: appRoot,
      env: { ...process.env, ...portableEnv },
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  updater.unref();
  setTimeout(() => app.quit(), 500);
  return { ok: true, updateAvailable: true, latestVersion: info.latestVersion };
}

function resolveCorePath() {
  const packaged = path.join(resourcesRoot, "deepx-core.exe");
  if (fs.existsSync(packaged)) return packaged;
  const dev = path.resolve(__dirname, "..", "core", "target", "debug", "deepx-core.exe");
  if (fs.existsSync(dev)) return dev;
  const release = path.resolve(__dirname, "..", "core", "target", "release", "deepx-core.exe");
  if (fs.existsSync(release)) return release;
  return packaged;
}

function existingDirectory(candidate, fallback = appRoot) {
  if (typeof candidate === "string" && candidate.trim()) {
    try {
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        return resolved;
      }
    } catch (err) {
      log(`invalid directory candidate: ${candidate} (${err.message})`);
    }
  }
  try {
    if (fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()) {
      return fallback;
    }
  } catch {
    // Fall through to appRoot.
  }
  return appRoot;
}

function defaultWorkspaceRoot() {
  return existingDirectory(realDesktopRoot, existingDirectory(realHomeRoot, appRoot));
}

function powershellPath() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const systemPowerShell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (fs.existsSync(systemPowerShell)) return systemPowerShell;
  return "powershell.exe";
}

function sendTerminal(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("deepx:terminal-data", payload);
  }
}

function startCore() {
  if (coreReadyPromise) return coreReadyPromise;
  coreReadyPromise = new Promise((resolve, reject) => {
    const corePath = resolveCorePath();
    if (!fs.existsSync(corePath)) {
      reject(new Error(`deepx-core.exe not found at ${corePath}`));
      return;
    }

    log(`starting core: ${corePath}`);
    coreProcess = spawn(corePath, ["--port", "0"], {
      cwd: appRoot,
      env: { ...process.env, ...portableEnv },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let resolved = false;
    coreProcess.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
      let index;
      while ((index = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, index).trim();
        stdoutBuffer = stdoutBuffer.slice(index + 1);
        if (!line) continue;
        log(`core stdout: ${line}`);
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === "ready") {
            coreInfo = {
              ...parsed,
              baseUrl: `http://127.0.0.1:${parsed.port}`,
              dataRoot,
              appRoot,
              resourcesRoot,
              appVersion,
            };
            resolved = true;
            resolve(coreInfo);
          }
        } catch {
          // Non-JSON stdout is logged for diagnosis only.
        }
      }
    });

    coreProcess.stderr.on("data", (chunk) => {
      log(`core stderr: ${chunk.toString("utf8").trimEnd()}`);
    });

    coreProcess.on("error", (err) => {
      log(`core error: ${err.message}`);
      if (!resolved) reject(err);
    });

    coreProcess.on("exit", (code, signal) => {
      log(`core exited code=${code} signal=${signal}`);
      coreProcess = null;
      coreReadyPromise = null;
      if (!resolved) reject(new Error(`deepx-core exited before ready (${code ?? signal})`));
    });
  });
  return coreReadyPromise;
}

async function createWindow() {
  const iconPath = path.join(resourcesRoot, "deepx-assets", "icon.png");
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1020,
    minHeight: 680,
    title: "DeepX",
    backgroundColor: "#080808",
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#080808",
      symbolColor: "#e6e6e6",
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url === current) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
  });
  await mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("deepx:core-info", async () => {
  if (coreInfo) return coreInfo;
  return await startCore();
});

ipcMain.handle("deepx:paths", async () => ({
  appRoot,
  dataRoot,
  resourcesRoot,
  logPath,
  homeRoot: realHomeRoot,
  desktopRoot: defaultWorkspaceRoot(),
  appVersion,
}));

ipcMain.handle("deepx:asset-url", async (_event, relativePath) => {
  const safeRelative = String(relativePath || "").replace(/^[/\\]+/, "");
  const resolved = path.resolve(resourcesRoot, safeRelative);
  const relative = path.relative(resourcesRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("invalid asset path");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`asset not found: ${safeRelative}`);
  }
  return pathToFileURL(resolved).toString();
});

ipcMain.handle("deepx:set-window-theme", async (_event, theme = {}) => {
  applyWindowTheme(theme);
  return { ok: true };
});

ipcMain.handle("deepx:select-directory", async (_event, requestedDefaultPath) => {
  const defaultPath = existingDirectory(requestedDefaultPath, defaultWorkspaceRoot());
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath,
    title: "\u9009\u62e9\u5de5\u4f5c\u533a",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return existingDirectory(result.filePaths[0], defaultPath);
});

ipcMain.handle("deepx:select-files", async (_event, requestedDefaultPath) => {
  const defaultPath = existingDirectory(requestedDefaultPath, defaultWorkspaceRoot());
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath,
    title: "\u9009\u62e9\u6587\u4ef6",
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  return result.filePaths;
});

ipcMain.handle("deepx:read-text-files", async (_event, paths = []) => {
  const out = [];
  for (const rawPath of Array.isArray(paths) ? paths.slice(0, 12) : []) {
    const filePath = String(rawPath || "");
    const item = {
      path: filePath,
      name: path.basename(filePath),
      size: 0,
      content: "",
      truncated: false,
      binary: false,
      error: null,
    };
    try {
      const stat = fs.statSync(filePath);
      item.size = stat.size;
      if (!stat.isFile()) {
        item.error = "not a file";
      } else {
        const fd = fs.openSync(filePath, "r");
        try {
          const length = Math.min(stat.size, MAX_INLINE_FILE_BYTES);
          const buffer = Buffer.alloc(length);
          fs.readSync(fd, buffer, 0, length, 0);
          item.truncated = stat.size > MAX_INLINE_FILE_BYTES;
          item.binary = buffer.includes(0);
          if (item.binary) {
            item.error = "binary file is not inlined";
          } else {
            item.content = buffer.toString("utf8");
          }
        } finally {
          fs.closeSync(fd);
        }
      }
    } catch (err) {
      item.error = err.message || String(err);
    }
    out.push(item);
  }
  return out;
});

ipcMain.handle("deepx:open-data-dir", async () => {
  await shell.openPath(dataRoot);
});

ipcMain.handle("deepx:update-check", async () => {
  return await checkForUpdates();
});

ipcMain.handle("deepx:update-install", async () => {
  return await downloadAndInstallUpdate();
});

ipcMain.handle("deepx:terminal-start", async (_event, options = {}) => {
  const cwd = existingDirectory(options.cwd, appRoot);
  const cols = Math.max(20, Math.min(500, Number(options.cols) || 80));
  const rows = Math.max(4, Math.min(200, Number(options.rows) || 24));
  if (terminalPty) {
    terminalPty.resize(cols, rows);
    return { cwd: terminalCwd || cwd, running: true };
  }

  terminalCwd = cwd;
  terminalPty = pty.spawn(
    powershellPath(),
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass"],
    {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        ...portableEnv,
        PWD: cwd,
        TERM: "xterm-256color",
      },
    }
  );

  terminalPty.onData((text) => {
    sendTerminal({ stream: "stdout", text });
  });
  terminalPty.onExit(({ exitCode, signal }) => {
    sendTerminal({ stream: "system", text: `\r\n[terminal exited: ${exitCode ?? signal}]\r\n` });
    terminalPty = null;
    terminalCwd = null;
  });
  return { cwd, running: true };
});

ipcMain.handle("deepx:terminal-write", async (_event, data) => {
  if (!terminalPty) {
    throw new Error("terminal is not running");
  }
  terminalPty.write(String(data || ""));
  return { ok: true };
});

ipcMain.handle("deepx:terminal-resize", async (_event, size = {}) => {
  if (!terminalPty) return { ok: false };
  const cols = Math.max(20, Math.min(500, Number(size.cols) || 80));
  const rows = Math.max(4, Math.min(200, Number(size.rows) || 24));
  terminalPty.resize(cols, rows);
  return { ok: true };
});

ipcMain.handle("deepx:terminal-stop", async () => {
  if (terminalPty) {
    terminalPty.kill();
    terminalPty = null;
    terminalCwd = null;
  }
  return { ok: true };
});

app.whenReady().then(async () => {
  try {
    await startCore();
  } catch (err) {
    log(`startup failed: ${err.message}`);
    dialog.showErrorBox("DeepX failed to start", err.message);
  }
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (terminalPty) {
    terminalPty.kill();
    terminalPty = null;
  }
  if (coreProcess) {
    coreProcess.kill();
    coreProcess = null;
  }
});
