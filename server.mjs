// server.mjs —— 入口：原生 node:http。REST + 全局 SSE 事件总线 + 静态托管
// UI 只是这个 server 的一个客户端：收用户输入 POST、看 SSE 事件、把用户决策 POST 回来
import './core/environment.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, getConfig, applyProviderPatch, saveConfigFile, publicSettings, listRemoteModels, testProvider, refreshManagedCatalog } from './core/llm.mjs';
import { setLoopConfig, runTurn, abortRun, isRunning, runDevTool, runtimeInfo, Session } from './core/loop.mjs';
import { onEvent, emit } from './core/events.mjs';
import { setWorkspaceRoot, APP_ROOT, DATA_ROOT, getWorkspaceRoot } from './core/paths.mjs';
import { listWorkspaces, addWorkspace, setActiveWorkspace, removeWorkspace, ensureWorkspace } from './core/workspaces.mjs';
import { loadAll, pluginsInfo, resolveUiRequest, getCommands, setPlatformSkills } from './core/plugins.mjs';
import { resolveRequest, listPersistentRules, replacePersistentRules, pendingRequest } from './core/permissions.mjs';
import { maybeCompact } from './core/compact.mjs';
import { getApiLog, queryApiLogs } from './core/api-logs.mjs';
import { copyWorkspaceItem, createWorkspaceItem, deleteWorkspaceItem, listDirectory, moveWorkspaceItem, openWorkspaceItem, rawWorkspaceFile, readWorkspaceFile, renameWorkspaceItem, revealWorkspaceItem, writeWorkspaceFile } from './core/workspace-files.mjs';
import { addAsset, addAssetFromFile, assetFile, deleteAsset, listAssets } from './core/assets.mjs';
import { createPurchaseOrder, getAccountCaptcha, listPurchasePackages, listPlatformLibrary, listAccountPlugins, installAccountPlugin, loginAccount, logoutAccount, publicAccountStatus, queryPurchaseOrder, refreshAccount, registerAccount, requireAccount, resetAccountPassword, sendRegisterCode, sendResetCode, setAccountConfig, updateAccountNickname, verifyAccountCaptcha } from './core/account.mjs';
import { DENY_PATTERNS } from './core/tools.mjs';
import { listExperts, getExpert, saveExpert, deleteExpert, setPlatformExperts } from './core/experts.mjs';
import { saveLocalSkill, deleteLocalSkill, listLocalSkills } from './core/local-skills.mjs';
import { convertOfficeFile } from './plugins/office/plugin.mjs';

const CONFIG_FILE = path.join(DATA_ROOT, 'config.json');
const cfg = loadConfig(CONFIG_FILE);
setLoopConfig(cfg);
setAccountConfig(cfg);
const initialWorkspace = ensureWorkspace(path.resolve(DATA_ROOT, cfg.security?.workspaceRoot ?? '.'));
setWorkspaceRoot(initialWorkspace.path);
await loadAll();

const PORT = Number(process.env.MLI_AGENT_PORT || cfg.server?.port || 3000);
const HOST = process.env.MLI_AGENT_HOST || cfg.server?.host || '127.0.0.1';
const terminalRuns = new Map();
const activeSequences = new Set();
const runningSessions = new Map();
async function runSequence(session, text, attachments, options = {}) {
  if (activeSequences.has(session.id)) return;
  activeSequences.add(session.id);
  runningSessions.set(session.id, session);
  try {
    await runTurn(session, text, attachments, options);
    while (session.queued().length) {
      const lastTurn = session.chain().findLast((entry) => entry.type === 'turn_end');
      if (lastTurn?.reason !== 'done') break;
      const next = session.queued()[0];
      await runTurn(session, next.text, [], { queuedId: next.queueId, savedAttachments: next.attachments });
    }
  } finally { activeSequences.delete(session.id); runningSessions.delete(session.id); }
}
let platformLibraryLoadedAt = 0;
let platformLibraryRefresh = null;
async function refreshPlatformLibrary(force = false) {
  if (!force && Date.now() - platformLibraryLoadedAt < 30000) return;
  if (platformLibraryRefresh) return platformLibraryRefresh;
  platformLibraryRefresh = (async () => {
    const { items } = await listPlatformLibrary();
    setPlatformExperts(items);
    setPlatformSkills(items);
    platformLibraryLoadedAt = Date.now();
  })().finally(() => { platformLibraryRefresh = null; });
  return platformLibraryRefresh;
}

function decodeTerminalOutput(buffer) {
  const utf8 = Buffer.from(buffer).toString('utf8');
  if ((utf8.match(/\uFFFD/g) || []).length > 2) {
    try { return new TextDecoder('gbk').decode(Buffer.from(buffer)); } catch { return utf8; }
  }
  return utf8;
}

function startTerminalRun(command) {
  const value = String(command || '').trim();
  if (!value) throw new Error('命令不能为空');
  if (value.length > 8000) throw new Error('命令长度不能超过 8000 个字符');
  if (DENY_PATTERNS.some((pattern) => pattern.test(value))) throw new Error('命令被安全策略拒绝（匹配危险命令模式）');
  const id = crypto.randomUUID().slice(0, 12);
  const cwd = getWorkspaceRoot();
  const run = { id, command: value, cwd, child: null, output: [], startedAt: Date.now(), status: 'starting' };
  terminalRuns.set(id, run);
  setImmediate(() => {
    const isWindows = process.platform === 'win32';
    const child = isWindows
      ? spawn('cmd.exe', ['/d', '/s', '/c', `"chcp 65001 >nul & ${value}"`], { cwd, windowsHide: true, windowsVerbatimArguments: true })
      : spawn('/bin/sh', ['-lc', value], { cwd });
    run.child = child;
    run.status = 'running';
    emit('terminal_started', { terminalId: id, command: value, cwd });
    const append = (stream, data) => {
      const text = decodeTerminalOutput(data);
      if (!text) return;
      run.output.push({ stream, text });
      if (run.output.length > 2000) run.output.shift();
      emit('terminal_output', { terminalId: id, stream, text });
    };
    child.stdout?.on('data', (data) => append('stdout', data));
    child.stderr?.on('data', (data) => append('stderr', data));
    child.on('error', (error) => {
      run.status = 'error';
      append('stderr', Buffer.from(error.message));
      emit('terminal_exit', { terminalId: id, code: null, signal: error.code || 'spawn_error', durationMs: Date.now() - run.startedAt });
      terminalRuns.delete(id);
    });
    child.on('close', (code, signal) => {
      if (run.status === 'exited') return;
      run.status = 'exited';
      emit('terminal_exit', { terminalId: id, code, signal: run.stopped ? 'SIGINT' : signal, durationMs: Date.now() - run.startedAt });
      setTimeout(() => terminalRuns.delete(id), 5 * 60 * 1000);
    });
  });
  return { terminalId: id, command: value, cwd };
}

function stopTerminalRun(id) {
  const run = terminalRuns.get(id);
  if (!run?.child || run.status !== 'running') return false;
  run.stopped = true;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(run.child.pid), '/T', '/F'], { windowsHide: true });
    killer.on('error', () => { try { run.child.kill(); } catch {} });
    return true;
  }
  try { run.child.kill('SIGINT'); setTimeout(() => { try { run.child.kill('SIGKILL'); } catch {} }, 750); } catch {}
  return true;
}

// ---------- SSE 总线 ----------
const sseClients = new Set();
onEvent((evt) => {
  const frame = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) {
    try { res.write(frame); } catch { sseClients.delete(res); }
  }
});
setInterval(() => {
  for (const res of sseClients) { try { res.write(': ping\n\n'); } catch { sseClients.delete(res); } }
}, 25000);

// ---------- 工具 ----------
function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function badRequest(res, msg) { json(res, 400, { error: msg }); }
function notFound(res, msg = 'not found') { json(res, 404, { error: msg }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

function getSessionOr400(res, id) {
  const s = runningSessions.get(id) || Session.load(id);
  if (!s) { notFound(res, '会话不存在'); return null; }
  return s;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const staticRoot = path.join(APP_ROOT, 'dist');
  if (!fs.existsSync(path.join(staticRoot, 'index.html'))) {
    res.writeHead(503, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
    res.end('Frontend not built. Run npm run build:web and restart the server.');
    return;
  }
  const abs = path.resolve(staticRoot, rel);
  if (!abs.startsWith(staticRoot)) { notFound(res); return; }
  fs.readFile(abs, (err, data) => {
    if (err) {
      if (path.extname(abs)) { notFound(res); return; }
      // SPA 兜底
      fs.readFile(path.join(staticRoot, 'index.html'), (e2, html) => {
        if (e2) return notFound(res);
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(abs)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}

// ---------- 路由 ----------
async function route(req, res, url) {
  const { pathname } = url;
  const m = (re) => pathname.match(re);
  let match;

  // SSE
  if (pathname === '/api/event') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'server_connected', ts: Date.now() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return true;
  }

  if (pathname === '/api/info') {
    Promise.all([refreshManagedCatalog(), refreshPlatformLibrary()]).then(() => emit('catalog_updated', { ok: true })).catch(() => {});
    return json(res, 200, { ...runtimeInfo(), ...publicSettings(), account: publicAccountStatus(), plugins: pluginsInfo(), commands: getCommands(), experts: listExperts(), localSkills: listLocalSkills(), workspace: getWorkspaceRoot(), workspaces: listWorkspaces() });
  }
  if (pathname === '/api/library/experts' && req.method === 'POST') {
    try { return json(res, 200, saveExpert(await readBody(req))); } catch (error) { return badRequest(res, error.message); }
  }
  if ((match = m(/^\/api\/library\/experts\/([\w-]+)$/)) && req.method === 'DELETE') {
    try { deleteExpert(match[1]); return json(res, 200, { ok: true }); } catch (error) { return badRequest(res, error.message); }
  }
  if (pathname === '/api/library/skills' && req.method === 'POST') {
    try { return json(res, 200, saveLocalSkill(await readBody(req))); } catch (error) { return badRequest(res, error.message); }
  }
  if ((match = m(/^\/api\/library\/skills\/([\w-]+)$/)) && req.method === 'DELETE') {
    try { deleteLocalSkill(match[1]); return json(res, 200, { ok: true }); } catch (error) { return badRequest(res, error.message); }
  }
  if (pathname === '/api/account' && req.method === 'GET') return json(res, 200, publicAccountStatus());
  if (pathname === '/api/account/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (!String(body.email || '').trim() || !String(body.password || '')) return badRequest(res, '邮箱和密码不能为空');
    try {
      const account = await loginAccount(String(body.email).trim(), String(body.password));
      await refreshManagedCatalog({ force: true }).catch(() => {});
      await refreshPlatformLibrary(true).catch(() => {});
      emit('account_updated', { account });
      return json(res, 200, account);
    } catch (error) {
      return json(res, error.status === 401 || error.status === 403 ? error.status : 502, { error: error.message, code: error.code });
    }
  }
  if (pathname === '/api/account/captcha' && req.method === 'GET') {
    try { return json(res, 200, await getAccountCaptcha()); }
    catch (error) { return json(res, error.status || 502, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/captcha/verify' && req.method === 'POST') {
    try { return json(res, 200, await verifyAccountCaptcha(String((await readBody(req)).code || ''))); }
    catch (error) { return json(res, error.status || 400, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/register-code' && req.method === 'POST') {
    try { const body = await readBody(req); return json(res, 200, await sendRegisterCode(String(body.email || '').trim())); }
    catch (error) { return json(res, error.status || 400, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/register' && req.method === 'POST') {
    try { const body = await readBody(req); return json(res, 201, await registerAccount(String(body.email || '').trim(), String(body.password || ''), String(body.code || ''))); }
    catch (error) { return json(res, error.status || 400, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/reset-code' && req.method === 'POST') {
    try { const body = await readBody(req); return json(res, 200, await sendResetCode(String(body.email || '').trim())); }
    catch (error) { return json(res, error.status || 400, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/reset-password' && req.method === 'POST') {
    try { const body = await readBody(req); return json(res, 200, await resetAccountPassword(String(body.email || '').trim(), String(body.code || ''), String(body.newPassword || ''))); }
    catch (error) { return json(res, error.status || 400, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/logout' && req.method === 'POST') {
    const account = logoutAccount();
    emit('account_updated', { account });
    return json(res, 200, account);
  }
  if (pathname === '/api/account/refresh' && req.method === 'POST') {
    try {
      const account = await refreshAccount();
      emit('account_updated', { account });
      return json(res, 200, account);
    } catch (error) {
      return json(res, error.status === 401 || error.status === 403 ? error.status : 502, { error: error.message, code: error.code });
    }
  }
  if (pathname === '/api/account/plugins' && req.method === 'GET') {
    try { return json(res, 200, { plugins: await listAccountPlugins() }); }
    catch (error) { return json(res, 502, { error: error.message }); }
  }
  if ((match = m(/^\/api\/account\/plugins\/([^/]+)\/install$/)) && req.method === 'POST') {
    try {
      const body = await readBody(req);
      return json(res, 200, await installAccountPlugin(decodeURIComponent(match[1]), body.sha256));
    } catch (error) { return json(res, error.status || 502, { error: error.message }); }
  }
  if (pathname === '/api/account/nickname' && req.method === 'PUT') {
    try {
      const body = await readBody(req);
      return json(res, 200, await updateAccountNickname(body.nickname));
    } catch (error) {
      return json(res, [400, 401, 403].includes(error.status) ? error.status : 502, { error: error.message, code: error.code });
    }
  }
  if (pathname === '/api/account/packages' && req.method === 'GET') {
    try { return json(res, 200, await listPurchasePackages()); }
    catch (error) { return json(res, 502, { error: error.message }); }
  }
  if (pathname === '/api/account/orders' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      return json(res, 200, await createPurchaseOrder(body.packageId, body.payType, body.wallet || 'magic'));
    } catch (error) { return json(res, error.status === 400 || error.status === 401 ? error.status : 502, { error: error.message }); }
  }
  if ((match = m(/^\/api\/account\/orders\/([A-Za-z0-9-]+)$/)) && req.method === 'GET') {
    try { return json(res, 200, await queryPurchaseOrder(match[1])); }
    catch (error) { return json(res, error.status === 400 || error.status === 401 || error.status === 404 ? error.status : 502, { error: error.message }); }
  }
  if (pathname === '/api/workspaces' && req.method === 'GET') return json(res, 200, { workspaces: listWorkspaces(), active: getWorkspaceRoot() });
  if (pathname === '/api/workspaces' && req.method === 'POST') {
    const body = await readBody(req); const item = addWorkspace(body); setWorkspaceRoot(item.path); cfg.security.workspaceRoot = item.path; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg); emit('workspace_changed', { workspace: item }); return json(res, 200, { workspace: item, workspaces: listWorkspaces() });
  }
  if ((match = m(/^\/api\/workspaces\/([\w-]+)\/activate$/)) && req.method === 'POST') {
    const item = setActiveWorkspace(match[1]); setWorkspaceRoot(item.path); cfg.security.workspaceRoot = item.path; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg); emit('workspace_changed', { workspace: item }); return json(res, 200, { workspace: item, workspaces: listWorkspaces() });
  }
  if ((match = m(/^\/api\/workspaces\/([\w-]+)$/)) && req.method === 'DELETE') { removeWorkspace(match[1]); return json(res, 200, { ok: true, workspaces: listWorkspaces() }); }
  if (pathname === '/api/files' && req.method === 'GET') return json(res, 200, listDirectory(url.searchParams.get('path') || ''));
  if (pathname === '/api/terminal/run' && req.method === 'POST') {
    try { return json(res, 200, startTerminalRun((await readBody(req)).command)); }
    catch (error) { return json(res, 400, { error: error.message, code: 'TERMINAL_COMMAND_REJECTED' }); }
  }
  if ((match = m(/^\/api\/terminal\/([\w-]+)\/stop$/)) && req.method === 'POST') return json(res, 200, { ok: stopTerminalRun(match[1]) });
  if ((match = m(/^\/api\/terminal\/([\w-]+)$/)) && req.method === 'GET') {
    const run = terminalRuns.get(match[1]);
    if (!run) return notFound(res, '终端任务不存在或已过期');
    return json(res, 200, { terminalId: run.id, command: run.command, cwd: run.cwd, status: run.status, output: run.output, startedAt: run.startedAt });
  }
  if (pathname === '/api/assets' && req.method === 'GET') return json(res, 200, { assets: listAssets() });
  if (pathname === '/api/assets' && req.method === 'POST') { const body = await readBody(req); return json(res, 200, { asset: addAsset({ ...body, source: body.source || 'user' }) }); }
  if ((match = m(/^\/api\/assets\/([\w-]+)$/)) && req.method === 'DELETE') return json(res, 200, { asset: deleteAsset(match[1]) });
  if ((match = m(/^\/api\/assets\/([\w-]+)\/raw$/)) && req.method === 'GET') {
    const asset = assetFile(match[1]); res.writeHead(200, { 'content-type': asset.item.mime, 'content-length': fs.statSync(asset.path).size, 'cache-control': 'private, max-age=3600' }); fs.createReadStream(asset.path).pipe(res); return true;
  }
  if (pathname === '/api/file' && req.method === 'GET') return json(res, 200, readWorkspaceFile(url.searchParams.get('path') || ''));
  if (pathname === '/api/file/meta' && req.method === 'GET') {
    const file = rawWorkspaceFile(url.searchParams.get('path') || '');
    return json(res, 200, { path: file.relative, name: path.basename(file.abs), kind: file.kind, size: file.stat.size });
  }
  if (pathname === '/api/file/raw' && req.method === 'GET') {
    const file = rawWorkspaceFile(url.searchParams.get('path') || '');
    const html = /\.html?$/i.test(file.abs);
    res.writeHead(200, {
      'content-type': html ? 'text/html; charset=utf-8' : file.mime,
      'content-length': file.stat.size,
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(file.abs))}`,
      'cache-control': 'no-store',
      ...(html ? { 'content-security-policy': 'sandbox allow-scripts allow-forms' } : {}),
    });
    fs.createReadStream(file.abs).pipe(res);
    return true;
  }
  if (pathname === '/api/file/office-preview' && req.method === 'GET') {
    const file = rawWorkspaceFile(url.searchParams.get('path') || '');
    const ext = path.extname(file.abs).toLowerCase();
    if (!['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) return badRequest(res, '仅支持 Word、Excel 和 PowerPoint 文件');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-office-preview-'));
    const output = path.join(tempDir, 'preview.pdf');
    try {
      await convertOfficeFile(file.abs, output, 'pdf');
      const stat = fs.statSync(output);
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': stat.size, 'content-disposition': 'inline', 'cache-control': 'no-store' });
      const stream = fs.createReadStream(output);
      const cleanup = () => { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} };
      stream.once('close', cleanup);
      stream.once('error', cleanup);
      stream.pipe(res);
      return true;
    } catch (error) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      return json(res, 422, { error: error.message, code: 'OFFICE_PREVIEW_UNAVAILABLE' });
    }
  }
  if (pathname === '/api/file/write' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, { file: writeWorkspaceFile(body.path, body.content) });
  }
  if (pathname === '/api/file/create' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, { item: createWorkspaceItem(body.parent || '', body.name, body.type) });
  }
  if (pathname === '/api/file/rename' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, { item: renameWorkspaceItem(body.path, body.name) });
  }
  if (pathname === '/api/file/move' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, { item: moveWorkspaceItem(body.path, body.target || '') });
  }
  if (pathname === '/api/file/copy' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, { item: copyWorkspaceItem(body.path, body.target || '') });
  }
  if (pathname === '/api/file/delete' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, { item: deleteWorkspaceItem(body.path) });
  }
  if (pathname === '/api/file/reveal' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, revealWorkspaceItem(body.path));
  }
  if (pathname === '/api/file/open' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, openWorkspaceItem(body.path));
  }
  if (pathname === '/api/permissions' && req.method === 'GET') return json(res, 200, { allow: listPersistentRules() });
  if (pathname === '/api/permissions' && req.method === 'POST') return json(res, 200, { allow: replacePersistentRules((await readBody(req)).allow) });
  if (pathname === '/api/logs' && req.method === 'GET') {
    return json(res, 200, queryApiLogs({
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset'),
      sessionId: url.searchParams.get('sessionId') || undefined,
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      model: url.searchParams.get('model') || undefined,
      summary: url.searchParams.get('summary') !== '0',
    }));
  }
  if ((match = m(/^\/api\/logs\/([\w-]+)$/)) && req.method === 'GET') {
    const log = getApiLog(match[1]);
    return log ? json(res, 200, { log }) : notFound(res, '调用记录不存在');
  }
  if (pathname === '/api/settings' && req.method === 'GET') {
    return json(res, 200, publicSettings());
  }
  if (pathname === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req);
    const info = applyProviderPatch(body);
    saveConfigFile(CONFIG_FILE);
    setLoopConfig(getConfig());
    emit('settings_updated', { provider: runtimeInfo().provider });
    return json(res, 200, { ok: true, ...info });
  }
  if (pathname === '/api/settings/models' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const r = await listRemoteModels({
        providerId: body.providerId,
        baseUrl: body.baseUrl,
        apiKey: body.apiKey || undefined,
        protocol: body.protocol,
      });
      return json(res, 200, r);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if (pathname === '/api/settings/test' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const r = await testProvider({
        providerId: body.providerId,
        baseUrl: body.baseUrl,
        model: body.model,
        apiKey: body.apiKey || undefined,
        protocol: body.protocol,
      });
      return json(res, 200, r);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if (pathname === '/api/sessions') {
    return json(res, 200, { sessions: Session.list() });
  }
  if (pathname === '/api/session' && req.method === 'POST') {
    const body = await readBody(req);
    const s = Session.create(body.title ?? '新会话');
    emit('session_created', { sessionId: s.id, title: s.title });
    return json(res, 200, { id: s.id, title: s.title });
  }

  if ((match = m(/^\/api\/session\/([\w-]+)$/))) {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (req.method === 'GET') return json(res, 200, { ...s.snapshot(cfg.provider?.contextWindow ?? 128000), queue: s.queued(), running: isRunning(s.id), permission: pendingRequest(s.id) });
    if (req.method === 'DELETE') {
      if (isRunning(s.id)) return json(res, 409, { error: '会话正在运行中，停止后才能删除' });
      Session.remove(s.id);
      emit('session_deleted', { sessionId: s.id });
      return json(res, 200, { ok: true });
    }
    return notFound(res);
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/message$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const body = await readBody(req);
    if (!body.text?.trim() && !body.attachments?.length) return badRequest(res, '消息或图片不能为空');
    if (isRunning(s.id) || activeSequences.has(s.id)) return json(res, 409, { error: '会话正在运行中' });
    const managed = runtimeInfo().provider?.providerId === 'mli-managed';
    if (managed) {
      try { await requireAccount(); } catch (error) { return json(res, error.status || 401, { error: error.message, code: 'ACCOUNT_REQUIRED' }); }
    }
    if (s.title === '新会话') s.setTitle(String(body.text || '').trim().slice(0, 40) || '图片任务');
    runSequence(s, String(body.text || '').trim(), body.attachments || [], { clientMessageId: body.clientMessageId }).catch((e) => emit('error', { sessionId: s.id, message: e.message, details: { stage: 'turn_start', name: e.name || 'Error', message: e.message, stack: e.stack || '' } }));
    return json(res, 202, { ok: true, running: true });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/queue$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const body = await readBody(req);
    if (!String(body.text || '').trim() && !body.attachments?.length) return badRequest(res, '消息或图片不能为空');
    if (!isRunning(s.id) && !activeSequences.has(s.id)) return json(res, 409, { error: '会话未运行，请直接发送消息' });
    const entry = s.enqueue(body.text, body.attachments || [], body.mode);
    emit('queue_updated', { sessionId: s.id, queue: s.queued() });
    return json(res, 202, { queue: s.queued(), entry });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/queue\/([\w-]+)$/)) && req.method === 'DELETE') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const entry = s.removeQueued(match[2]);
    if (!entry) return notFound(res, '排队消息不存在');
    emit('queue_updated', { sessionId: s.id, queue: s.queued() });
    return json(res, 200, { entry, queue: s.queued() });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/queue\/([\w-]+)\/adjust$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (!isRunning(s.id)) return json(res, 409, { error: '会话未运行，无法调整当前任务' });
    if (!s.adjustQueued(match[2])) return notFound(res, '排队消息不存在');
    emit('queue_updated', { sessionId: s.id, queue: s.queued() });
    return json(res, 200, { queue: s.queued() });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/attachment\/([\w-]+)$/)) && req.method === 'GET') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const item = s.attachment(match[2]); if (!item) return notFound(res, '附件不存在');
    res.writeHead(200, { 'content-type': item.mime, 'content-length': fs.statSync(item.path).size, 'cache-control': 'private, max-age=3600' }); fs.createReadStream(item.path).pipe(res); return true;
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/attachment\/([\w-]+)\/asset$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const media = s.attachment(match[2]); if (!media) return notFound(res, '附件不存在');
    const body = await readBody(req); return json(res, 200, { asset: addAssetFromFile(media.path, { title: body.title || media.name, source: 'conversation', metadata: { sessionId: s.id, attachmentId: media.attachmentId } }) });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/abort$/)) && req.method === 'POST') {
    return json(res, 200, { ok: abortRun(match[1]) });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/permission\/([\w-]+)$/)) && req.method === 'POST') {
    const body = await readBody(req);
    const ok = resolveRequest(match[2], body.decision, match[1]);
    return ok ? json(res, 200, { ok: true }) : notFound(res, '权限请求不存在或已处理');
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/ui\/([\w-]+)$/)) && req.method === 'POST') {
    const body = await readBody(req);
    const ok = resolveUiRequest(match[2], body.value);
    return ok ? json(res, 200, { ok: true }) : notFound(res, 'UI 请求不存在或已处理');
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/mode$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const body = await readBody(req);
    const mode = ['default', 'auto-all'].includes(body.mode) ? body.mode : 'default';
    s.setMode(mode);
    emit('session_updated', { sessionId: s.id, mode });
    return json(res, 200, { mode });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/desktop$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const body = await readBody(req);
    const enabled = s.setDesktopEnabled(!!body.enabled);
    emit('session_updated', { sessionId: s.id, desktopEnabled: enabled });
    return json(res, 200, { desktopEnabled: enabled });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/expert$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (isRunning(s.id)) return json(res, 409, { error: '会话运行中，不能切换专家' });
    const body = await readBody(req);
    const expert = body.expertId ? getExpert(body.expertId) : null;
    if (body.expertId && !expert) return badRequest(res, '专家不存在');
    const value = s.setExpert(expert?.id || '', expert?.prompt || '');
    emit('session_updated', { sessionId: s.id, ...value });
    return json(res, 200, value);
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/workspace$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (isRunning(s.id)) return json(res, 409, { error: '会话运行中，不能修改工作目录' });
    const body = await readBody(req);
    const item = addWorkspace(body, { activate: false });
    s.moveToWorkspace(item.path);
    setActiveWorkspace(item.id);
    setWorkspaceRoot(item.path);
    cfg.security.workspaceRoot = item.path;
    saveConfigFile(CONFIG_FILE);
    setLoopConfig(cfg);
    emit('session_workspace_changed', { sessionId: s.id, workspace: item });
    return json(res, 200, { sessionId: s.id, workspace: item, workspaces: listWorkspaces() });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/compact$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const r = await maybeCompact(s, { contextWindow: cfg.provider?.contextWindow ?? 128000, compactAtPercent: cfg.agent?.compactAtPercent ?? 75 }, { force: true });
    return json(res, 200, r);
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/fork$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const ns = s.fork();
    emit('session_created', { sessionId: ns.id, title: ns.title });
    return json(res, 200, { id: ns.id, title: ns.title });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/title$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const body = await readBody(req);
    s.setTitle(String(body.title ?? '').slice(0, 60) || '新会话');
    emit('session_updated', { sessionId: s.id });
    return json(res, 200, { ok: true });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/dev-tool$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const body = await readBody(req);
    try {
      const r = await runDevTool(s, body.tool, body.args ?? {});
      return json(res, 200, r);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if (pathname === '/api/plugins/reload' && req.method === 'POST') {
    const info = await loadAll({ reload: true });
    emit('plugins_reloaded', {});
    return json(res, 200, info);
  }
  return null; // 未匹配 API
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? HOST}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await route(req, res, url);
      if (!res.headersSent) notFound(res);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    if (!res.writableEnded) json(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  if (process.send) process.send({ type: 'mli-ready', port: address.port, pid: process.pid });
  const info = runtimeInfo();
  console.log(`\n  MLI Agent 已启动  →  http://${HOST}:${address.port}\n`);
  console.log(`  模型:  ${info.provider.protocol} / ${info.provider.model}${info.provider.hasKey ? '' : '  ⚠ 未配置 API Key（请在「模型」页面配置服务商凭据）'}`);
  console.log(`  工作区: ${getWorkspaceRoot()}`);
  console.log(`  工具:  ${info.tools.map((t) => `${t.name}[${t.permission}]`).join('  ')}\n`);
});
