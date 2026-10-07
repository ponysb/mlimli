import crypto from 'node:crypto';
import { appCenter } from './app-center.mjs';
import { refreshAppCatalog } from './app-center-catalog.mjs';
import { loadAppIcon } from './app-center-icons.mjs';
import policy from './app-center-policy.cjs';

export async function appCenterRoute(req, res, url, { json: sendJson, readBody, stopSession }) {
  if (!url.pathname.startsWith('/api/app-center')) return false;
  const json = (...args) => { sendJson(...args); return true; };
  // No cross-origin application management, including from a remote app tab.
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) return json(res, 403, { error: '应用台接口不允许跨站调用' });
  const center = appCenter();
  try {
    if (url.pathname.startsWith('/api/app-center/bridge')) {
      const token = req.headers['x-mli-browser-token'];
      if (typeof token !== 'string' || token.length !== center.token.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(center.token))) return json(res, 403, { error: '内置浏览器连接认证失败' });
      const body = await readBody(req);
      if (req.method !== 'POST') return json(res, 405, { error: '需要 POST' });
      if (url.pathname === '/api/app-center/bridge/poll') return json(res, 200, center.poll(body.clientId));
      if (url.pathname === '/api/app-center/bridge/result') return json(res, 200, { accepted: center.complete(body.clientId, body.id, body.result, body.error) });
      if (url.pathname === '/api/app-center/bridge/authorize') return json(res, 200, { app: center.authorize(body.appId, body.url) });
      if (url.pathname === '/api/app-center/bridge/observe') return json(res, 200, { app: center.observe(body.appId, body.url, body.loginState) });
    }
    if (url.pathname === '/api/app-center' && req.method === 'GET') { const catalog = await refreshAppCatalog(center, { force: url.searchParams.get('refresh') === '1' }); return json(res, 200, { ...center.list(), ...catalog }); }
    const iconMatch = /^\/api\/app-center\/apps\/([\w-]+)\/icon$/.exec(url.pathname);
    if (iconMatch && req.method === 'GET') {
      const icon = await loadAppIcon(center.get(iconMatch[1]).url);
      if (!icon) { res.writeHead(404, { 'cache-control': 'private, max-age=3600' }); res.end(); return true; }
      res.writeHead(200, { 'content-type': icon.type, 'content-length': icon.data.length, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" }); res.end(icon.data); return true;
    }
    if (url.pathname === '/api/app-center/apps' && req.method === 'POST') {
      const input = await readBody(req);
      if (typeof input.url === 'string' && !/^[a-z][a-z\d+.-]*:/i.test(input.url.trim())) input.url = 'https://' + input.url.trim();
      const parsed = policy.appUrl(input.url), previous = !input.id && center.list().apps.find(app => app.url === policy.publicPageUrl(parsed.href));
      if (previous) return json(res, 200, { app: previous });
      return json(res, 201, { app: center.upsert(input) });
    }
    const match = /^\/api\/app-center\/apps\/([\w-]+)(?:\/(revoke|cancel|permission|clear-login))?$/.exec(url.pathname);
    if (match && req.method === 'DELETE' && !match[2]) { center.remove(match[1]); return json(res, 200, { ok: true }); }
    if (match && req.method === 'POST' && match[2]) {
      if (match[2] === 'permission') return json(res, 200, { app: center.permission(match[1], (await readBody(req)).allowed) });
      if (match[2] === 'clear-login') return json(res, 200, { app: center.clearLogin(match[1]) });
      if (match[2] === 'cancel') for (const pending of center.list().pending.filter(item => item.appId === match[1])) if (pending.sessionId) stopSession?.(pending.sessionId);
      if (match[2] === 'cancel') center.cancelApp(match[1]); else center.revoke(match[1]);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: '应用台接口不存在' });
  } catch (error) { return json(res, 400, { error: error.message }); }
}
