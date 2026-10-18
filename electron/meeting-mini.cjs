const path = require('node:path');

const COMPACT = { width: 268, height: 76 };
const EXPANDED = { width: 384, height: 500 };
const ACTIVE_PHASES = new Set(['starting', 'recording', 'stopping', 'save-error']);

function trustedMain(event, win, serverUrl) {
  if (!win || win.isDestroyed?.() || event.sender !== win.webContents) return false;
  try { return new URL(event.senderFrame?.url || '').origin === new URL(serverUrl).origin; }
  catch { return false; }
}

function cleanState(value = {}) {
  const phase = ACTIVE_PHASES.has(value.phase) ? value.phase : 'idle';
  return {
    active: value.active === true && phase !== 'idle',
    phase,
    elapsed: Math.max(0, Math.min(Number(value.elapsed) || 0, 3599999)),
    transcript: String(value.transcript || '').replace(/\s+/g, ' ').trim().slice(0, 500),
    speaking: value.speaking === true,
  };
}

function createMeetingMiniController({ BrowserWindow, screen, ipcMain, preload, page, getMainWindow, getServerUrl }) {
  let miniWindow = null;
  let expanded = false;
  let state = cleanState();
  let observedWindow = null;

  function isMiniSender(event) {
    return miniWindow && !miniWindow.isDestroyed() && event.sender === miniWindow.webContents;
  }

  function place() {
    if (!miniWindow || miniWindow.isDestroyed()) return;
    const main = getMainWindow();
    const display = screen.getDisplayMatching(main && !main.isDestroyed() ? main.getBounds() : miniWindow.getBounds());
    const area = display.workArea;
    const size = expanded ? EXPANDED : COMPACT;
    miniWindow.setBounds({ x: area.x + area.width - size.width - 16, y: area.y + 16, ...size }, false);
  }

  function createWindow() {
    if (miniWindow && !miniWindow.isDestroyed()) return miniWindow;
    miniWindow = new BrowserWindow({
      ...COMPACT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    miniWindow.setMenuBarVisibility(false);
    miniWindow.setAlwaysOnTop(true, 'floating');
    miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    miniWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    miniWindow.webContents.on('did-finish-load', () => miniWindow?.webContents.send('meeting-mini-state-changed', { ...state, expanded }));
    miniWindow.on('closed', () => { miniWindow = null; });
    miniWindow.loadFile(path.resolve(page));
    return miniWindow;
  }

  function hide() {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.hide();
  }

  function syncVisibility() {
    const main = getMainWindow();
    if (!state.active || !main || main.isDestroyed() || !main.isMinimized()) { hide(); return; }
    const mini = createWindow();
    place();
    if (!mini.isVisible()) mini.showInactive();
    if (!mini.webContents.isLoading()) mini.webContents.send('meeting-mini-state-changed', { ...state, expanded });
  }

  function observe(win) {
    if (!win || win === observedWindow) return;
    observedWindow = win;
    win.on('minimize', syncVisibility);
    for (const event of ['restore', 'show']) win.on(event, hide);
    win.on('closed', () => { observedWindow = null; destroy(); });
  }

  function resize(nextExpanded) {
    expanded = nextExpanded;
    if (!miniWindow || miniWindow.isDestroyed()) return;
    place();
    miniWindow.webContents.send('meeting-mini-state-changed', { ...state, expanded });
    miniWindow.webContents.send('meeting-mini-layout-changed', { expanded });
  }

  function destroy() {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
    miniWindow = null;
  }

  ipcMain.on('meeting-recording-state', (event, value) => {
    const main = getMainWindow();
    if (!trustedMain(event, main, getServerUrl())) return;
    state = cleanState(value);
    if (!state.active) resize(false);
    syncVisibility();
  });
  ipcMain.handle('meeting-mini-state', event => {
    if (!isMiniSender(event)) throw new Error('不受信任的会议录制状态请求');
    return { ...state, expanded };
  });
  ipcMain.handle('meeting-mini-action', (event, action) => {
    if (!isMiniSender(event)) throw new Error('不受信任的会议录制窗口操作');
    const main = getMainWindow();
    if (action === 'expand') resize(true);
    else if (action === 'collapse') resize(false);
    else if (action === 'restore') {
      if (main && !main.isDestroyed()) {
        if (main.isMinimized()) main.restore();
        main.show(); main.focus();
      }
      hide();
    } else if (action === 'finish') {
      state = cleanState({ ...state, phase: 'stopping', active: true });
      if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('meeting-mini-state-changed', { ...state, expanded });
      if (main && !main.isDestroyed() && !main.webContents.isDestroyed()) main.webContents.send('meeting-mini-finish-requested');
    } else throw new Error('未知会议录制窗口操作');
    return { ...state, expanded };
  });

  return { observe, destroy, getState: () => ({ ...state, expanded }), syncVisibility };
}

module.exports = { createMeetingMiniController, cleanState, trustedMain, COMPACT, EXPANDED };
