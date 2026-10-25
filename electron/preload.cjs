const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  windowControl: action => ipcRenderer.invoke('window-control', action),
  getWindowState: () => ipcRenderer.invoke('window-state'),
  onWindowStateChanged: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('window-state-changed', listener);
    return () => ipcRenderer.removeListener('window-state-changed', listener);
  },
  onSystemPowerChanged: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('system-power-changed', listener);
    return () => ipcRenderer.removeListener('system-power-changed', listener);
  },
  setMeetingRecordingState: state => ipcRenderer.send('meeting-recording-state', state),
  getMeetingRecordingState: () => ipcRenderer.invoke('meeting-mini-state'),
  meetingRecordingAction: action => ipcRenderer.invoke('meeting-mini-action', action),
  onMeetingRecordingStateChanged: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('meeting-mini-state-changed', listener);
    return () => ipcRenderer.removeListener('meeting-mini-state-changed', listener);
  },
  onMeetingRecordingLayoutChanged: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('meeting-mini-layout-changed', listener);
    return () => ipcRenderer.removeListener('meeting-mini-layout-changed', listener);
  },
  onMeetingRecordingFinishRequested: callback => {
    const listener = () => callback();
    ipcRenderer.on('meeting-mini-finish-requested', listener);
    return () => ipcRenderer.removeListener('meeting-mini-finish-requested', listener);
  },
  listDisplaySources: () => ipcRenderer.invoke('display-sources'),
  setDisplaySource: (sourceId, audio) => ipcRenderer.sendSync('display-source-selection', { sourceId, audio }),
  installWindowsSandbox: () => ipcRenderer.invoke('install-windows-sandbox'),
  repairWindowsSandbox: () => ipcRenderer.invoke('repair-windows-sandbox'),
  openApp: id => ipcRenderer.invoke('app-browser-open', id),
  openUrl: data => ipcRenderer.invoke('app-browser-open-url', data),
  closeBrowserTab: id => ipcRenderer.invoke('app-browser-close-tab', id),
  listBrowserExtensions: () => ipcRenderer.invoke('app-browser-extensions'),
  addBrowserExtension: () => ipcRenderer.invoke('app-browser-add-extension'),
  removeBrowserExtension: extensionPath => ipcRenderer.invoke('app-browser-remove-extension', extensionPath),
  openBrowserExtensionStore: () => ipcRenderer.invoke('app-browser-extension-store'),
  browserPageAction: data => ipcRenderer.invoke('app-browser-page-action', data),
  setAppBrowserBounds: bounds => ipcRenderer.invoke('app-browser-bounds', bounds),
  navigateApp: data => ipcRenderer.invoke('app-browser-navigate', data),
  authorizeApp: id => ipcRenderer.invoke('app-browser-authorize', id),
  clearAppLogin: id => ipcRenderer.invoke('app-browser-clear', id),
  onAppBrowserChanged: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('app-browser-changed', listener); return () => ipcRenderer.removeListener('app-browser-changed', listener); },
  onAppBrowserCopied: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('app-browser-copied', listener); return () => ipcRenderer.removeListener('app-browser-copied', listener); },
  onAppBrowserMenuAction: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('app-browser-menu-action', listener); return () => ipcRenderer.removeListener('app-browser-menu-action', listener); },
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
  genOfficeStatus: () => ipcRenderer.invoke('genoffice-status'),
  onGenOfficeAgentRequest: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('genoffice-agent-request', listener); return () => ipcRenderer.removeListener('genoffice-agent-request', listener); },
  genOfficeAgentResult: data => ipcRenderer.invoke('genoffice-agent-result', data),
  genOfficeOpen: data => ipcRenderer.invoke('genoffice-open', data),
  genOfficeBounds: data => ipcRenderer.invoke('genoffice-bounds', data),
  genOfficeClose: id => ipcRenderer.invoke('genoffice-close', id),
  onGenOfficeFailed: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('genoffice-failed', listener); return () => ipcRenderer.removeListener('genoffice-failed', listener); },
  notify: (payload) => ipcRenderer.invoke('show-notification', payload),
  getPathForFile: (file) => webUtils?.getPathForFile ? webUtils.getPathForFile(file) : file?.path || '',
});
