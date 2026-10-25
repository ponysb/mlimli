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

function elementPickerScript(action) {
  const encodedAction = JSON.stringify(action);
  return `(() => {
    const key = '__mliElementPicker';
    const secret = el => el && (el.type === 'password' || /password|one-time-code|cc-/i.test(el.autocomplete || '') || /password|passwd|secret|token|otp|verification|security code/i.test([el.name, el.id, el.getAttribute('aria-label')].join(' ')));
    const visible = el => { if (!el || el.nodeType !== 1) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
    let picker = window[key];
    if (${encodedAction} === 'stop') { picker?.cleanup?.(); delete window[key]; return { active: false }; }
    if (${encodedAction} === 'pick') { const value = picker?.picked || {}; const copyText = picker?.copyText || ''; const copyRequested = Boolean(picker?.copyRequested); if (picker) { picker.picked = null; picker.copyText = ''; picker.copyRequested = false; } return { ...value, active: Boolean(picker?.active), copyText, copyRequested }; }
    if (${encodedAction} !== 'start') return { active: Boolean(picker?.active) };
    if (picker?.active) return { active: true };
    const previous = new WeakMap();
    const tooltipStyle = 'position:fixed;z-index:2147483647;display:none;min-width:180px;max-width:360px;padding:10px 12px;border:1px solid #e3e7ed;border-radius:10px;background:#fff;color:#303842;box-shadow:0 8px 24px rgba(25,35,48,.16);font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto;';
    const tooltip = document.createElement('div');
    tooltip.setAttribute('data-mli-element-picker-tooltip', 'true'); tooltip.style.cssText = tooltipStyle;
    document.documentElement.appendChild(tooltip);
    const updateTooltip = (el, info) => {
      if (!el || !info) { tooltip.style.display = 'none'; return; }
      const style = info.styles || {};
      tooltip.innerHTML = '<div style="display:flex;align-items:center;gap:12px"><b style="font:600 13px ui-monospace,SFMono-Regular,Consolas,monospace;color:#303842">' + info.tag + '</b><span style="margin-left:auto;color:#4f5b69;font-variant-numeric:tabular-nums">' + info.rect.width + ' x ' + info.rect.height + '</span><button data-copy="1" type="button" style="display:grid;place-items:center;width:26px;height:26px;padding:0;border:1px solid #d9e0e8;border-radius:6px;background:#fff;color:#56677a;cursor:pointer;line-height:0" title="复制元素信息" aria-label="复制元素信息"><svg data-copy-icon width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>' + (info.text || info.ariaLabel ? '<div style="margin-top:5px;max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#697482">' + String(info.text || info.ariaLabel).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])) + '</div>' : '') + '<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 14px;margin-top:6px;color:#7a8592"><span>颜色</span><b style="color:#3d4855;font-weight:500">' + style.color + '</b><span>字体</span><b style="color:#3d4855;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + style.fontSize + ' ' + style.fontFamily + '</b></div>';
      tooltip.querySelector('[data-copy]')?.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        state.copyText = ['<' + info.tag + '>', info.text || info.ariaLabel || info.selector, info.rect.width + ' x ' + info.rect.height, info.selector].filter(Boolean).join('\\n');
        state.copyRequested = true;
        window.__mliBrowserBridge?.copy(state.copyText);
        const button = tooltip.querySelector('[data-copy]');
        if (button) {
          button.title = '已复制'; button.setAttribute('aria-label', '已复制');
          button.style.color = '#2f8a5b'; button.style.borderColor = '#b9dfc8'; button.style.background = '#f1fbf4';
          button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
        }
      });
      tooltip.style.display = 'block';
      const rect = el.getBoundingClientRect(); const tip = tooltip.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - tip.width - 8));
      const above = rect.top - tip.height - 10;
      tooltip.style.left = Math.round(left) + 'px'; tooltip.style.top = Math.round(Math.max(8, above >= 8 ? above : rect.bottom + 10)) + 'px';
    };
    const setHighlight = el => {
      if (picker.hovered === el) return;
      if (picker.hovered && previous.has(picker.hovered)) { const old = previous.get(picker.hovered); picker.hovered.style.outline = old.outline; picker.hovered.style.outlineOffset = old.outlineOffset; }
      picker.hovered = el;
      if (el) { previous.set(el, { outline: el.style.outline, outlineOffset: el.style.outlineOffset }); el.style.outline = '2px solid #4f8cff'; el.style.outlineOffset = '2px'; updateTooltip(el, describe(el)); }
      else updateTooltip(null);
    };
    const selector = el => {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && node !== document.body && parts.length < 5) {
        let part = node.tagName.toLowerCase();
        if (node.classList.length) part += '.' + Array.from(node.classList).slice(0, 2).map(CSS.escape).join('.');
        const siblings = node.parentElement ? Array.from(node.parentElement.children).filter(child => child.tagName === node.tagName) : [];
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        parts.unshift(part); node = node.parentElement;
      }
      return parts.join(' > ') || el.tagName.toLowerCase();
    };
    const describe = el => {
      if (!visible(el)) return null;
      const rect = el.getBoundingClientRect(); const style = getComputedStyle(el);
      const sensitive = secret(el);
      const text = sensitive ? '' : (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 240);
      return { tag: el.tagName.toLowerCase(), id: sensitive ? '' : (el.id || ''), classes: sensitive ? [] : Array.from(el.classList).slice(0, 8), text, ariaLabel: sensitive ? '' : (el.getAttribute('aria-label') || ''), role: el.getAttribute('role') || '', rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }, styles: { color: style.color, backgroundColor: style.backgroundColor, fontSize: style.fontSize, fontFamily: style.fontFamily, padding: style.padding, borderRadius: style.borderRadius }, selector: sensitive ? '' : selector(el), sensitive };
    };
    const cleanup = () => {
      if (!window[key]) return;
      document.removeEventListener('pointermove', window[key].move, true); document.removeEventListener('click', window[key].click, true); document.removeEventListener('keydown', window[key].key, true);
      if (window[key].hovered && previous.has(window[key].hovered)) { const old = previous.get(window[key].hovered); window[key].hovered.style.outline = old.outline; window[key].hovered.style.outlineOffset = old.outlineOffset; }
      tooltip.remove();
      window[key].hovered = null; window[key].active = false;
    };
    const state = { active: true, hovered: null, picked: null, copyText: '', copyRequested: false, locked: false, cleanup, tooltip };
    state.move = event => { if (state.locked) return; const target = event.target && event.target.nodeType === 1 && !tooltip.contains(event.target) ? event.target : null; setHighlight(target); };
    state.click = event => { if (!state.active || tooltip.contains(event.target)) return; event.preventDefault(); event.stopPropagation(); const target = event.target && event.target.nodeType === 1 ? event.target : null; state.picked = describe(target); state.locked = true; setHighlight(target); };
    state.key = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cleanup(); delete window[key]; } };
    window[key] = state;
    picker = state;
    document.addEventListener('pointermove', state.move, true); document.addEventListener('click', state.click, true); document.addEventListener('keydown', state.key, true);
    return { active: true };
  })()`;
}



function createAppBrowser({ electron, getWindow, serverUrl, dataRoot, testAllowLocal = false }) {
  const { app, BrowserView, WebContentsView, BrowserWindow, Menu, dialog, session, shell, clipboard } = electron;
  const views = new Map(), popups = new Map(), jobs = new Map();
  const extensionDirectory = path.join(dataRoot, '.security', 'browser');
  const extensionFile = path.join(extensionDirectory, 'extensions.json');
  const clientId = crypto.randomUUID();
  let timer, busy = false, stopped = false, activeId, surface = null, attached = null, attachedSurface = null;
  const pagePreload = path.join(__dirname, 'browser-page-preload.cjs');
  fs.mkdirSync(extensionDirectory, { recursive: true, mode: 0o700 });
  const downloadsDirectory = app?.getPath?.('downloads') || path.join(dataRoot, 'downloads');
  fs.mkdirSync(downloadsDirectory, { recursive: true });
  function availableDownloadPath(filename) {
    const safeName = path.basename(String(filename || 'download')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    const parsed = path.parse(safeName); let candidate = path.join(downloadsDirectory, safeName), suffix = 1;
    while (fs.existsSync(candidate)) candidate = path.join(downloadsDirectory, `${parsed.name} (${suffix++})${parsed.ext}`);
    return candidate;
  }
  function extensionPaths() {
    try { return JSON.parse(fs.readFileSync(extensionFile, 'utf8')).filter(value => typeof value === 'string'); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('浏览器扩展配置损坏'); return []; }
  }
  function saveExtensionPaths(paths) {
    fs.writeFileSync(extensionFile, JSON.stringify([...new Set(paths)], null, 2), { mode: 0o600 });
  }
  function extensionInfo(extensionPath) {
    const manifestFile = path.join(extensionPath, 'manifest.json');
    if (!fs.existsSync(manifestFile)) throw new Error('所选目录不包含 manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (![2, 3].includes(manifest.manifest_version) || !String(manifest.name || '').trim()) throw new Error('扩展 manifest.json 无效');
    return { path: extensionPath, name: String(manifest.name).slice(0, 120), version: String(manifest.version || '') };
  }
  async function loadConfiguredExtensions(appSession) {
    const loaded = [], failed = [];
    const api = appSession.extensions || appSession;
    for (const configuredPath of extensionPaths()) {
      try {
        const info = extensionInfo(configuredPath);
        const existing = (api.getAllExtensions?.() || []).find(extension => path.resolve(extension.path || '') === path.resolve(configuredPath));
        const extension = existing || await api.loadExtension(configuredPath, { allowFileAccess: false });
        loaded.push({ ...info, id: extension.id });
      } catch (error) { failed.push({ path: configuredPath, error: error.message }); }
    }
    return { loaded, failed };
  }
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
  function state(item) { return { appId: item.app.id, browserId: item.app.transient ? item.app.id : undefined, transient: item.app.transient === true, url: item.contents.getURL() ? publicPageUrl(item.contents.getURL()) : '', title: item.contents.getTitle(), loading: item.contents.isLoading(), canGoBack: item.contents.canGoBack(), canGoForward: item.contents.canGoForward() }; }
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
  function dispatchMenuAction(browserId, action, value) {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('app-browser-menu-action', { browserId, action, value });
  }
  function popupMenu(kind, position = {}) {
    const win = getWindow();
    if (!win || win.isDestroyed() || !Menu) return false;
    const browserId = position.browserId || activeId;
    const item = views.get(browserId);
    const send = (action, value) => () => dispatchMenuAction(browserId, action, value);
    const extensionItems = (item ? extensionPaths().map(extensionPath => {
      try { const info = extensionInfo(extensionPath); return { label: `${info.name}${info.version ? `  ${info.version}` : ''}`, enabled: false }; }
      catch { return { label: path.basename(extensionPath), enabled: false }; }
    }) : []);
    const template = kind === 'extensions' ? [
      ...(extensionItems.length ? extensionItems : [{ label: '未加载扩展程序', enabled: false }]),
      { type: 'separator' },
      { label: '加载本地扩展', click: send('load-extension') },
      { label: '访问 Edge 外接程序商店', click: send('extension-store') },
    ] : [
      { label: '在页面中查找', enabled: Boolean(item), click: send('find') },
      { label: '打印', enabled: Boolean(item), click: send('print') },
      { label: '缩放', submenu: [
        { label: '放大', enabled: Boolean(item), click: send('zoom', 0.1) },
        { label: '缩小', enabled: Boolean(item), click: send('zoom', -0.1) },
        { label: '重置为 100%', enabled: Boolean(item), click: send('zoom-reset') },
      ] },
      { type: 'separator' },
      { label: '设备工具栏', enabled: Boolean(item), click: send('device-toolbar') },
      { label: '开发者工具', enabled: Boolean(item), click: send('devtools') },
      { label: '截取屏幕截图', enabled: Boolean(item), click: send('screenshot') },
      { type: 'separator' },
      { label: '下载', click: send('downloads') },
      { label: '历史记录', click: send('history') },
      { label: '清除浏览数据', enabled: Boolean(item), click: send('clear-data') },
      { type: 'separator' },
      { label: '浏览器设置', click: send('settings') },
    ];
    const options = { window: win };
    if (Number.isFinite(position.x) && Number.isFinite(position.y)) { options.x = Math.round(position.x); options.y = Math.round(position.y); }
    Menu.buildFromTemplate(template).popup(options);
    return true;
  }
  async function ensure(app) {
    let item = views.get(app.id);
    if (item && !item.contents.isDestroyed()) { item.app = app; return item; }
    // Electron extensions require persistent sessions. Every plain web tab gets
    // its own profile, which is cleared when the tab closes.
    const partition = app.transient ? 'persist:mli-browser-' + app.id : 'persist:mli-app-' + app.id;
    const appSession = session.fromPartition(partition);
    // App-center sessions are separate Chromium profiles. Make their network
    // resolver follow the host browser/system proxy (including PAC and the
    // Windows Internet Settings proxy) before the first navigation. Without
    // this, Chromium may connect directly while the host browser reaches the
    // same public site through a local proxy, which commonly fails during TLS
    // negotiation for transparent DNS mappings.
    if (typeof appSession.setProxy === 'function') await appSession.setProxy({ mode: 'system' });
    if (app.transient) await loadConfiguredExtensions(appSession);
    appSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    appSession.setPermissionCheckHandler(() => false);
    appSession.on('will-download', (_event, downloadItem) => {
      const target = availableDownloadPath(downloadItem.getFilename());
      const download = { name: path.basename(target), path: target, state: 'progressing', startedAt: Date.now() };
      item.downloads.unshift(download); item.downloads.splice(100);
      downloadItem.setSavePath(target);
      downloadItem.once('done', (_doneEvent, state) => { download.state = state; notify(item); });
    });
    appSession.webRequest.onBeforeRequest((details, callback) => {
      // data/blob resources are allowed inside the Chromium sandbox only.
      if (/^(data:|blob:|chrome-extension:)/i.test(details.url)) return callback({});
      safeNetwork(details.url).then(() => callback({}), () => callback({ cancel: true }));
    });
    const webPreferences = { session: appSession, preload: pagePreload, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false, backgroundThrottling: false };
    const modern = typeof WebContentsView === 'function' && typeof getWindow()?.contentView?.addChildView === 'function';
    const view = modern ? new WebContentsView({ webPreferences }) : new BrowserView({ webPreferences });
    item = { app, view, contents: view.webContents, modern, appSession, chain: Promise.resolve(), observations: Promise.resolve(), revision: 0, agentMode: false, pickerActive: false, lastObserved: 0, visitedOrigins: new Set(), history: [], downloads: [], mobileEmulation: false };
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
        contents.on('did-start-loading', () => {
          // Navigation invalidates DOM references and picker highlights.
          contents.executeJavaScriptInIsolatedWorld(999, [{ code: elementPickerScript('stop') }]).catch(() => {});
          notify(item);
        });
        for (const event of ['did-stop-loading', 'page-title-updated']) contents.on(event, () => notify(item));
        const remember = url => {
          try {
            item.visitedOrigins.add(new URL(url).origin);
            const publicUrl = publicPageUrl(url), previous = item.history[0];
            if (previous?.url === publicUrl) Object.assign(previous, { title: contents.getTitle(), at: Date.now() });
            else { item.history.unshift({ url: publicUrl, title: contents.getTitle(), at: Date.now() }); item.history.splice(100); }
          } catch {}
        };
        contents.on('did-navigate', (_event, url) => { if (!item.app.transient) observeNavigation(item, url); else remember(url); });
        contents.on('did-navigate-in-page', (_event, url, main) => { if (main && !item.app.transient) observeNavigation(item, url); else if (main) remember(url); });
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
  async function openUrl(url, browserId = 'browser-' + crypto.randomUUID()) {
    const target = validateUrl(url).href;
    const parsed = new URL(target);
    const app = { id: browserId, name: parsed.hostname, url: target, origins: [parsed.origin], transient: true, status: 'authorized', agentAllowed: true };
    const item = await ensure(app); item.agentMode = false; activeId = browserId; attach();
    if (publicPageUrl(item.contents.getURL() || target) !== publicPageUrl(target)) await item.contents.loadURL(target);
    else if (!item.contents.getURL()) await item.contents.loadURL(target);
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
      if (job.action === 'open_url') {
        const url = validateUrl(job.args.url || job.app.url);
        activeId = job.app.id; attach(); item.agentMode = true;
        if (!item.contents.getURL() || publicPageUrl(item.contents.getURL()) !== publicPageUrl(url.href)) await item.contents.loadURL(url.href);
        const result = await item.contents.executeJavaScriptInIsolatedWorld(999, [{ code: snapshotScript(crypto.randomUUID()) }]);
        notify(item);
        return { ...result, browser_id: job.app.id, url: publicPageUrl(item.contents.getURL()) };
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
    async openUrl(data) { return openUrl(data.url, data.browserId); },
    async closeBrowser(browserId) {
      const item = views.get(browserId);
      if (!item?.app.transient) return false;
      if (activeId === browserId) { activeId = null; attach(); }
      if (!item.contents.isDestroyed()) item.contents.close();
      views.delete(browserId);
      for (const origin of item.visitedOrigins) await item.appSession.clearStorageData({ origin });
      await item.appSession.clearCache();
      return true;
    },
    listExtensions() {
      return extensionPaths().map(configuredPath => {
        try { return { ...extensionInfo(configuredPath), error: '' }; }
        catch (error) { return { path: configuredPath, name: path.basename(configuredPath), version: '', error: error.message }; }
      });
    },
    async addExtension(extensionPath) {
      const resolved = fs.realpathSync(extensionPath), info = extensionInfo(resolved);
      const paths = extensionPaths();
      if (!paths.includes(resolved)) { paths.push(resolved); saveExtensionPaths(paths); }
      const results = [];
      for (const item of views.values()) if (item.app.transient) results.push(await loadConfiguredExtensions(item.appSession));
      return { extension: info, extensions: this.listExtensions(), results };
    },
    removeExtension(extensionPath) {
      const resolved = path.resolve(extensionPath);
      saveExtensionPaths(extensionPaths().filter(value => path.resolve(value) !== resolved));
      for (const item of views.values()) if (item.app.transient) {
        const api = item.appSession.extensions || item.appSession;
        for (const extension of api.getAllExtensions?.() || []) if (path.resolve(extension.path || '') === resolved) api.removeExtension(extension.id);
      }
      return this.listExtensions();
    },
    async pageAction(data = {}) {
      if (data.action === 'menu-overlay') return { ok: popupMenu(data.kind === 'extensions' ? 'extensions' : 'more', data) };
      const item = views.get(data.browserId || activeId); if (!item) throw new Error('请先打开网页');
      if (data.action === 'zoom') {
        const factor = Math.max(0.5, Math.min(2, Number(data.factor) || 1)); item.contents.setZoomFactor(factor); return { zoomFactor: factor };
      }
      if (data.action === 'find') { item.contents.findInPage(String(data.text || '').slice(0, 500), { findNext: data.findNext !== false, forward: data.forward !== false }); return { ok: true }; }
      if (data.action === 'stop-find') { item.contents.stopFindInPage('clearSelection'); return { ok: true }; }
      if (data.action === 'print') {
        const printed = await new Promise(resolve => item.contents.print({ silent: false, printBackground: true }, success => resolve(success)));
        return { ok: printed };
      }
      if (data.action === 'device-toolbar') {
        item.mobileEmulation = !item.mobileEmulation;
        if (item.mobileEmulation) item.contents.enableDeviceEmulation({ screenPosition: 'mobile', screenSize: { width: 390, height: 844 }, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 2, viewSize: { width: 390, height: 844 }, scale: 1 });
        else item.contents.disableDeviceEmulation();
        item.contents.reload();
        return { ok: true, message: item.mobileEmulation ? '已切换为移动设备视图' : '已恢复桌面设备视图' };
      }
      if (data.action === 'devtools') { item.contents.openDevTools({ mode: 'detach', activate: true }); return { ok: true }; }
      if (data.action === 'screenshot') {
        if (!dialog?.showSaveDialog) throw new Error('当前环境不支持保存截图');
        const selected = await dialog.showSaveDialog(getWindow(), { title: '保存网页截图', defaultPath: path.join(downloadsDirectory, `网页截图-${new Date().toISOString().replace(/[:.]/g, '-')}.png`), filters: [{ name: 'PNG 图片', extensions: ['png'] }] });
        if (selected.canceled || !selected.filePath) return { ok: false };
        fs.writeFileSync(selected.filePath, (await item.contents.capturePage()).toPNG());
        return { ok: true, message: '网页截图已保存' };
      }
      if (data.action === 'preview') {
        return { dataUrl: (await item.contents.capturePage()).toDataURL() };
      }
      if (data.action === 'copy-text') {
        const value = String(data.text || '').slice(0, 10000);
        if (!value) return { ok: false };
        if (!clipboard?.writeText) throw new Error('当前环境不支持复制');
        clipboard.writeText(value);
        return { ok: true, message: '元素信息已复制' };
      }
      if (data.action === 'history') return { items: item.history.map(entry => ({ ...entry })) };
      if (data.action === 'downloads') return { items: item.downloads.map(entry => ({ ...entry })) };
      if (data.action === 'open-downloads') {
        const error = await shell?.openPath?.(downloadsDirectory); if (error) throw new Error(error);
        return { ok: true };
      }
      if (data.action === 'clear-data') {
        for (const origin of item.visitedOrigins) await item.appSession.clearStorageData({ origin });
        await item.appSession.clearCache(); item.visitedOrigins.clear(); item.history = [];
        item.contents.clearHistory?.();
        return { ok: true, message: '浏览数据已清除' };
      }
      if (['element-picker-start', 'element-picker-stop', 'element-picker-pick'].includes(data.action)) {
        const action = data.action.replace('element-picker-', '');
        item.pickerActive = action !== 'stop';
        return item.contents.executeJavaScriptInIsolatedWorld(999, [{ code: elementPickerScript(action) }]);
      }
      throw new Error('不支持的网页操作');
    },
    copyFromPage(sender, value) {
      const item = [...views.values()].find(candidate => candidate.contents === sender);
      const text = String(value || '').slice(0, 10000);
      if (!item || !item.pickerActive || !text || !clipboard?.writeText) return false;
      clipboard.writeText(text);
      const win = getWindow();
      if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('app-browser-copied', { browserId: item.app.transient ? item.app.id : undefined, message: '元素信息已复制' });
      return true;
    },
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

function registerAppBrowser({ ipcMain, controller, getWindow, serverUrl, chooseExtension, openExtensionStore }) {
  function trusted(event) {
    const win = getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || new URL(event.senderFrame.url).origin !== serverUrl) throw new Error('应用台只允许工作台主窗口调用');
  }
  ipcMain.on('app-browser-copy-request', (event, value) => controller.copyFromPage?.(event.sender, value));
  for (const [name, fn] of Object.entries({ open: id => controller.open(id), 'open-url': data => controller.openUrl(data), 'close-tab': id => controller.closeBrowser(id), bounds: bounds => controller.bounds(bounds), navigate: data => controller.navigate(data.action, data.url), authorize: id => controller.authorize(id), clear: id => controller.clear(id), extensions: () => controller.listExtensions(), 'add-extension': async () => { const selected = await chooseExtension(); return selected ? controller.addExtension(selected) : null; }, 'remove-extension': extensionPath => controller.removeExtension(extensionPath), 'extension-store': () => openExtensionStore(), 'page-action': data => controller.pageAction(data) })) ipcMain.handle('app-browser-' + name, (event, argument) => { trusted(event); return fn(argument); });
}
module.exports = { createAppBrowser, registerAppBrowser, snapshotScript, elementScript };
