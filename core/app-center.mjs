import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_ROOT } from './paths.mjs';
import { emit } from './events.mjs';
import policy from './app-center-policy.cjs';

export class AppCenter {
  constructor({ directory = path.join(DATA_ROOT, '.security', 'app-center'), event = emit, now = Date.now } = {}) {
    this.directory = directory; this.event = event; this.now = now;
    this.apps = new Map(); this.jobs = new Map(); this.waiters = new Map(); this.bridge = null;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, 'apps.json');
    try { for (const app of JSON.parse(fs.readFileSync(file, 'utf8'))) { this.validate(app); app.agentAllowed ??= true; app.loginState ??= 'unknown'; this.apps.set(app.id, app); } }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('应用授权记录损坏，请检查用户数据目录 .security/app-center/apps.json'); }
    this.token = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(path.join(directory, 'bridge-token'), this.token, { mode: 0o600 });
  }
  validate(app) {
    if (!/^[\w-]{1,80}$/.test(app.id) || !app.name?.trim() || app.name.length > 100) throw new Error('应用名称或标识无效');
    const url = policy.appUrl(app.url);
    if (!Array.isArray(app.origins) || !app.origins.includes(url.origin) || app.origins.length > 20) throw new Error('应用允许的域名无效');
    for (const origin of app.origins) if (policy.appUrl(origin).origin !== origin) throw new Error('请输入完整的网站 origin，例如 https://github.com');
    if (!Array.isArray(app.loginPaths) || app.loginPaths.length > 20 || app.loginPaths.some(p => typeof p !== 'string' || !p.startsWith('/') || p.length > 150)) throw new Error('登录入口路径无效');
  }
  save() {
    const file = path.join(this.directory, 'apps.json'), temp = file + '.' + crypto.randomUUID();
    fs.writeFileSync(temp, JSON.stringify([...this.apps.values()], null, 2), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
    this.event('app_center_updated', {});
  }
  list() { return { apps: [...this.apps.values()].filter(app => app.catalogActive !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map(app => ({ ...app })), browserConnected: this.connected(), pending: [...this.waiters.values()].map(w => ({ appId: w.appId, sessionId: w.sessionId, requestId: w.id, rootSessionId: w.rootSessionId })) }; }
  get(id) { const app = this.apps.get(id); if (!app) throw new Error('应用不存在'); return app; }
  upsert(input) {
    const url = policy.appUrl(input.url), old = input.id ? this.get(input.id) : null;
    const app = { id: old?.id || crypto.randomUUID(), name: String(input.name || url.hostname).trim(), url: policy.publicPageUrl(url.href),
      origins: [...new Set([url.origin, ...(input.origins || [])])], loginPaths: input.loginPaths || ['/login', '/signin', '/sign-in', '/auth', '/oauth', '/sso'],
      status: 'needs-login', agentAllowed: old?.agentAllowed !== false, loginState: 'unknown', authorizedAt: null, lastUrl: null, createdAt: old?.createdAt || this.now(),
      source: old?.source || 'user', ...(old?.platformId ? { platformId: old.platformId, catalogActive: old.catalogActive, description: old.description, sortOrder: old.sortOrder } : {}) };
    this.validate(app);
    if (old && old.url === app.url && JSON.stringify(old.origins) === JSON.stringify(app.origins) && JSON.stringify(old.loginPaths) === JSON.stringify(app.loginPaths)) Object.assign(app, { status: old.status, loginState: old.loginState, authorizedAt: old.authorizedAt, lastUrl: old.lastUrl });
    this.apps.set(app.id, app); this.save(); return { ...app };
  }
  syncCatalog(items) {
    if (!Array.isArray(items) || items.length > 200) throw new Error('平台应用目录格式无效');
    // Validate the complete catalog before applying any change. Platform metadata
    // never includes browser cookies or user authorization.
    const entries = items.map(item => {
      if (typeof item.id !== 'string' || !/^[\w-]{1,64}$/.test(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) throw new Error('平台应用格式无效');
      const url = policy.publicPageUrl(policy.appUrl(item.url).href);
      return { id: item.id, name: item.name.trim(), url, description: String(item.description || '').slice(0, 500), sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : 0 };
    });
    if (new Set(entries.map(item => item.id)).size !== entries.length) throw new Error('平台应用标识重复');
    let changed = false;
    for (const entry of entries) {
      const id = 'platform-' + entry.id, old = this.apps.get(id), origin = new URL(entry.url).origin;
      const sameUrl = old?.url === entry.url;
      const app = { ...old, id, name: entry.name, url: entry.url, description: entry.description, sortOrder: entry.sortOrder,
        source: 'platform', platformId: entry.id, catalogActive: true,
        origins: sameUrl ? old.origins : [origin], loginPaths: old?.loginPaths || ['/login', '/signin', '/sign-in', '/auth', '/oauth', '/sso'],
        status: sameUrl ? old.status : 'needs-login', agentAllowed: old?.agentAllowed !== false, loginState: sameUrl ? old.loginState : 'unknown', authorizedAt: sameUrl ? old.authorizedAt : null,
        lastUrl: sameUrl ? old.lastUrl : null, createdAt: old?.createdAt || this.now() };
      this.validate(app);
      if (JSON.stringify(app) !== JSON.stringify(old)) { if (old && !sameUrl) this.cancelApp(id); this.apps.set(id, app); changed = true; }
    }
    const activeIds = new Set(entries.map(item => 'platform-' + item.id));
    for (const app of this.apps.values()) if (app.source === 'platform' && !activeIds.has(app.id) && app.catalogActive !== false) {
      app.catalogActive = false; app.status = 'needs-login'; app.authorizedAt = null; this.cancelApp(app.id); changed = true;
    }
    if (changed) this.save();
  }
  findOrCreate(url, name) {
    const parsed = policy.appUrl(url);
    return [...this.apps.values()].find(app => app.catalogActive !== false && app.origins.includes(parsed.origin)) || this.upsert({ url: parsed.origin + parsed.pathname, name });
  }
  revoke(id) {
    const app = this.get(id); app.agentAllowed = false; app.status = 'needs-login'; app.authorizedAt = null; this.cancelApp(id); this.save(); return { ...app };
  }
  permission(id, allowed) {
    if (typeof allowed !== 'boolean') throw new Error('应用权限必须为布尔值');
    if (!allowed) return this.revoke(id);
    const app = this.get(id); app.agentAllowed = true;
    if (app.loginState === 'signed-in' && app.catalogActive !== false) {
      app.status = 'authorized'; app.authorizedAt ||= this.now();
      for (const w of [...this.waiters.values()]) if (w.appId === id) w.finish(null, { ...app });
    }
    this.save(); return { ...app };
  }
  clearLogin(id) {
    const app = this.get(id); app.loginState = 'required'; app.status = 'needs-login'; app.authorizedAt = null; this.cancelApp(id); this.save(); return { ...app };
  }
  remove(id) { this.revoke(id); this.apps.delete(id); this.save(); }
  authorize(id, currentUrl) {
    const app = this.get(id), url = policy.appUrl(currentUrl);
    if (!app.origins.includes(url.origin) || policy.loginPage(url.href, app.loginPaths)) throw new Error('请先完成登录并回到应用页面，然后确认授权');
    app.agentAllowed = true; app.loginState = 'signed-in'; app.status = 'authorized'; app.authorizedAt = this.now(); app.lastUrl = policy.publicPageUrl(url.href); this.save();
    for (const w of [...this.waiters.values()]) if (w.appId === id) w.finish(null, { ...app });
    this.event('app_login_completed', { appId: id }); return { ...app };
  }
  observe(id, currentUrl, loginState) {
    const app = this.get(id), url = policy.appUrl(currentUrl);
    const before = JSON.stringify(app), wasReady = app.status === 'authorized';
    app.lastUrl = policy.publicPageUrl(url.href);
    if (!app.origins.includes(url.origin) || policy.loginPage(url.href, app.loginPaths) || loginState === 'required') {
      app.loginState = 'required'; app.status = 'needs-login'; app.authorizedAt = null;
    } else if (['signed-in', 'unknown'].includes(loginState)) {
      // Only the token-authenticated desktop bridge supplies document observations.
      // A public page can be usable without claiming that the user is signed in.
      app.loginState = loginState;
      if (loginState === 'signed-in' && app.agentAllowed !== false && app.catalogActive !== false) { app.status = 'authorized'; app.authorizedAt ||= this.now(); }
    }
    if (before !== JSON.stringify(app)) this.save();
    if (!wasReady && app.status === 'authorized') {
      for (const w of [...this.waiters.values()]) if (w.appId === id) w.finish(null, { ...app });
      this.event('app_login_completed', { appId: id });
    }
    return { ...app };
  }
  connected() { return this.bridge && this.now() - this.bridge.touched < 10000; }
  poll(clientId) {
    if (typeof clientId !== 'string' || !/^[\w-]{1,100}$/.test(clientId)) throw new Error('浏览器连接标识无效');
    if (this.connected() && this.bridge.id !== clientId) throw new Error('应用台已由另一个桌面实例连接');
    this.bridge = { id: clientId, touched: this.now() };
    const jobs = [];
    for (const job of this.jobs.values()) if (!job.dispatched) { job.dispatched = true; job.clientId = clientId; jobs.push({ id: job.id, app: { ...this.get(job.appId) }, action: job.action, args: job.args }); }
    return { jobs, activeJobIds: [...this.jobs.keys()] };
  }
  complete(clientId, id, result, error) {
    const job = this.jobs.get(id); if (!job || job.clientId !== clientId) return false;
    job.finish(error ? new Error(String(error).slice(0, 1000)) : null, result); return true;
  }
  command(appId, action, args = {}, { signal, timeoutMs = 30000 } = {}) {
    this.get(appId);
    if (!this.connected()) throw new Error('请打开桌面端应用台；网页端和 CLI 无法独立启动内置浏览器');
    if (signal?.aborted) throw new Error('任务已停止');
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const finish = (error, result) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.jobs.delete(id); error ? reject(error) : resolve(result); };
      const abort = () => finish(new Error('任务已停止'));
      const timer = setTimeout(() => finish(new Error('应用台操作超时')), timeoutMs);
      this.jobs.set(id, { id, appId, action, args, finish }); signal?.addEventListener('abort', abort, { once: true });
    });
  }
  waitLogin(appId, { sessionId, rootSessionId, signal, timeoutMs = 600000 } = {}) {
    if (signal?.aborted) throw new Error('任务已停止');
    const app = this.get(appId);
    if (app.status === 'authorized') return Promise.resolve({ ...app });
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const finish = (error, result) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); this.waiters.delete(id); this.event('app_login_resolved', { appId, sessionId, requestId: id, rootSessionId }); error ? reject(error) : resolve(result); };
      const abort = () => finish(new Error('任务已停止'));
      const timer = setTimeout(() => finish(new Error('等待登录超时，请登录后重新继续任务')), timeoutMs);
      this.waiters.set(id, { id, appId, sessionId, rootSessionId, finish }); signal?.addEventListener('abort', abort, { once: true });
      this.event('app_login_required', { appId, app: { ...app }, sessionId, rootSessionId, requestId: id });
    });
  }
  cancelApp(id) { for (const w of [...this.waiters.values()]) if (w.appId === id) w.finish(new Error('用户取消了应用授权')); for (const j of [...this.jobs.values()]) if (j.appId === id) j.finish(new Error('应用授权已撤销')); }
  shutdown() { for (const id of this.apps.keys()) this.cancelApp(id); this.bridge = null; }
}
let instance;
export function appCenter() { return instance ||= new AppCenter(); }
export function shutdownAppCenter() { instance?.shutdown(); }
