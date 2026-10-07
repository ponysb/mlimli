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
import { setLoopConfig, runTurn, abortRun, isRunning, runningStep, runDevTool, runtimeInfo, Session } from './core/loop.mjs';
import { onEvent, emit, eventSequence } from './core/events.mjs';
import { setWorkspaceRoot, APP_ROOT, DATA_ROOT, getWorkspaceRoot, isWorkspaceRoot } from './core/paths.mjs';
import { uiPreferences, updateUiPreferences } from './core/ui-preferences.mjs';
import { listWorkspaces, addWorkspace, setActiveWorkspace, removeWorkspace, ensureWorkspace } from './core/workspaces.mjs';
import { listWorkspaceReferences } from './core/workspace-reference-files.mjs';
import { loadAll, pluginsInfo, resolveUiRequest, getCommands, setPlatformSkills } from './core/plugins.mjs';
import { resolveRequest, listPersistentRules, replacePersistentRules, pendingRequest } from './core/permissions.mjs';
import { maybeCompact } from './core/compact.mjs';
import { disposeLogReader, getApiLogAsync, queryApiLogsAsync } from './core/api-log-service.mjs';
import { disposeSessionReader, readSessionView } from './core/session-view-service.mjs';
import { copyWorkspaceItem, createWorkspaceItem, deleteWorkspaceItem, listDirectory, moveWorkspaceItem, openWorkspaceItem, rawWorkspaceFile, readWorkspaceFile, renameWorkspaceItem, revealWorkspaceItem, writeWorkspaceFile } from './core/workspace-files.mjs';
import { addAsset, addAssetFromFile, assetFile, deleteAsset, listAssets } from './core/assets.mjs';
import { checkAccountEmail, createPurchaseOrder, getAccountCaptcha, listPurchasePackages, listPlatformLibrary, listAccountPlugins, installAccountPlugin, loginAccount, logoutAccount, publicAccountStatus, queryPurchaseOrder, refreshAccount, registerAccount, requireAccount, resetAccountPassword, sendRegisterCode, sendResetCode, setAccountConfig, updateAccountNickname, verifyAccountCaptcha } from './core/account.mjs';
import { getMarketingConfig, getMarketingSummary, claimDailyCheckin } from './core/account.mjs';
import { DENY_PATTERNS } from './core/tools.mjs';
import { listExperts, getExpert, saveExpert, deleteExpert, setPlatformExperts } from './core/experts.mjs';
import { saveLocalSkill, deleteLocalSkill, listLocalSkills } from './core/local-skills.mjs';
import { convertOfficeFile } from './plugins/office/plugin.mjs';
import { CONFIG_FILE, initializeRuntime, activeSequences, runningSessions, runSequence, prepareTaskResume, assertWorkspaceIdle, stopSession, shutdownRuntime, scheduler } from './core/runtime.mjs';
import { pendingUiRequests } from './core/plugins.mjs';
import { agentManager } from './core/agent-manager.mjs';
import { agentProfiles } from './core/agent-profiles.mjs';
import { contextForSession } from './core/runtime.mjs';
import { withRunContext } from './core/run-context.mjs';
import { approveMemory, deleteMemory, getMemory, listMemories, memoryLocations, restoreMemory, saveMemory } from './core/memory.mjs';
import { memorySettings, updateMemorySettings } from './core/memory-policy.mjs';
import { memoryLearner } from './core/memory-learning.mjs';
import { stopProcessTree } from './core/process-tree.mjs';
import { sandboxStatus, updateSandbox, hasActiveSandboxCommands } from './core/sandbox.mjs';
import { speechRoute, shutdownSpeech, listMeetings } from './core/speech.mjs';
import { appCenter } from './core/app-center.mjs';
import { appCenterRoute } from './core/app-center-http.mjs';
import { listChannels, channelEvents, channelAdapters, upsertChannel, removeChannel, connectChannel, disconnectChannel, disconnectAll as disconnectChannels, handleIncoming, initializeChannels } from './core/channels.mjs';

const cfg = await initializeRuntime();
appCenter();

const PORT = Number(process.env.MLI_AGENT_PORT || cfg.server?.port || 3000);
const HOST = process.env.MLI_AGENT_HOST || cfg.server?.host || '127.0.0.1';
const terminalRuns = new Map();
const runtimeHost = globalThis.mliRuntimeHost;
const leases = new Map();
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  disposeLogReader();
  disposeSessionReader();
  shutdownSpeech();
  appCenter().shutdown();
  const sandboxCleanup = shutdownRuntime();
  for (const id of terminalRuns.keys()) stopTerminalRun(id);
  for (const response of sseClients) response.end();
  server.close(() => Promise.resolve(sandboxCleanup).finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 15000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
if (runtimeHost) {
  const started = Date.now();
  setInterval(() => {
    for (const [id, touched] of leases) if (Date.now() - touched > 90000) leases.delete(id);
    if (!leases.size && Date.now() - started > 90000) shutdown();
  }, 15000).unref();
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
      : spawn('/bin/sh', ['-lc', value], { cwd, detached: true });
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
  stopProcessTree(run.child, 'SIGINT');
  setTimeout(() => stopProcessTree(run.child, 'SIGKILL'), 750).unref();
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

function registeredWorkspace(workspacePath) {
  const target = path.resolve(workspacePath);
  return listWorkspaces().some((item) => {
    const candidate = path.resolve(item.path);
    return process.platform === 'win32' ? candidate.toLowerCase() === target.toLowerCase() : candidate === target;
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.woff2': 'font/woff2',
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
  if (await appCenterRoute(req, res, url, { json, readBody, stopSession })) return true;
  if (await speechRoute(req, res, url, { json, readBody, summarize: async (meeting, { prompt, transcript }) => {
    if (meeting.summarySessionId) return { sessionId: meeting.summarySessionId };
    if (runtimeInfo().provider?.providerId === 'mli-managed') await requireAccount();
    const session = Session.create(`${meeting.title} · 会议纪要`);
    session.append({ type: 'state', meetingId: meeting.id });
    session.setExpert('meeting-secretary', '你是会议记录专家。仅根据提供的会议逐字稿整理纪要，准确区分已决事项、建议和待确认事项。');
    const savedAttachments = session.saveAttachments([{ name: '会议逐字稿.txt', dataUrl: `data:text/plain;base64,${Buffer.from(transcript).toString('base64')}` }]);
    emit('session_created', { sessionId: session.id, title: session.title });
    runSequence(session, prompt, [], { savedAttachments }).catch(error => emit('error', { sessionId: session.id, message: error.message }));
    return { sessionId: session.id };
  } })) return;
  const { pathname } = url;
  const m = (re) => pathname.match(re);
  let match;

  if (pathname === '/api/runtime') return json(res, 200, { pid: process.pid, instance: runtimeHost?.instance, dataRoot: DATA_ROOT, workspace: getWorkspaceRoot() });
  if (pathname === '/api/runtime/prepare-update' && req.method === 'POST') {
    const body = await readBody(req);
    if (!runtimeHost || body.instance !== runtimeHost.instance || !leases.has(body.id)) return json(res, 409, { error: '运行时标识不匹配，请重新打开应用' });
    for (const [id, touched] of leases) if (Date.now() - touched > 90000) leases.delete(id);
    if (leases.size !== 1 || !leases.has(body.id)) return json(res, 409, { error: '请先退出使用此应用的其他终端或客户端，再重启更新' });
    if (activeSequences.size || [...terminalRuns.values()].some(run => ['starting', 'running'].includes(run.status))) return json(res, 409, { error: '任务或终端命令正在运行，请等待完成或停止后再重启更新' });
    json(res, 200, { ok: true });
    shutdown();
    return;
  }
  if (pathname === '/api/runtime/lease' && req.method === 'POST') {
    const body = await readBody(req);
    if (!runtimeHost || body.instance !== runtimeHost.instance || !/^[\w-]{16,80}$/.test(body.id || '')) return json(res, 409, { error: '运行时标识不匹配' });
    if (body.release) {
      const existed = leases.delete(body.id);
      json(res, 200, { ok: true, remaining: leases.size });
      if (existed && !leases.size) setImmediate(() => { if (!leases.size) shutdown(); });
      return;
    }
    if (shuttingDown) return json(res, 503, { error: '运行时正在关闭' });
    leases.set(body.id, Date.now());
    return json(res, 200, { ok: true });
  }
  const clientWorkspace = req.headers['x-mli-workspace'];
  if (clientWorkspace && !isWorkspaceRoot(String(clientWorkspace))) return json(res, 409, { error: '工作目录已被其他客户端切换，请重新连接当前项目', code: 'WORKSPACE_CHANGED' });

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
    return json(res, 200, { ...runtimeInfo(), ...publicSettings(), account: publicAccountStatus(), uiPreferences: uiPreferences(), subagentsEnabled: cfg.agent?.subagents?.enabled !== false, plugins: pluginsInfo(), commands: getCommands(), experts: listExperts(), localSkills: listLocalSkills(), workspace: getWorkspaceRoot(), workspaces: listWorkspaces(), channels: listChannels(), channelAdapters: channelAdapters() });
  }
  if (pathname === '/api/channels' && req.method === 'GET') return json(res, 200, { channels: listChannels(), adapters: channelAdapters(), events: channelEvents() });
  if (pathname === '/api/channels' && req.method === 'POST') {
    try { const body = await readBody(req); return json(res, 201, { channel: upsertChannel(body) }); }
    catch (error) { return badRequest(res, error.message); }
  }
  if ((match = m(/^\/api\/channels\/([\w-]+)$/)) && req.method === 'PATCH') {
    try { const body = await readBody(req); await disconnectChannel(match[1]); return json(res, 200, { channel: upsertChannel({ ...body, id: match[1] }) }); }
    catch (error) { return badRequest(res, error.message); }
  }
  if ((match = m(/^\/api\/channels\/([\w-]+)$/)) && req.method === 'DELETE') {
    try { return json(res, 200, { ok: await removeChannel(match[1]) }); } catch (error) { return badRequest(res, error.message); }
  }
  if ((match = m(/^\/api\/channels\/([\w-]+)\/(connect|disconnect)$/)) && req.method === 'POST') {
    try { const channel = match[2] === 'connect' ? await connectChannel(match[1]) : (await disconnectChannel(match[1]), listChannels().find((item) => item.id === match[1])); return json(res, 200, { channel }); }
    catch (error) { return json(res, 502, { error: error.message }); }
  }
  if ((match = m(/^\/api\/channels\/([\w-]+)\/test$/)) && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = await handleIncoming(match[1], { id: `test-${crypto.randomUUID()}`, senderId: String(body.senderId || 'test-user'), chatId: String(body.chatId || 'test-chat'), text: String(body.text || ''), isGroup: !!body.isGroup, mentionedBot: body.mentionedBot !== false, replyTarget: { test: true } });
      return json(res, 202, result);
    } catch (error) { return json(res, 400, { error: error.message }); }
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
  if (pathname === '/api/account/check-email' && req.method === 'POST') {
    try { return json(res, 200, await checkAccountEmail(String((await readBody(req)).email || '').trim())); }
    catch (error) { return json(res, error.status || 400, { error: error.message, code: error.code }); }
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
    try { const body = await readBody(req); return json(res, 201, await registerAccount(String(body.email || '').trim(), String(body.password || ''), String(body.code || ''), String(body.inviteCode || ''))); }
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
  if (pathname === '/api/account/marketing/config' && req.method === 'GET') {
    try { return json(res, 200, await getMarketingConfig()); }
    catch (error) { return json(res, error.status || 502, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/marketing/summary' && req.method === 'GET') {
    try { return json(res, 200, await getMarketingSummary()); }
    catch (error) { return json(res, error.status || 502, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/marketing/checkin' && req.method === 'POST') {
    try { return json(res, 200, await claimDailyCheckin()); }
    catch (error) { return json(res, error.status || 502, { error: error.message, code: error.code }); }
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
    assertWorkspaceIdle();
    const body = await readBody(req); const item = addWorkspace(body); setWorkspaceRoot(item.path); cfg.security.workspaceRoot = item.path; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg); emit('workspace_changed', { workspace: item }); return json(res, 200, { workspace: item, workspaces: listWorkspaces() });
  }
  if ((match = m(/^\/api\/workspaces\/([\w-]+)\/activate$/)) && req.method === 'POST') {
    assertWorkspaceIdle();
    const item = setActiveWorkspace(match[1]); setWorkspaceRoot(item.path); cfg.security.workspaceRoot = item.path; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg); emit('workspace_changed', { workspace: item }); return json(res, 200, { workspace: item, workspaces: listWorkspaces() });
  }
  if ((match = m(/^\/api\/workspaces\/([\w-]+)$/)) && req.method === 'DELETE') {
    const target = listWorkspaces().find((item) => item.id === match[1]);
    if (!target) return json(res, 404, { error: '工作目录不存在' });
    if (target.active) {
      assertWorkspaceIdle();
      const next = listWorkspaces().find((item) => item.id !== target.id);
      const root = next?.path || path.join(DATA_ROOT, 'workspace');
      setWorkspaceRoot(root);
      cfg.security.workspaceRoot = root; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg);
      removeWorkspace(target.id);
      if (next) setActiveWorkspace(next.id);
      emit('workspace_changed', { workspace: next || null });
    } else {
      removeWorkspace(target.id);
      emit('workspace_removed', { workspaceId: target.id });
    }
    return json(res, 200, { ok: true, workspaces: listWorkspaces() });
  }
  if (pathname === '/api/files' && req.method === 'GET') return json(res, 200, listDirectory(url.searchParams.get('path') || ''));
  if (pathname === '/api/files/references' && req.method === 'GET') return json(res, 200, await listWorkspaceReferences({ query: url.searchParams.get('query') || '', limit: url.searchParams.get('limit') }));
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
  if (pathname.startsWith('/api/file/raw/') && req.method === 'GET') {
    const file = rawWorkspaceFile(decodeURIComponent(pathname.slice('/api/file/raw/'.length)));
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
  if (pathname === '/api/sandbox' && req.method === 'GET') return json(res, 200, await sandboxStatus());
  // Readiness only: system installation is available exclusively through desktop IPC.
  if (pathname === '/api/sandbox/install-preflight' && req.method === 'POST') {
    if(activeSequences.size || agentManager.hasPending() || hasActiveSandboxCommands() || [...terminalRuns.values()].some(run=>['starting','running'].includes(run.status)))return json(res,409,{error:'任务或终端命令正在运行，请停止或完成后再安装沙箱'});
    return json(res,200,{ok:true});
  }
  if (pathname === '/api/sandbox' && req.method === 'POST') {
    assertWorkspaceIdle();
    const body = await readBody(req);
    try {
      const policy = updateSandbox(body);
      const status = await sandboxStatus({ policy });
      emit('sandbox_updated', status);
      return json(res, 200, status);
    } catch (error) { return badRequest(res, error.message); }
  }
  if (pathname === '/api/permissions' && req.method === 'POST') return json(res, 200, { allow: replacePersistentRules((await readBody(req)).allow) });
  if (pathname === '/api/logs' && req.method === 'GET') {
    return json(res, 200, await queryApiLogsAsync({
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
    const log = await getApiLogAsync(match[1]);
    return log ? json(res, 200, { log }) : notFound(res, '调用记录不存在');
  }
  if (pathname === '/api/settings' && req.method === 'GET') {
    return json(res, 200, publicSettings());
  }
  if (pathname === '/api/ui/preferences' && req.method === 'POST') {
    const body = await readBody(req);
    if (!['default', 'auto-all'].includes(body.defaultPermissionMode)) return badRequest(res, '无效权限模式');
    return json(res, 200, updateUiPreferences(body));
  }
  if (pathname === '/api/memory/settings' && req.method === 'GET') return json(res, 200, { settings: memorySettings() });
  if (pathname === '/api/memory/settings' && req.method === 'POST') {
    const body = await readBody(req), previous = getConfig().memory;
    try {
      const settings = updateMemorySettings(body);
      try { saveConfigFile(CONFIG_FILE); } catch (error) { getConfig().memory = previous; throw error; }
      if (!settings.enabled || !settings.autoLearn) memoryLearner.cancel();
      emit('memory_settings_updated', { settings });
      return json(res, 200, { settings });
    } catch (error) { return json(res, error.status || 400, { error: error.message }); }
  }
  if (pathname === '/api/memory/learning' && req.method === 'GET') return json(res, 200, { jobs: memoryLearner.status() });
  if (pathname === '/api/memories') {
    if (req.method === 'GET') {
      const scope = url.searchParams.get('scope') || 'all', status = url.searchParams.get('status') || 'all', kind = url.searchParams.get('kind') || 'all';
      if (!['all', 'global', 'project'].includes(scope) || !['all', 'active', 'pending', 'archived'].includes(status) || !['all', 'preference', 'fact', 'lesson', 'workflow'].includes(kind)) return badRequest(res, '无效记忆筛选条件');
      const all = listMemories({ scope: 'all' }), items = listMemories({ scope, status, kind, query: url.searchParams.get('query') || '' });
      return json(res, 200, { items: items.map(({ history, ...item }) => item), settings: memorySettings(), stats: { global: all.filter(item => item.scope === 'global').length, project: all.filter(item => item.scope === 'project').length, pending: all.filter(item => item.status === 'pending').length, active: all.filter(item => item.status === 'active').length, total: all.length, recalled: all.reduce((sum, item) => sum + item.useCount, 0) }, locations: memoryLocations() });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.id) return badRequest(res, '新增记忆不能包含已有 ID');
      try { const item = saveMemory({ title: body.title, content: body.content, scope: body.scope, kind: body.kind, tags: body.tags, pinned: body.pinned, evidence: body.evidence, status: 'active', source: 'user', confidence: 'user_confirmed' }); return json(res, 201, { item }); }
      catch (error) { return json(res, error.status || 400, { error: error.message }); }
    }
  }
  if ((match = m(/^\/api\/memories\/(global|project)\/([\w-]+)(?:\/(approve|restore))?$/))) {
    const [, scope, id, action] = match;
    if (req.method === 'GET' && !action) { const item = getMemory(id, scope); return item ? json(res, 200, { item }) : notFound(res, '记忆不存在'); }
    if (['PUT', 'DELETE', 'POST'].includes(req.method)) {
      const body = await readBody(req);
      if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 1) return badRequest(res, '请提供读取时的记忆版本 expectedRevision');
      try {
        let item;
        if (req.method === 'DELETE' && !action) item = deleteMemory(id, scope, body.expectedRevision);
        else if (req.method === 'POST' && action === 'approve') item = approveMemory(id, scope, body.expectedRevision);
        else if (req.method === 'POST' && action === 'restore') item = restoreMemory(id, scope, body.revision, body.expectedRevision);
        else if (req.method === 'PUT' && !action) {
          const target = getMemory(id, scope); if (!target) return notFound(res, '记忆不存在');
          if (target.status === 'pending' && body.status === 'active') return badRequest(res, '待审核内容请使用审核入口启用');
          item = saveMemory({ id, scope, expectedRevision: body.expectedRevision, title: body.title, content: body.content, kind: body.kind, tags: body.tags, pinned: body.pinned, status: body.status, evidence: body.evidence, source: 'user', confidence: 'user_confirmed' });
        } else return notFound(res);
        return json(res, 200, { item });
      } catch (error) { return json(res, error.status || 400, { error: error.message }); }
    }
  }
  if (pathname === '/api/settings' && req.method === 'POST') {
    assertWorkspaceIdle();
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
    const sessions = Session.list().map((session) => ({
      ...session,
      running: isRunning(session.id) || activeSequences.has(session.id),
    }));
    return json(res, 200, { sessions });
  }
  if (pathname === '/api/schedules' && req.method === 'GET') {
    return json(res, 200, { tasks: scheduler.list(), runs: scheduler.runs() });
  }
  if (pathname === '/api/schedules' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const workspacePath = body.workspacePath || getWorkspaceRoot();
      if (!registeredWorkspace(workspacePath)) return json(res, 400, { error: '请选择已登记的工作空间' });
      const task = scheduler.create({ ...body, workspacePath });
      return json(res, 201, { task });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if ((match = m(/^\/api\/schedules\/([\w-]+)$/)) && (req.method === 'PATCH' || req.method === 'POST')) {
    const body = await readBody(req);
    try {
      if (body.workspacePath && !registeredWorkspace(body.workspacePath)) return json(res, 400, { error: '请选择已登记的工作空间' });
      const task = scheduler.update(match[1], body);
      return task ? json(res, 200, { task }) : notFound(res, '定时任务不存在');
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if ((match = m(/^\/api\/schedules\/([\w-]+)$/)) && req.method === 'DELETE') {
    return scheduler.remove(match[1]) ? json(res, 200, { ok: true }) : notFound(res, '定时任务不存在');
  }
  if ((match = m(/^\/api\/schedules\/([\w-]+)\/run$/)) && req.method === 'POST') {
    const task = scheduler.list().find((item) => item.id === match[1]);
    if (!task) return notFound(res, '定时任务不存在');
    scheduler.runNow(match[1]).catch((error) => console.error(`[scheduler] 手动运行失败：${error.message}`));
    return json(res, 202, { accepted: true, taskId: task.id });
  }
  if (pathname === '/api/session' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.mode !== undefined && !['default', 'auto-all'].includes(body.mode)) return badRequest(res, '无效权限模式');
    const s = Session.create(body.title ?? '新会话');
    const mode = body.mode ?? uiPreferences().defaultPermissionMode;
    if (s.mode !== mode) s.setMode(mode);
    emit('session_created', { sessionId: s.id, title: s.title });
    return json(res, 200, { id: s.id, title: s.title });
  }

  if ((match = m(/^\/api\/session\/([\w-]+)\/entries\/(\d+)$/)) && req.method === 'DELETE') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (isRunning(s.id) || activeSequences.has(s.id) || agentManager.pending(s).length) return json(res, 409, { error: '任务或子任务正在运行，停止后才能删除消息' });
    if (s.parentSessionId) return json(res, 409, { error: '子会话作为任务证据保留，请在主会话管理消息' });
    try {
      const result = s.deleteEntry(Number(match[2]));
      emit('session_entries_deleted', { sessionId: s.id, ...result });
      return json(res, 200, result);
    } catch (error) { return badRequest(res, error.message); }
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/entries$/)) && req.method === 'GET') {
    const before = url.searchParams.get('before');
    if (before != null && !/^\d+$/.test(before)) return badRequest(res, '无效历史游标');
    const directory = runningSessions.get(match[1])?.directory;
    const page = await readSessionView(match[1], 'page', { limit: url.searchParams.get('limit') || 120, before }, directory);
    if (!page) return notFound(res, '会话不存在');
    return json(res, 200, page);
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/entries\/(\d+)(?:\/(media))?$/)) && req.method === 'GET') {
    const item = await readSessionView(match[1], match[3] ? 'media' : 'entry', { entryId: match[2], path: url.searchParams.get('path') }, runningSessions.get(match[1])?.directory);
    if (!item) return notFound(res, '记录不存在');
    if (!match[3]) return json(res, 200, { entry: item });
    const mime = /^(?:image\/(?:png|jpeg|webp|gif)|audio\/[\w.+-]+|video\/[\w.+-]+)$/.test(item.mime) ? item.mime : 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime, 'content-length': item.bytes.length, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=3600' });
    res.end(Buffer.from(item.bytes));
    return;
  }
  if ((match = m(/^\/api\/session\/([\w-]+)$/))) {
    const paged = req.method === 'GET' && (url.searchParams.has('limit') || url.searchParams.has('before'));
    if (paged && url.searchParams.has('before') && !/^\d+$/.test(url.searchParams.get('before'))) return badRequest(res, '无效历史游标');
    const s = paged ? (runningSessions.get(match[1]) || Session.loadLight(match[1])) : getSessionOr400(res, match[1]); if (!s) { if (paged) notFound(res, '会话不存在'); return; }
    if (req.method === 'GET') {
      const group = agentManager.view(s);
      const ids = [group.rootSessionId, s.id, ...group.tasks.map(task => task.sessionId)].filter((id, index, all) => all.indexOf(id) === index);
      const permissions = ids.map(pendingRequest).filter(Boolean);
      const contextWindow = agentManager.executionFor(s)?.context.modelSelection?.model?.contextWindow || cfg.provider?.contextWindow || 128000;
      const snapshot = paged ? await readSessionView(s.id, 'snapshot', { contextWindow, limit: url.searchParams.get('limit') || 120, before: url.searchParams.get('before') }, s.directory) : { ...s.snapshot(contextWindow), queue: s.queued() };
      if (!snapshot) return notFound(res, '会话不存在');
      if (!snapshot.meetingId && snapshot.expertId === 'meeting-secretary') snapshot.meetingId = listMeetings().find(meeting => meeting.summarySessionId === s.id)?.id || null;
      return json(res, 200, { ...snapshot, running: isRunning(s.id) || activeSequences.has(s.id), activeStep: runningStep(s.id), eventSeq: eventSequence(), group, permissions, permission: permissions[0] || null, uiRequests: ids.flatMap(pendingUiRequests) });
    }
    if (req.method === 'DELETE') {
      if (isRunning(s.id) || activeSequences.has(s.id) || agentManager.pending(s).length) return json(res, 409, { error: '任务或子任务正在运行，停止后才能删除' });
      if (s.parentSessionId) return json(res, 409, { error: '子会话作为主任务证据保留，请管理主任务' });
      Session.remove(s.id);
      emit('session_deleted', { sessionId: s.id });
      return json(res, 200, { ok: true });
    }
    return notFound(res);
  }
  if (pathname === '/api/agent-profiles' && req.method === 'GET') return json(res, 200, { enabled: cfg.agent?.subagents?.enabled !== false, profiles: agentProfiles(getConfig()).map(({ prompt, tools, ...profile }) => profile) });
  if ((match = m(/^\/api\/session\/([\w-]+)\/agents$/))) {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (req.method === 'GET') return json(res, 200, agentManager.view(s));
    if (req.method === 'POST') {
      if (s.parentSessionId) return badRequest(res, '请从主任务派发子 Agent');
      const body = await readBody(req), context = contextForSession(s);
      try {
        agentManager.begin(s, context);
        const tasks = await withRunContext(context, () => agentManager.spawn(s, body));
        if (!activeSequences.has(s.id)) runSequence(s, `[主任务协作汇总]\n用户已派发以下子任务，请等待并汇总结果、按目标检查证据和验收条件：\n${body.tasks.map(task => task.instruction).join('\n\n')}\n不要重复派发或重复执行子任务。`, [], { context }).catch(error => emit('error', { sessionId: s.id, message: error.message }));
        return json(res, 202, { tasks: tasks.map(({ instruction, ...task }) => task), group: agentManager.view(s) });
      } catch (error) { return badRequest(res, error.message); }
    }
    return notFound(res);
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/agents\/([\w-]+)\/(message|stop)$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (s.parentSessionId) return badRequest(res, '请从主任务管理子 Agent');
    if (!agentManager.view(s).tasks.some(task => task.agentId === match[2])) return notFound(res, 'Agent 不属于当前任务组');
    if (match[3] === 'stop') return json(res, 200, { stopped: agentManager.stop(match[2]) });
    const body = await readBody(req), context = contextForSession(s);
    try {
      const result = withRunContext(context, () => agentManager.send(s, { ...body, agentId: match[2] }));
      if (!activeSequences.has(s.id) && body.kind === 'follow_up') runSequence(s, `[主任务协作汇总]\n用户已对子任务追加要求：${body.text}\n请等待并汇总新的结果，检查证据和验收条件，不要重复执行子任务。`, [], { context }).catch(error => emit('error', { sessionId: s.id, message: error.message }));
      return json(res, 202, result);
    } catch (error) { return badRequest(res, error.message); }
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/resume$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const body = await readBody(req);
    if (!Number.isInteger(body.checkpointId)) return badRequest(res, '缺少有效检查点 ID');
    if (runtimeInfo().provider?.providerId === 'mli-managed') {
      try { await requireAccount(); } catch (error) { return json(res, error.status || 401, { error: error.message, code: 'ACCOUNT_REQUIRED' }); }
    }
    let options;
    try { options = prepareTaskResume(s, body.checkpointId); }
    catch (error) { return json(res, error.status || 409, { error: error.message }); }
    runSequence(s, options.goal, [], options).catch(error => emit('error', { sessionId: s.id, message: error.message }));
    return json(res, 202, { ok: true, running: true });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/message$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const body = await readBody(req);
    if (s.parentSessionId) return badRequest(res, '请通过主任务对子 Agent 追加指令');
    if (!body.text?.trim() && !body.attachments?.length) return badRequest(res, '消息或附件不能为空');
    if (isRunning(s.id) || activeSequences.has(s.id)) return json(res, 409, { error: '会话正在运行中' });
    const managed = runtimeInfo().provider?.providerId === 'mli-managed';
    if (managed) {
      try { await requireAccount(); } catch (error) { return json(res, error.status || 401, { error: error.message, code: 'ACCOUNT_REQUIRED' }); }
    }
    let savedAttachments;
    try { savedAttachments = s.saveAttachments(body.attachments || []); }
    catch (error) { return badRequest(res, error.message); }
    if (s.title === '新会话') s.setTitle(String(body.text || '').trim().slice(0, 40) || '附件任务');
    runSequence(s, String(body.text || '').trim(), [], { clientMessageId: body.clientMessageId, savedAttachments }).catch((e) => emit('error', { sessionId: s.id, message: e.message, details: { stage: 'turn_start', name: e.name || 'Error', message: e.message, stack: e.stack || '' } }));
    return json(res, 202, { ok: true, running: true });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/queue$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (s.parentSessionId) return badRequest(res, '请通过主任务对子 Agent 追加指令');
    const body = await readBody(req);
    if (!String(body.text || '').trim() && !body.attachments?.length) return badRequest(res, '消息或附件不能为空');
    if (!isRunning(s.id) && !activeSequences.has(s.id)) return json(res, 409, { error: '会话未运行，请直接发送消息' });
    let entry;
    try { entry = s.enqueue(body.text, body.attachments || [], body.mode); }
    catch (error) { return badRequest(res, error.message); }
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
    if (s.parentSessionId) return badRequest(res, '请通过主任务调整子 Agent');
    if (!isRunning(s.id)) return json(res, 409, { error: '会话未运行，无法调整当前任务' });
    if (!s.adjustQueued(match[2])) return notFound(res, '排队消息不存在');
    emit('queue_updated', { sessionId: s.id, queue: s.queued() });
    return json(res, 200, { queue: s.queued() });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/attachment\/([\w-]+)$/)) && req.method === 'GET') {
    const item = await readSessionView(match[1], 'attachment', { attachmentId: match[2] }, runningSessions.get(match[1])?.directory); if (!item) return notFound(res, '附件不存在');
    res.writeHead(200, { 'content-type': item.mime, 'content-length': fs.statSync(item.path).size, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-disposition': `${item.type === 'file' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(item.name)}` }); fs.createReadStream(item.path).pipe(res); return true;
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/attachment\/([\w-]+)\/asset$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    const media = s.attachment(match[2]); if (!media) return notFound(res, '附件不存在');
    const body = await readBody(req); return json(res, 200, { asset: addAssetFromFile(media.path, { title: body.title || media.name, source: 'conversation', metadata: { sessionId: s.id, attachmentId: media.attachmentId } }) });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/abort$/)) && req.method === 'POST') {
    return json(res, 200, { ok: stopSession(match[1]) });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/permission\/([\w-]+)$/)) && req.method === 'POST') {
    const body = await readBody(req);
    const ok = resolveRequest(match[2], body.decision, match[1]);
    return ok ? json(res, 200, { ok: true }) : notFound(res, '权限请求不存在或已处理');
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/ui\/([\w-]+)$/)) && req.method === 'POST') {
    const body = await readBody(req);
    const ok = resolveUiRequest(match[2], body.value, match[1]);
    return ok ? json(res, 200, { ok: true }) : notFound(res, 'UI 请求不存在或已处理');
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/mode$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (s.parentSessionId) return badRequest(res, '子 Agent 的权限模式由派发时的主任务决定');
    const body = await readBody(req);
    const mode = ['default', 'auto-all'].includes(body.mode) ? body.mode : 'default';
    s.setMode(mode);
    emit('session_updated', { sessionId: s.id, mode });
    return json(res, 200, { mode });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/desktop$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (s.parentSessionId) return badRequest(res, '子 Agent 不开放桌面控制');
    const body = await readBody(req);
    const enabled = s.setDesktopEnabled(!!body.enabled);
    emit('session_updated', { sessionId: s.id, desktopEnabled: enabled });
    return json(res, 200, { desktopEnabled: enabled });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/expert$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (s.parentSessionId) return badRequest(res, '子 Agent 的角色由派发时决定');
    if (isRunning(s.id)) return json(res, 409, { error: '会话运行中，不能切换专家' });
    const body = await readBody(req);
    const expert = body.expertId ? getExpert(body.expertId) : null;
    if (body.expertId && !expert) return badRequest(res, '专家不存在');
    const value = s.setExpert(expert?.id || '', expert?.prompt || '');
    emit('session_updated', { sessionId: s.id, ...value });
    return json(res, 200, value);
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/workspace$/)) && req.method === 'POST') {
    assertWorkspaceIdle();
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (isRunning(s.id)) return json(res, 409, { error: '会话运行中，不能修改工作目录' });
    if (s.parentSessionId || agentManager.view(s).tasks.length) return json(res, 409, { error: '任务组保留在原工作区，请新建会话使用其他工作目录' });
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
    if (s.parentSessionId) return json(res, 409, { error: '请在主会话中压缩上下文' });
    if (isRunning(s.id) || activeSequences.has(s.id) || agentManager.pending(s).length) return json(res, 409, { error: '任务或子任务正在运行，停止后才能压缩上下文' });
    const context = contextForSession(s);
    const r = await withRunContext(context, () => maybeCompact(s, { contextWindow: context.modelSelection?.model?.contextWindow ?? 128000, compactAtPercent: context.config.agent?.compactAtPercent ?? 75 }, { force: true }));
    return json(res, 200, r);
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/fork$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (isRunning(s.id) || agentManager.pending(s).length) return json(res, 409, { error: '请等待任务组完成后再 fork' });
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
      const r = await withRunContext(contextForSession(s), () => runDevTool(s, body.tool, body.args ?? {}));
      return json(res, 200, r);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if (pathname === '/api/plugins/reload' && req.method === 'POST') {
    assertWorkspaceIdle();
    await disconnectChannels();
    const info = await loadAll({ reload: true });
    await initializeChannels();
    emit('plugins_reloaded', {});
    return json(res, 200, info);
  }
  return null; // 未匹配 API
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? HOST}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      if (shuttingDown) return json(res, 503, { error: '运行时正在关闭，请稍后重试' });
      await route(req, res, url);
      if (!res.headersSent) notFound(res);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    if (!res.writableEnded) json(res, err.status || 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  runtimeHost?.publish(`http://127.0.0.1:${address.port}`);
  if (process.send) process.send({ type: 'mli-ready', port: address.port, pid: process.pid });
  const info = runtimeInfo();
  console.log(`\n  MLI Agent 已启动  →  http://${HOST}:${address.port}\n`);
  console.log(`  模型:  ${info.provider.protocol} / ${info.provider.model}${info.provider.hasKey ? '' : '  ⚠ 未配置 API Key（请在「模型」页面配置服务商凭据）'}`);
  console.log(`  工作区: ${getWorkspaceRoot()}`);
  console.log(`  工具:  ${info.tools.map((t) => `${t.name}[${t.permission}]`).join('  ')}\n`);
});
