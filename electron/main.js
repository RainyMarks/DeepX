const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const pty = require("node-pty");

const isDev = !app.isPackaged || process.env.DEEPX_DEV === "1";
const appRoot = process.env.DEEPX_APP_ROOT || path.dirname(process.execPath);
const resourcesRoot = process.resourcesPath || path.join(appRoot, "resources");
const dataRoot = process.env.DEEPX_HOME || path.join(appRoot, "data");
const logPath = path.join(dataRoot, "logs", "deepx-electron.log");
const homeRoot = path.join(dataRoot, "home");
const realHomeRoot = process.env.USERPROFILE || os.homedir();
const realDesktopRoot = path.join(realHomeRoot, "Desktop");
const downloadsDirName = ["Down", "loads"].join("");
const MAX_INLINE_FILE_BYTES = 512 * 1024;

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
