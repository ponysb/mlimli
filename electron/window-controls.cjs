function trusted(event, win, serverUrl) {
  if (!win || win.isDestroyed?.() || event.sender !== win.webContents) return false;
  try { return new URL(event.senderFrame?.url || '').origin === new URL(serverUrl).origin; }
  catch { return false; }
}

function stateOf(win, platform = process.platform) {
  return { maximized: Boolean(win?.isMaximized?.()), fullScreen: Boolean(win?.isFullScreen?.()), platform };
}

function registerWindowControls({ ipcMain, getWindow, getServerUrl, platform = process.platform }) {
  ipcMain.handle('window-control', (event, action) => {
    const win = getWindow(), serverUrl = getServerUrl();
    if (!trusted(event, win, serverUrl)) throw new Error('不受信任的窗口控制请求');
    if (action === 'minimize') win.minimize();
    else if (action === 'toggle-maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
    else throw new Error('未知窗口操作');
    return stateOf(win, platform);
  });
  ipcMain.handle('window-state', event => {
    const win = getWindow(), serverUrl = getServerUrl();
    if (!trusted(event, win, serverUrl)) throw new Error('不受信任的窗口状态请求');
    return stateOf(win, platform);
  });
}

module.exports = { registerWindowControls, stateOf, trusted };

