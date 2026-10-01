const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  chooseMediaFiles: () => ipcRenderer.invoke('choose-media-files'),
  importMediaAssets: () => ipcRenderer.invoke('import-media-assets'),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  openWorkspaceFile: (relativePath) => ipcRenderer.invoke('open-workspace-file', relativePath),
  getPathForFile: (file) => webUtils?.getPathForFile ? webUtils.getPathForFile(file) : file?.path || '',
});
