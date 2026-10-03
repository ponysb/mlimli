function registerDebugConsole(ipcMain, getWindow) {
  function contents(event) {
    const window = getWindow();
    if (!window || window.isDestroyed()) throw new Error('应用窗口已关闭');
    const target = window.webContents;
    if (target.isDestroyed() || event.sender !== target || event.senderFrame !== target.mainFrame) {
      throw new Error('调试控制台仅允许应用主窗口操作');
    }
    return target;
  }
  ipcMain.handle('debug-console-status', event => ({ open: contents(event).isDevToolsOpened() }));
  ipcMain.handle('set-debug-console', (event, enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('调试开关参数无效');
    const target = contents(event);
    if (enabled) target.openDevTools({ mode: 'detach', activate: true });
    else target.closeDevTools();
    return { open: target.isDevToolsOpened() };
  });
}

function observeDebugConsole(contents) {
  const send = () => {
    if (!contents.isDestroyed()) contents.send('debug-console-changed', { open: contents.isDevToolsOpened() });
  };
  contents.on('devtools-opened', send);
  contents.on('devtools-closed', send);
}

module.exports = { registerDebugConsole, observeDebugConsole };
