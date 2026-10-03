const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
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
