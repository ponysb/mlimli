const dns = require('node:dns').promises;
const { appUrl, privateHost } = require('../core/app-center-policy.cjs');

// OAuth pages have no preload, model tools, page snapshots or browser extensions.
// Only an active backend job can supply the authorization URL and loopback callback.
function createAuthorizationBrowser({ BrowserWindow, session, getWindow, resolveJob, lookup = dns.lookup }) {
  const windows = new Map();
  async function open(id) {
    const job = await resolveJob(id);
    appUrl(job.url);
    const redirect = new URL(job.redirectUrl);
    if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !redirect.port || redirect.pathname !== '/oauth/callback' || redirect.search || redirect.hash) throw new Error('授权回调地址无效');
    const existing = windows.get(id);
    if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return true; }
    const authSession = session.fromPartition(`mli-mcp-auth-${id}`);
    const callback = value => {
      try { const u = new URL(value); return u.origin === redirect.origin && u.pathname === redirect.pathname && !u.username && !u.password; } catch { return false; }
    };
    const allowed = async value => {
      if (callback(value)) return true;
      const u = appUrl(value);
      const addresses = await lookup(u.hostname, { all: true });
      if (!addresses.length || addresses.some(a => privateHost(a.address))) throw new Error('授权页面请求本机或内网，已阻止');
      return true;
    };
    await allowed(job.url);
    authSession.setPermissionRequestHandler((_wc, _permission, done) => done(false));
    authSession.setPermissionCheckHandler(() => false);
    authSession.webRequest.onBeforeRequest((details, done) => {
      // Callback is permitted only as a top-level navigation, never a subresource.
      if (callback(details.url) && details.resourceType !== 'mainFrame') return done({ cancel: true });
      allowed(details.url).then(() => done({ cancel: false }), () => done({ cancel: true }));
    });
    const win = new BrowserWindow({ parent: getWindow(), width: 1000, height: 760, title: 'MCP 连接授权', autoHideMenuBar: true, webPreferences: { session: authSession, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
    windows.set(id, win);
    // Login popups remain in this isolated application window, never the OS browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      allowed(url).then(() => { if (!win.isDestroyed()) return win.loadURL(url); }).catch(() => {});
      return { action: 'deny' };
    });
    for (const event of ['will-navigate', 'will-redirect']) win.webContents.on(event, (e, url) => {
      try { if (!callback(url)) appUrl(url); } catch { e.preventDefault(); }
    });
    win.on('closed', () => { windows.delete(id); authSession.webRequest.onBeforeRequest(null); authSession.clearStorageData().catch(() => {}); });
    try { await win.loadURL(job.url); } catch (error) { if (!win.isDestroyed()) win.close(); throw error; }
    return true;
  }
  return { open };
}
function registerMcpAuthorization({ ipcMain, BrowserWindow, session, getWindow, getServerUrl }) {
  const controller = createAuthorizationBrowser({ BrowserWindow, session, getWindow, resolveJob: async id => {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('无效授权任务');
    const response = await fetch(getServerUrl() + '/api/mcp/auth/browser', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(10000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '授权已失效'); return result;
  } });
  ipcMain.handle('mcp-authorization-open', (event, id) => {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('授权入口仅供工作台使用');
    return controller.open(id);
  });
  return controller;
}
module.exports = { createAuthorizationBrowser, registerMcpAuthorization };
