const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("deepx", {
  getCoreInfo: () => ipcRenderer.invoke("deepx:core-info"),
  getPaths: () => ipcRenderer.invoke("deepx:paths"),
  getAssetUrl: (relativePath) => ipcRenderer.invoke("deepx:asset-url", relativePath),
  setWindowTheme: (theme) => ipcRenderer.invoke("deepx:set-window-theme", theme),
  selectDirectory: (defaultPath) => ipcRenderer.invoke("deepx:select-directory", defaultPath),
  selectFiles: (defaultPath) => ipcRenderer.invoke("deepx:select-files", defaultPath),
  readTextFiles: (paths) => ipcRenderer.invoke("deepx:read-text-files", paths),
  getFilePath: (file) => webUtils?.getPathForFile?.(file) || file?.path || "",
  openDataDir: () => ipcRenderer.invoke("deepx:open-data-dir"),
  terminalStart: (options) => ipcRenderer.invoke("deepx:terminal-start", options),
  terminalWrite: (data) => ipcRenderer.invoke("deepx:terminal-write", data),
  terminalResize: (size) => ipcRenderer.invoke("deepx:terminal-resize", size),
  terminalStop: () => ipcRenderer.invoke("deepx:terminal-stop"),
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("deepx:terminal-data", listener);
    return () => ipcRenderer.removeListener("deepx:terminal-data", listener);
  },
});
