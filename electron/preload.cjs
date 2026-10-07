const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  listDisplaySources: () => ipcRenderer.invoke('display-sources'),
  setDisplaySource: (sourceId, audio) => ipcRenderer.sendSync('display-source-selection', { sourceId, audio }),
  installWindowsSandbox: () => ipcRenderer.invoke('install-windows-sandbox'),
  openApp: id => ipcRenderer.invoke('app-browser-open', id),
  setAppBrowserBounds: bounds => ipcRenderer.invoke('app-browser-bounds', bounds),
  navigateApp: data => ipcRenderer.invoke('app-browser-navigate', data),
  authorizeApp: id => ipcRenderer.invoke('app-browser-authorize', id),
  clearAppLogin: id => ipcRenderer.invoke('app-browser-clear', id),
  onAppBrowserChanged: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('app-browser-changed', listener); return () => ipcRenderer.removeListener('app-browser-changed', listener); },
  getUpdateStatus: () => ipcRenderer.invoke('desktop-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('desktop-update-check'),
  downloadUpdate: () => ipcRenderer.invoke('desktop-update-download'),
  installUpdate: () => ipcRenderer.invoke('desktop-update-install'),
  onUpdateChanged: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('desktop-update-changed', listener);
    return () => ipcRenderer.removeListener('desktop-update-changed', listener);
  },
  getDebugConsoleStatus: () => ipcRenderer.invoke('debug-console-status'),
  setDebugConsole: (enabled) => ipcRenderer.invoke('set-debug-console', enabled),
  onDebugConsoleChanged: (callback) => {
    const listener = (_event, status) => callback({ open: status?.open === true });
    ipcRenderer.on('debug-console-changed', listener);
    return () => ipcRenderer.removeListener('debug-console-changed', listener);
  },
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  chooseMediaFiles: () => ipcRenderer.invoke('choose-media-files'),
  importMediaAssets: () => ipcRenderer.invoke('import-media-assets'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  openWorkspaceFile: (relativePath) => ipcRenderer.invoke('open-workspace-file', relativePath),
  notify: (payload) => ipcRenderer.invoke('show-notification', payload),
  getPathForFile: (file) => webUtils?.getPathForFile ? webUtils.getPathForFile(file) : file?.path || '',
});
