const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const { appUrl, privateHost, publicPageUrl } = require('../core/app-center-policy.cjs');

// Scripts are fixed, with JSON-encoded data arguments; there is no arbitrary JS
// evaluation or Cookie/storage API exposed to the model or workbench renderer.
function snapshotScript(prefix) {
  return `(() => {
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    const secret = el => el.type === 'password' || /password|one-time-code|cc-/i.test(el.autocomplete || '') || /password|passwd|secret|token|otp|verification/i.test([el.name, el.id, el.getAttribute('aria-label')].join(' '));
    const elements = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')).filter(el => visible(el) && !secret(el)).slice(0, 200);
    window.__mliAppRefs = new Map();
    const items = elements.map((el, i) => { const ref = ${JSON.stringify(prefix)} + '-' + i; window.__mliAppRefs.set(ref, el); return { ref, tag: el.tagName.toLowerCase(), type: el.type || '', label: (el.getAttribute('aria-label') || el.innerText || el.placeholder || el.name || '').slice(0, 160), disabled: Boolean(el.disabled) }; });
    return { title: document.title.slice(0, 200), text: (document.body?.innerText || '').slice(0, 18000), elements: items };
  })()`;
}
function elementScript(ref, action, text) {
  return `(() => {
    const el = window.__mliAppRefs?.get(${JSON.stringify(ref)});
    if (!el || !el.isConnected) throw new Error('元素引用已失效，请重新读取页面');
    if (el.disabled || el.type === 'password' || /password|one-time-code|cc-/i.test(el.autocomplete || '') || /password|passwd|secret|token|otp|verification/i.test([el.name, el.id, el.getAttribute('aria-label')].join(' '))) throw new Error('不能操作密码、验证码、支付或敏感字段');
    const rect = el.getBoundingClientRect(); if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') throw new Error('元素当前不可见');
    el.scrollIntoView({block:'center'}); el.focus();
    ${action === 'click' ? 'el.click();' : `if (!['INPUT','TEXTAREA'].includes(el.tagName) && !el.isContentEditable) throw new Error('该元素不能输入文字');
      if (el.isContentEditable) el.textContent = ${JSON.stringify(text)};
      else { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const set = Object.getOwnPropertyDescriptor(proto, 'value').set; set.call(el, ${JSON.stringify(text)}); }
      el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true}));`}
    window.__mliAppRefs = null;
    return { ok: true };
  })()`;
}



function createAppBrowser({ electron, getWindow, serverUrl, dataRoot, testAllowLocal = false }) {
  const { BrowserView, WebContentsView, BrowserWindow, session } = electron;
  const views = new Map(), popups = new Map(), jobs = new Map();
  const clientId = crypto.randomUUID();
  let timer, busy = false, stopped = false, activeId, surface = null, attached = null, attachedSurface = null;
  const token = () => fs.readFileSync(path.join(dataRoot, '.security', 'app-center', 'bridge-token'), 'utf8').trim();
  async function request(route, body) {
    const response = await fetch(serverUrl + '/api/app-center' + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-mli-browser-token': token() }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '应用台连接失败'); return result;
  }
  const validateUrl = value => testAllowLocal ? new URL(value) : appUrl(value);
  async function safeNetwork(value) {
    if (testAllowLocal) return true;
    const url = appUrl(value);
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(a => privateHost(a.address))) throw new Error('应用网络请求解析到本机或内网，已阻止');
    return true;
  }
  function state(item) { return { appId: item.app.id, url: item.contents.getURL() ? publicPageUrl(item.contents.getURL()) : '', title: item.contents.getTitle(), loading: item.contents.isLoading(), canGoBack: item.contents.canGoBack(), canGoForward: item.contents.canGoForward() }; }
  function notify(item) { const win = getWindow(); if (win && !win.isDestroyed()) win.webContents.send('app-browser-changed', state(item)); }
  function observeNavigation(item, url) {
    item.revision++;
    item.observations = item.observations.catch(() => {}).then(() => request('/bridge/observe', { appId: item.app.id, url }));
  }
  function attach() {
    const win = getWindow(); if (!win || win.isDestroyed()) return;
    const item = surface && surface.width >= 30 && surface.height >= 30 ? views.get(activeId) : null;
    if (attached !== item) {
      if (attached) { try { if (attached.modern) win.contentView.removeChildView(attached.view); else win.removeBrowserView(attached.view); } catch {} }
      attached = null; attachedSurface = null;
      if (item) { if (item.modern) win.contentView.addChildView(item.view); else win.addBrowserView(item.view); attached = item; }
    }
    if (item && (!attachedSurface || ['x', 'y', 'width', 'height'].some(key => attachedSurface[key] !== surface[key]))) {
      item.view.setBounds(surface); attachedSurface = { ...surface };
    }
  }
  async function ensure(app) {
    let item = views.get(app.id);
    if (item && !item.contents.isDestroyed()) { item.app = app; return item; }
    const partition = 'persist:mli-app-' + app.id;
    const appSession = session.fromPartition(partition);
    // App-center sessions are separate Chromium profiles. Make their network
    // resolver follow the host browser/system proxy (including PAC and the
    // Windows Internet Settings proxy) before the first navigation. Without
    // this, Chromium may connect directly while the host browser reaches the
    // same public site through a local proxy, which commonly fails during TLS
    // negotiation for transparent DNS mappings.
    if (typeof appSession.setProxy === 'function') await appSession.setProxy({ mode: 'system' });
    appSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    appSession.setPermissionCheckHandler(() => false);
    appSession.on('will-download', event => event.preventDefault());
    appSession.webRequest.onBeforeRequest((details, callback) => {
      // data/blob resources are allowed inside the Chromium sandbox only.
      if (/^(data:|blob:)/i.test(details.url)) return callback({});
      safeNetwork(details.url).then(() => callback({}), () => callback({ cancel: true }));
    });
    const webPreferences = { session: appSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false, backgroundThrottling: false };
    const modern = typeof WebContentsView === 'function' && typeof getWindow()?.contentView?.addChildView === 'function';
    const view = modern ? new WebContentsView({ webPreferences }) : new BrowserView({ webPreferences });
    item = { app, view, contents: view.webContents, modern, appSession, chain: Promise.resolve(), observations: Promise.resolve(), revision: 0, agentMode: false, lastObserved: 0 };
    views.set(app.id, item);
    const setupContents = (contents, popup) => {
      const checkNavigation = (event, url) => { try { validateUrl(url); } catch { event.preventDefault(); } };
      contents.on('will-navigate', checkNavigation);
      contents.on('will-redirect', checkNavigation);
      contents.setWindowOpenHandler(({ url }) => {
        try { validateUrl(url); } catch { return { action: 'deny' }; }
        if (item.agentMode) return { action: 'deny' };
        return { action: 'allow', overrideBrowserWindowOptions: { parent: getWindow(), width: 1000, height: 760, autoHideMenuBar: true, webPreferences } };
      });
      contents.on('did-create-window', child => { popups.set(child, app.id); setupContents(child.webContents, true); child.on('closed', () => popups.delete(child)); });
      if (!popup) {
        for (const event of ['did-start-loading', 'did-stop-loading', 'page-title-updated']) contents.on(event, () => notify(item));
        contents.on('did-navigate', (_event, url) => observeNavigation(item, url));
        contents.on('did-navigate-in-page', (_event, url, main) => { if (main) { observeNavigation(item, url); } });
      }
    };
    setupContents(item.contents, false); return item;
  }
  async function open(appId, url) {
    const { apps } = await request(''); const app = apps.find(a => a.id === appId); if (!app) throw new Error('应用不存在');
    const item = await ensure(app); item.agentMode = false; activeId = appId; attach();
    const target = url || item.contents.getURL() || app.url;
    validateUrl(target);
    if (url || !item.contents.getURL()) await item.contents.loadURL(target);
    notify(item); return state(item);
  }
  async function guard(item) {
    if (item.contents.isLoadingMainFrame()) throw new Error('应用页面正在加载，请稍后重试');
    const { apps } = await request(''); const app = apps.find(a => a.id === item.app.id);
    if (!app || app.agentAllowed === false || app.status !== 'authorized') throw new Error('应用尚未确认或已撤销使用权限，请在应用卡片上确认登录或恢复权限');
    validateUrl(item.contents.getURL());
    return app;
  }
  async function execute(job) {
    const item = await ensure(job.app);
    const operation = async () => {
      if (job.cancelled) throw new Error('任务已停止');
      if (job.action === 'open') {
        const url = validateUrl(job.args.url || job.app.url);
        const current = item.contents.getURL();
        if (!current || publicPageUrl(current) !== publicPageUrl(url.href)) { item.agentMode = false; await item.contents.loadURL(url.href); }
        return state(item);
      }
      const app = await guard(item), wc = item.contents;
      item.app = app; item.agentMode = true;
      if (job.cancelled) throw new Error('任务已停止');
      let result = { ok: true };
      const evaluate = code => wc.executeJavaScriptInIsolatedWorld(999, [{ code }]);
      if (job.action === 'snapshot') result = await evaluate(snapshotScript(crypto.randomUUID()));
      else if (['click', 'type'].includes(job.action)) {
        if (typeof job.args.ref !== 'string' || job.args.ref.length > 100) throw new Error('需要页面元素 ref');
        if (job.action === 'type' && (typeof job.args.text !== 'string' || job.args.text.length > 20000)) throw new Error('输入文本无效或过长');
        result = await evaluate(elementScript(job.args.ref, job.action, job.args.text));
      } else if (job.action === 'press') {
        if (!['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp'].includes(job.args.key)) throw new Error('不支持该按键');
        // Do not type/submit passwords or OTP fields through keyboard automation.
        const safe = await evaluate(`(() => { const el=document.activeElement; return el && el.type!=='password' && !/password|one-time-code|cc-/i.test(el.autocomplete||'') && !/password|passwd|secret|token|otp|verification/i.test([el.name,el.id].join(' ')); })()`);
        if (!safe) throw new Error('不能通过按键操作敏感字段');
        wc.sendInputEvent({ type: 'keyDown', keyCode: job.args.key }); wc.sendInputEvent({ type: 'keyUp', keyCode: job.args.key });
      } else if (job.action === 'scroll') {
        const delta = job.args.delta_y ?? 600;
        if (!Number.isFinite(delta) || Math.abs(delta) > 5000) throw new Error('滚动距离无效');
        await evaluate(`window.scrollBy(0, ${JSON.stringify(delta)})`);
      } else if (job.action === 'navigate') {
        const target = validateUrl(job.args.url);
        await wc.loadURL(target.href);
      } else throw new Error('不支持的应用操作');
      return { ...result, url: publicPageUrl(wc.getURL()) };
    };
    const promise = item.chain.catch(() => {}).then(async () => {
      let timeout;
      try {
        return await Promise.race([operation(), new Promise((_, reject) => {
          timeout = setTimeout(() => { job.cancelled = true; item.contents.stop(); reject(new Error('应用页面操作超过 15 秒，请刷新页面后重试')); }, 15000);
        })]);
      } finally { clearTimeout(timeout); }
    });
    item.chain = promise; return promise;
  }
  async function poll() {
    if (busy || stopped) return; busy = true;
    try {
      const result = await request('/bridge/poll', { clientId });
      for (const [id, job] of jobs) if (!result.activeJobIds.includes(id)) { job.cancelled = true; const item = views.get(job.app.id); item?.contents.stop(); }
      for (const job of result.jobs) {
        jobs.set(job.id, job);
        execute(job).then(result => request('/bridge/result', { clientId, id: job.id, result }), error => request('/bridge/result', { clientId, id: job.id, error: error.message })).catch(() => {}).finally(() => jobs.delete(job.id));
      }
    } catch {} finally { busy = false; }
  }
  return {
    start() { stopped = false; poll(); timer = setInterval(poll, 500); timer.unref(); },
    async open(appId) { return open(appId); },
    bounds(value) {
      if (!value) surface = null;
      else { const win = getWindow(), [width, height] = win.getContentSize(); const x = Math.max(0, Math.floor(Number(value.x))), y = Math.max(0, Math.floor(Number(value.y))); if (![x, y, value.width, value.height].every(Number.isFinite)) throw new Error('浏览器区域无效'); surface = { x: Math.min(x, width), y: Math.min(y, height), width: Math.max(0, Math.min(Math.floor(value.width), width - x)), height: Math.max(0, Math.min(Math.floor(value.height), height - y)) }; }
      attach(); return true;
    },
    async navigate(action, url) {
      const item = views.get(activeId); if (!item) throw new Error('请先打开应用');
      item.agentMode = false;
      if (action === 'back' && item.contents.canGoBack()) item.contents.goBack();
      else if (action === 'forward' && item.contents.canGoForward()) item.contents.goForward();
      else if (action === 'reload') item.contents.reload();
      else if (action === 'url') { validateUrl(url); await item.contents.loadURL(url); }
      return state(item);
    },
    async authorize(appId) {
      const item = views.get(appId);
      return request('/bridge/authorize', { appId, url: item?.contents.isDestroyed() === false ? item.contents.getURL() || undefined : undefined });
    },
    async clear(appId) {
      const item = views.get(appId); if (activeId === appId) { activeId = null; attach(); }
      // Close every login window before clearing storage so OAuth callbacks cannot
      // recreate a session after the user has signed out.
      for (const [win, id] of popups) if (id === appId && !win.isDestroyed()) win.destroy();
      if (item) { item.contents.close(); views.delete(appId); }
      const appSession = session.fromPartition('persist:mli-app-' + appId);
      await appSession.clearStorageData(); await appSession.clearCache(); return true;
    },
    destroy() { stopped = true; clearInterval(timer); surface = null; attach(); for (const win of popups.keys()) if (!win.isDestroyed()) win.destroy(); for (const item of views.values()) if (!item.contents.isDestroyed()) item.contents.close(); views.clear(); },
  };
}

function registerAppBrowser({ ipcMain, controller, getWindow, serverUrl }) {
  function trusted(event) {
    const win = getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || new URL(event.senderFrame.url).origin !== serverUrl) throw new Error('应用台只允许工作台主窗口调用');
  }
  for (const [name, fn] of Object.entries({ open: id => controller.open(id), bounds: bounds => controller.bounds(bounds), navigate: data => controller.navigate(data.action, data.url), authorize: id => controller.authorize(id), clear: id => controller.clear(id) })) ipcMain.handle('app-browser-' + name, (event, argument) => { trusted(event); return fn(argument); });
}
module.exports = { createAppBrowser, registerAppBrowser, snapshotScript, elementScript };
