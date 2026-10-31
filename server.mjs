import { terminalAgentBinding, assertTerminalAgentTarget, terminalAgentContext, terminalAgentInstruction } from './core/terminal-agent.mjs';
import { compileTypesetting } from './core/typesetting-preview.mjs';
import { recommendTerminalCommands } from './core/terminal-assistant.mjs';
import { installPiPackage, listPiPackages, removePiPackage, withPluginManagement } from './core/pi-packages.mjs';
import { manageSshDesktopSystem } from './core/ssh-desktop-system.mjs';
// server.mjs —— 入口：原生 node:http。REST + 全局 SSE 事件总线 + 静态托管
// UI 只是这个 server 的一个客户端：收用户输入 POST、看 SSE 事件、把用户决策 POST 回来
import './core/environment.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { redactGitRemoteUrl } from './core/git-remote.mjs';
import { spawn } from 'node:child_process';
import { spawnPty } from './core/pty-runtime.mjs';
import { fileURLToPath } from 'node:url';
import { loadConfig, getConfig, applyProviderPatch, saveConfigFile, publicSettings, listRemoteModels, testProvider, refreshManagedCatalog } from './core/llm.mjs';
import { configuredMcp, publicMcpSettings, updateMcpSettings } from './core/mcp-settings.mjs';
import { beginOAuth, oauthStatus, cancelOAuth, oauthBrowserJob } from './core/mcp-oauth.mjs';
import { closeMcp, testMcpServer, mcpServers } from './core/mcp.mjs';
import { modelProfiles } from './core/model-profiles.mjs';
import { setLoopConfig, runTurn, abortRun, interruptRunForAdjustment, isRunning, runningStep, runDevTool, runtimeInfo, Session } from './core/loop.mjs';
import { onEvent, emit, eventSequence } from './core/events.mjs';
import { setSessionStorageRoot, setWorkspaceRoot, APP_ROOT, DATA_ROOT, getWorkspaceRoot, isWorkspaceRoot } from './core/paths.mjs';
import { uiPreferences, updateUiPreferences } from './core/ui-preferences.mjs';
import { cloneGitWorkspace, listWorkspaceRepositories } from './core/git-clone.mjs';
import { listWorkspaces, addWorkspace, addSshWorkspace, getActiveWorkspace, setActiveWorkspace, removeWorkspace, ensureWorkspace, workspacesForSshConnection } from './core/workspaces.mjs';
import { confirmSshHostKey, deleteSshConnection, getSshConnection, listSshConnections, saveSshConnection } from './core/ssh-connection-store.mjs';
import { closeSshConnection, connectSsh, getSshSessionClient, inspectSshHost, listActiveSshConnections, onSshTerminalEvent, resizeSshTerminal, shutdownSshRuntime, startSshTerminal, stopSshTerminal, writeSshTerminal } from './core/ssh-runtime.mjs';
import { browseSshWorkspacePath, mutateSshHostFile, listSshHostDirectory, listSshWorkspaceDirectory, listSshWorkspaceReferences, readSshGitInfo, readSshHostFileBytes, readSshHostTextFile, readSshServerMetrics, readSshWorkspaceFile, runSshGitAction, setSshWorkspaceRoot, validateSshWorkspacePath, updateSshGitRemote, writeSshHostTextFile, writeSshWorkspaceFile } from './core/ssh-workspace-provider.mjs';
import { isLocalApiRequest } from './core/local-api-security.mjs';
import { readWorkspaceGitInfo, runWorkspaceGitAction, updateWorkspaceGitRemote } from './core/git-workspace-provider.mjs';
import { listWorkspaceReferences } from './core/workspace-reference-files.mjs';
import { filmCanvasMediaPath, readFilmCanvas, saveFilmCanvasEdits, archiveFilmCanvasNode, restoreFilmCanvasVersion, batchUpdateFilmCanvasNodes, deleteFilmCanvasNodes, disconnectFilmCanvasEdges, arrangeFilmCanvasNodes, groupFilmCanvasNodes } from './core/film-canvas.mjs';
import { loadAll, pluginsInfo, resolveUiRequest, getCommands, setPlatformSkills } from './core/plugins.mjs';
import { resolveRequest, listPersistentRules, replacePersistentRules, pendingRequest, setPermissionMode } from './core/permissions.mjs';
import { maybeCompact } from './core/compact.mjs';
import { disposeLogReader, getApiLogAsync, queryApiLogsAsync } from './core/api-log-service.mjs';
import { disposeSessionReader, readSessionView } from './core/session-view-service.mjs';
import { copyWorkspaceItem, createWorkspaceItem, deleteWorkspaceItem, listDirectory, moveWorkspaceItem, openWorkspaceItem, rawWorkspaceFile, readWorkspaceFile, renameWorkspaceItem, revealWorkspaceItem, writeWorkspaceFile } from './core/workspace-files.mjs';
import { addAsset, addAssetFromFile, assetFile, deleteAsset, listAssets } from './core/assets.mjs';
import { serveMedia } from './core/media-response.mjs';
import { filmCanvasMediaInfo, openFilmCanvasMedia } from './core/film-canvas-media.mjs';
import { checkAccountEmail, createPurchaseOrder, getAccountCaptcha, listPurchasePackages, listPlatformLibrary, listTeamMemory, listAccountPlugins, installAccountPlugin, loginAccount, logoutAccount, publicAccountStatus, queryPurchaseOrder, recordClientLaunch, refreshAccount, registerAccount, requireAccount, resetAccountPassword, sendRegisterCode, sendResetCode, setAccountConfig, updateAccountNickname, verifyAccountCaptcha } from './core/account.mjs';
import { getMarketingConfig, getMarketingSummary, claimDailyCheckin } from './core/account.mjs';
import { listSubjects, switchSubject } from './core/account.mjs';
import { DENY_PATTERNS } from './core/tools.mjs';
import { listExperts, getExpert, saveExpert, deleteExpert, setPlatformExperts } from './core/experts.mjs';
import { saveLocalSkill, deleteLocalSkill, listLocalSkills } from './core/local-skills.mjs';
import { convertOfficeFile } from './plugins/office/plugin.mjs';
import { CONFIG_FILE, initializeRuntime, activeSequences, runningSessions, runSequence, prepareTaskResume, assertWorkspaceIdle, stopSession, shutdownRuntime, scheduler } from './core/runtime.mjs';
import { pendingUiRequests } from './core/plugins.mjs';
import { agentManager } from './core/agent-manager.mjs';
import { swarmCapabilities } from './core/agent-profiles.mjs';
import { acpSettings, updateAcpSettings } from './core/acp-settings.mjs';
import { discoverAcpAgents } from './core/acp-client.mjs';
import { contextForSession } from './core/runtime.mjs';
import { withRunContext } from './core/run-context.mjs';
import { approveMemory, deleteMemory, getMemory, listMemories, memoryLocations, restoreMemory, saveMemory } from './core/memory.mjs';
import { memorySettings, updateMemorySettings } from './core/memory-policy.mjs';
import { deleteUserProfile, listUserProfiles, saveUserProfile, setActiveUserProfile, reviewUserProfileUpdate } from './core/user-profiles.mjs';
import { memoryLearner } from './core/memory-learning.mjs';
import { stopProcessTree } from './core/process-tree.mjs';
import { sandboxStatus, updateSandbox, hasActiveSandboxCommands, shutdownSandboxBroker } from './core/sandbox.mjs';
import { retryBashWithoutSandbox } from './core/sandbox-retry.mjs';
import { speechRoute, shutdownSpeech, listMeetings } from './core/speech.mjs';
import { appCenter } from './core/app-center.mjs';
import { appCenterRoute } from './core/app-center-http.mjs';
import { listChannels, channelEvents, channelAdapters, upsertChannel, removeChannel, connectChannel, disconnectChannel, disconnectAll as disconnectChannels, handleIncoming, initializeChannels } from './core/channels.mjs';

const cfg = await initializeRuntime();
appCenter();
recordClientLaunch().catch(() => {});

const PORT = Number(process.env.MLI_AGENT_PORT || cfg.server?.port || 10860);
const HOST = process.env.MLI_AGENT_HOST || cfg.server?.host || '127.0.0.1';
const terminalAgents = new Map();
const terminalRuns = new Map();
const interactiveTerminals = new Map();
const sshTerminalOwners = new Map();
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
  for (const id of interactiveTerminals.keys()) stopInteractiveTerminal(id);
  shutdownSshRuntime();
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
    if (!leases.size && !activeSequences.size && !agentManager.hasPending() && Date.now() - started > 90000) shutdown();
  }, 15000).unref();
}
let platformLibraryLoadedAt = 0;
let platformLibraryRefresh = null;
async function refreshPlatformLibrary(force = false) {
  if (!force && Date.now() - platformLibraryLoadedAt < 30000) return false;
  if (platformLibraryRefresh) { await platformLibraryRefresh; return false; }
  platformLibraryRefresh = (async () => {
    const { items } = await listPlatformLibrary();
    setPlatformExperts(items);
    setPlatformSkills(items);
    platformLibraryLoadedAt = Date.now();
    return true;
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

function startInteractiveTerminal({ cols = 120, rows = 32 } = {}) {
  const id = crypto.randomUUID().slice(0, 12);
  const cwd = getWorkspaceRoot();
  const safeCols = Math.max(20, Math.min(500, Number(cols) || 120));
  const safeRows = Math.max(5, Math.min(200, Number(rows) || 32));
  const isWindows = process.platform === 'win32';
  const shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/bash');
  const args = isWindows ? ['/d'] : ['-il'];
  const pty = spawnPty(shell, args, {
    name: 'xterm-256color', cwd, cols: safeCols, rows: safeRows,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    useConpty: isWindows,
  });
  const session = { id, cwd, pty, output: [], startedAt: Date.now(), status: 'running' };
  interactiveTerminals.set(id, session);
  emit('terminal_started', { terminalId: id, cwd, interactive: true });
  pty.onData(text => {
    if (!text) return;
    session.output.push({ stream: 'stdout', text });
    if (session.output.length > 4000) session.output.shift();
    emit('terminal_output', { terminalId: id, stream: 'stdout', text, interactive: true });
  });
  pty.onExit(({ exitCode, signal }) => {
    if (session.status === 'exited') return;
    session.status = 'exited';
    emit('terminal_exit', { terminalId: id, code: exitCode, signal: signal || null, interactive: true });
    setTimeout(() => interactiveTerminals.delete(id), 5 * 60 * 1000);
  });
  return { terminalId: id, cwd, interactive: true };
}

function writeInteractiveTerminal(id, data) {
  const session = interactiveTerminals.get(id);
  if (!session || session.status !== 'running') return false;
  session.pty.write(String(data || ''));
  return true;
}

function resizeInteractiveTerminal(id, cols, rows) {
  const session = interactiveTerminals.get(id);
  if (!session || session.status !== 'running') return false;
  session.pty.resize(Math.max(20, Math.min(500, Number(cols) || 120)), Math.max(5, Math.min(200, Number(rows) || 32)));
  return true;
}

function stopInteractiveTerminal(id) {
  const session = interactiveTerminals.get(id);
  if (!session || session.status !== 'running') return false;
  session.stopping = true;
  for (const item of terminalAgents.values()) if (item.binding.terminalId === id) stopSession(item.session.id);
  try { session.pty.write('\u0003'); } catch {}
  setTimeout(() => { try { if (session.status === 'running') session.pty.kill(); } catch {} }, 500).unref();
  return true;
}

function requireLocalApi(req, res, label = 'SSH 配置') {
  if (isLocalApiRequest(req)) return true;
  json(res, 403, { error: `${label}仅允许本机同源应用操作` }); return false;
}

// ---------- SSE 总线 ----------
const sseClients = new Set();
const localSshSseClients = new Set();
const refreshModelProfiles = () => modelProfiles.refresh({ force: true }).then(changed => { if (changed) emit('catalog_updated', { ok: true }); }).catch(() => {});
setInterval(refreshModelProfiles, 60000).unref();
// The first /api/info refreshes all catalogs in one notification.
onEvent((evt) => {
  const frame = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) {
    try { res.write(frame); } catch { sseClients.delete(res); }
  }
});
onSshTerminalEvent((evt) => {
  if (evt.type === 'terminal_exit') { sshTerminalOwners.delete(evt.terminalId); for (const item of terminalAgents.values()) if (item.binding.terminalId === evt.terminalId) stopSession(item.session.id); }
  const frame = `data: ${JSON.stringify({ type: evt.type, ts: Date.now(), ...evt })}\n\n`;
  for (const res of localSshSseClients) {
    try { res.write(frame); } catch { localSshSseClients.delete(res); }
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

function readBody(req, maxBytes = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('请求体过大')); req.destroy(); return; }
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
  const workspace = getActiveWorkspace();
  const directory = workspace?.kind === 'ssh' ? path.join(workspace.storagePath, '.agent', 'sessions') : undefined;
  const s = runningSessions.get(id) || Session.load(id, directory);
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
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
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
      json(res, 200, { ok: true, remaining: leases.size, background: Boolean(activeSequences.size || agentManager.hasPending()) });
      if (existed && !leases.size) setImmediate(() => { if (!leases.size && !activeSequences.size && !agentManager.hasPending()) shutdown(); });
      return;
    }
    if (shuttingDown) return json(res, 503, { error: '运行时正在关闭' });
    leases.set(body.id, Date.now());
    return json(res, 200, { ok: true });
  }
  let clientWorkspace = req.headers['x-mli-workspace'];
  if (req.headers['x-mli-workspace-encoded'] !== undefined) {
    try { clientWorkspace = decodeURIComponent(String(req.headers['x-mli-workspace-encoded'])); }
    catch { return json(res, 400, { error: '工作目录请求头编码无效' }); }
  }
  if (clientWorkspace && !isWorkspaceRoot(String(clientWorkspace))) return json(res, 409, { error: '工作目录已被其他客户端切换，请重新连接当前项目', code: 'WORKSPACE_CHANGED' });

  if (pathname === '/api/ssh/connections' && ['GET', 'POST'].includes(req.method)) {
    if (!requireLocalApi(req, res)) return;
    if (req.method === 'GET') return json(res, 200, { connections: listSshConnections(), active: listActiveSshConnections() });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: '需要 application/json' });
    try { return json(res, 200, { connection: saveSshConnection(await readBody(req)), connections: listSshConnections() }); }
    catch (error) { return badRequest(res, error.message); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/probe$/)) && req.method === 'POST') {
    if (!requireLocalApi(req, res)) return;
    try { return json(res, 200, await inspectSshHost(match[1])); }
    catch (error) { return json(res, 502, { error: error.message }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/confirm-host-key$/)) && req.method === 'POST') {
    if (!requireLocalApi(req, res)) return;
    try {
      const body = await readBody(req);
      const current = getSshConnection(match[1]);
      if (current?.hostKeyFingerprint && current.hostKeyFingerprint !== body.fingerprint) return json(res, 409, { error: '已固定的主机指纹不能被覆盖；请先独立核验服务器身份', code: 'SSH_HOST_KEY_CHANGED' });
      const observed = await inspectSshHost(match[1]);
      const connection = confirmSshHostKey(match[1], body.fingerprint, observed.fingerprint);
      return json(res, 200, { connection });
    } catch (error) { return json(res, 409, { error: error.message, code: 'SSH_HOST_KEY_MISMATCH' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/connect$/)) && req.method === 'POST') {
    if (!requireLocalApi(req, res)) return;
    try { return json(res, 200, await connectSsh(match[1], await readBody(req))); }
    catch (error) { return json(res, 502, { error: error.message, code: 'SSH_CONNECT_FAILED' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/disconnect$/)) && req.method === 'POST') {
    if (!requireLocalApi(req, res)) return;
    return json(res, 200, { disconnected: closeSshConnection(match[1]) });
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/workspace\/root$/)) && req.method === 'POST') {
    if (!requireLocalApi(req, res, 'SSH 工作区')) return;
    try {
      const body = await readBody(req);
      const active = getActiveWorkspace();
      const registered = workspacesForSshConnection(match[1]);
      if (registered.some(item => item.remotePath !== body.path)) {
        return json(res, 409, { error: '此 SSH 连接已有工作区记录绑定到其他远程目录。请先从工作区列表移除旧记录。', code: 'SSH_WORKSPACE_ROOT_REGISTERED' });
      }
      if (active?.kind === 'ssh' && active.connectionId === match[1] && active.remotePath !== body.path) {
        return json(res, 409, { error: '此 SSH 主机的远程目录正作为当前工作区使用。请先切换到其他工作区，再更改目录。', code: 'SSH_WORKSPACE_IN_USE' });
      }
      return json(res, 200, { workspace: await setSshWorkspaceRoot(match[1], body.path), workspaces: listWorkspaces() });
    }
    catch (error) { return json(res, 400, { error: error.message, code: 'SSH_WORKSPACE_ROOT_INVALID' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/(workspace|metrics)$/)) && ['GET', 'POST'].includes(req.method)) {
    if (!requireLocalApi(req, res, 'SSH 工作区')) return;
    const connectionId = match[1];
    if (!listActiveSshConnections().some(item => item.id === connectionId)) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
    try {
      if (match[2] === 'metrics') return json(res, 200, await readSshServerMetrics(connectionId));
      if (req.method === 'POST') { const body = await readBody(req); return json(res, 200, body.action === 'browse' ? await browseSshWorkspacePath(connectionId, body.path) : await validateSshWorkspacePath(connectionId, body.path)); }
      return json(res, 200, await listSshWorkspaceDirectory(connectionId, url.searchParams.get('path') || ''));
    } catch (error) { return json(res, 400, { error: error.message, code: 'SSH_WORKSPACE_FAILED' }); }
  }
  if (url.pathname === '/api/terminal/assistant' && req.method === 'POST') {
    if (!requireLocalApi(req,res,'终端 AI 助手')) return;
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),60000);
    const disconnect=()=>{if(!res.writableEnded)abort.abort();};res.on('close',disconnect);
    try {const body=await readBody(req,131072);return json(res,200,await recommendTerminalCommands(body,{signal:abort.signal}));}
    catch(error){if(!res.destroyed)return json(res,400,{error:abort.signal.aborted?'请求已取消或超时，请重试':error.message});}
    finally{clearTimeout(timer);res.off('close',disconnect);}
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/desktop\/system$/)) && req.method === 'POST') {
    if (!requireLocalApi(req, res, 'SSH 桌面系统管理')) return;
    if (!listActiveSshConnections().some(item => item.id === match[1])) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
    try { return json(res, 200, await manageSshDesktopSystem(match[1], await readBody(req, 16384))); }
    catch (error) { return json(res, 400, { error: error.message, code: 'SSH_DESKTOP_SYSTEM_FAILED' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/desktop\/operation$/)) && req.method === 'POST') {
    if (!requireLocalApi(req, res, 'SSH 桌面文件操作')) return;
    if (!listActiveSshConnections().some(item => item.id === match[1])) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
    try { return json(res, 200, await mutateSshHostFile(match[1], await readBody(req, 15 * 1024 * 1024))); }
    catch (error) { return json(res, 400, { error: error.message, code: 'SSH_DESKTOP_OPERATION_FAILED' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/desktop\/files$/)) && req.method === 'GET') {
    if (!requireLocalApi(req, res, 'SSH 虚拟桌面文件管理')) return;
    if (!listActiveSshConnections().some(item => item.id === match[1])) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
    try { return json(res, 200, await listSshHostDirectory(match[1], url.searchParams.get('path') || '/')); }
    catch (error) { return json(res, 400, { error: error.message, code: 'SSH_DESKTOP_FILE_FAILED' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/desktop\/file$/)) && ['GET', 'PUT'].includes(req.method)) {
    if (!requireLocalApi(req, res, 'SSH 虚拟桌面文本编辑')) return;
    if (!listActiveSshConnections().some(item => item.id === match[1])) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
    try {
      if (req.method === 'GET') return json(res, 200, await readSshHostTextFile(match[1], url.searchParams.get('path') || ''));
      const body = await readBody(req);
      return json(res, 200, { file: await writeSshHostTextFile(match[1], body.path, body.content) });
    } catch (error) { return json(res, 400, { error: error.message, code: 'SSH_DESKTOP_FILE_FAILED' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/desktop\/download$/)) && req.method === 'GET') {
    if (!requireLocalApi(req, res, 'SSH 虚拟桌面文件下载')) return;
    if (!listActiveSshConnections().some(item => item.id === match[1])) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
    try {
      const file = await readSshHostFileBytes(match[1], url.searchParams.get('path') || '');
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': file.size, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(file.content);
      return true;
    } catch (error) { return json(res, 400, { error: error.message, code: 'SSH_DESKTOP_FILE_FAILED' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/git$/)) && ['GET', 'POST'].includes(req.method)) {
    if (!requireLocalApi(req, res, 'SSH Git')) return;
    const connectionId = match[1];
    const connection = getSshConnection(connectionId);
    if (!connection?.workspaceRoot) return json(res, 409, { error: '请先设置远程项目目录', code: 'SSH_WORKSPACE_ROOT_REQUIRED' });
    if (!listActiveSshConnections().some(item => item.id === connectionId)) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
    try {
      if (req.method === 'GET') return json(res, 200, await readSshGitInfo(connectionId));
      const body = await readBody(req);
      if (body.action === 'operation') return json(res, 200, await runSshGitAction(connectionId, body.operation || {}));
      return json(res, 200, await updateSshGitRemote(connectionId, body));
    } catch (error) { return json(res, 400, { error: redactGitRemoteUrl(error.message), code: 'SSH_GIT_FAILED' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)\/workspace\/file$/)) && ['GET', 'PUT'].includes(req.method)) {
    if (!requireLocalApi(req, res, 'SSH 工作区')) return;
    const connectionId = match[1];
    if (!listActiveSshConnections().some(item => item.id === connectionId)) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
    try {
      if (req.method === 'GET') return json(res, 200, await readSshWorkspaceFile(connectionId, url.searchParams.get('path') || ''));
      const body = await readBody(req);
      return json(res, 200, { file: await writeSshWorkspaceFile(connectionId, body.path, body.content) });
    } catch (error) { return json(res, 400, { error: error.message, code: 'SSH_WORKSPACE_FAILED' }); }
  }
  if ((match = m(/^\/api\/ssh\/connections\/([\w-]+)$/)) && req.method === 'DELETE') {
    if (!requireLocalApi(req, res)) return;
    if (listActiveSshConnections().some(item => item.id === match[1])) return json(res, 409, { error: '请先断开 SSH 连接再删除' });
    return json(res, 200, { ok: deleteSshConnection(match[1]), connections: listSshConnections() });
  }

  // SSE
  if (pathname === '/api/event') {
    const localSshClient = isLocalApiRequest(req);
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'server_connected', ts: Date.now() })}\n\n`);
    sseClients.add(res);
    if (localSshClient) localSshSseClients.add(res);
    req.on('close', () => { sseClients.delete(res); localSshSseClients.delete(res); });
    return true;
  }

  if (pathname === '/api/info') {
    Promise.all([refreshManagedCatalog(), refreshPlatformLibrary(), modelProfiles.refresh().catch(() => false)])
      .then((results) => { if (results.some(Boolean)) emit('catalog_updated', { ok: true }); })
      .catch(() => {});
    let teamMemory = { available: false, organizationId: null, memoryCount: 0, repositoryCount: 0 };
    try {
      const data = await listTeamMemory({ timeoutMs: 1200 });
      teamMemory = { available: data.scope?.subjectType === 'enterprise', organizationId: data.scope?.organizationId || null, organizationName: data.scope?.organizationName || null, memoryCount: data.memories?.length || 0, repositoryCount: data.repositories?.length || 0 };
    } catch { /* 账户服务不可用时不阻断本地工作台 */ }
    const mcp = (cfg.mcp?.servers || []).map((server) => ({
      name: String(server.name || '').trim(),
    })).filter((server) => server.name);
    return json(res, 200, { ...runtimeInfo(), ...publicSettings(), account: publicAccountStatus(), teamMemory, uiPreferences: uiPreferences(), subagentsEnabled: cfg.agent?.subagents?.enabled !== false, plugins: pluginsInfo(), commands: getCommands(), experts: listExperts(), localSkills: listLocalSkills(), mcp, workspace: getWorkspaceRoot(), workspaces: listWorkspaces(), channels: listChannels(), channelAdapters: channelAdapters() });
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
  if (pathname === '/api/account/subjects' && req.method === 'GET') {
    try { return json(res, 200, { subjects: await listSubjects() }); }
    catch (error) { return json(res, 502, { error: error.message, code: error.code }); }
  }
  if (pathname === '/api/account/subject' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const account = await switchSubject(body.organizationId);
      // 切换主体后模型目录与平台库都随主体变化，必须像登录一样强制刷新。
      await refreshManagedCatalog({ force: true }).catch(() => {});
      await refreshPlatformLibrary(true).catch(() => {});
      emit('account_updated', { account });
      emit('catalog_updated', { ok: true, reason: 'subject_changed' });
      return json(res, 200, account);
    } catch (error) {
      return json(res, [400, 401, 403].includes(error.status) ? error.status : 502, { error: error.message, code: error.code });
    }
  }
  if (pathname === '/api/account/plugins' && req.method === 'GET') {
    try { return json(res, 200, { plugins: await listAccountPlugins() }); }
    catch (error) { return json(res, 502, { error: error.message }); }
  }
  if (pathname === '/api/library/team' && req.method === 'GET') {
    try { return json(res, 200, await listTeamMemory()); }
    catch (error) { return json(res, [401, 403].includes(error.status) ? error.status : 502, { error: error.message, code: error.code }); }
  }
  if ((match = m(/^\/api\/account\/plugins\/([^/]+)\/install$/)) && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const pluginId = decodeURIComponent(match[1]);
      return json(res, 200, await withPluginManagement(async () => { assertWorkspaceIdle(); return installAccountPlugin(pluginId, body.sha256); }));
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
      return json(res, 200, await createPurchaseOrder(body.packageId, body.payType));
    } catch (error) { return json(res, error.status === 400 || error.status === 401 ? error.status : 502, { error: error.message }); }
  }
  if ((match = m(/^\/api\/account\/orders\/([A-Za-z0-9-]+)$/)) && req.method === 'GET') {
    try { return json(res, 200, await queryPurchaseOrder(match[1])); }
    catch (error) { return json(res, error.status === 400 || error.status === 401 || error.status === 404 ? error.status : 502, { error: error.message }); }
  }
  if (pathname === '/api/workspaces/repositories' && req.method === 'GET') {
    if (!requireLocalApi(req, res, '仓库记录')) return;
    const workspace = getActiveWorkspace();
    if (!workspace || workspace.kind === 'ssh') return json(res, 200, { repositories: [] });
    if (url.searchParams.get('workspaceId') && url.searchParams.get('workspaceId') !== workspace.id) return json(res, 409, { error: '当前工作目录已变化，请刷新后重试', code: 'WORKSPACE_CHANGED' });
    return json(res, 200, { repositories: listWorkspaceRepositories(workspace.path) });
  }
  if (pathname === '/api/workspaces/clone' && req.method === 'POST') {
    if (!requireLocalApi(req, res, 'Git 克隆')) return;
    assertWorkspaceIdle();
    try {
      const body = await readBody(req), workspace = getActiveWorkspace();
      if (!workspace || workspace.kind === 'ssh') return json(res, 409, { error: '请先选择本地工作目录；SSH 工作区暂不支持本机克隆', code: 'LOCAL_WORKSPACE_REQUIRED' });
      if (body.workspaceId && body.workspaceId !== workspace.id) return json(res, 409, { error: '当前工作目录已变化，请刷新后重试', code: 'WORKSPACE_CHANGED' });
      return json(res, 200, await cloneGitWorkspace({ ...body, parentPath: workspace.path }));
    }
    catch (error) { return badRequest(res, error.message); }
  }
  if (pathname === '/api/workspaces' && req.method === 'GET') return json(res, 200, { workspaces: listWorkspaces(), active: getActiveWorkspace() || { path: getWorkspaceRoot() } });
  if (pathname === '/api/workspaces' && req.method === 'POST') {
    assertWorkspaceIdle();
    const body = await readBody(req);
    if (body.kind === 'ssh') {
      if (!requireLocalApi(req, res, 'SSH 工作区')) return;
      const connection = getSshConnection(body.connectionId);
      if (!connection?.workspaceRoot || !listActiveSshConnections().some(item => item.id === body.connectionId)) return json(res, 409, { error: '请先连接 SSH 并设置远程项目目录', code: 'SSH_WORKSPACE_UNAVAILABLE' });
      const item = addSshWorkspace({ connectionId: body.connectionId, remotePath: connection.workspaceRoot, name: body.name || connection.name });
      setSessionStorageRoot(item.storagePath);
      cfg.security.remoteWorkspaceId = item.id; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg); emit('workspace_changed', { workspace: item });
      return json(res, 200, { workspace: item, workspaces: listWorkspaces() });
    }
    const item = addWorkspace(body); setWorkspaceRoot(item.path); cfg.security.workspaceRoot = item.path; delete cfg.security.remoteWorkspaceId; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg); emit('workspace_changed', { workspace: item }); return json(res, 200, { workspace: item, workspaces: listWorkspaces() });
  }
  if ((match = m(/^\/api\/workspaces\/([\w-]+)\/git$/)) && ['GET', 'POST'].includes(req.method)) {
    if (!requireLocalApi(req, res, 'Git')) return;
    const workspace = listWorkspaces().find(item => item.id === match[1]);
    if (!workspace) return json(res, 404, { error: '工作目录不存在', code: 'WORKSPACE_NOT_FOUND' });
    if (workspace.kind === 'ssh') return json(res, 409, { error: 'SSH 工作区请通过 SSH 连接管理读取 Git 状态', code: 'SSH_GIT_ROUTE' });
    try {
      if (req.method === 'GET') return json(res, 200, await readWorkspaceGitInfo(workspace.path));
      const body = await readBody(req);
      if (body.action === 'operation') return json(res, 200, await runWorkspaceGitAction(workspace.path, body.operation || {}));
      return json(res, 200, await updateWorkspaceGitRemote(workspace.path, body));
    } catch (error) { return json(res, 400, { error: redactGitRemoteUrl(error.message), code: 'WORKSPACE_GIT_FAILED' }); }
  }
  if ((match = m(/^\/api\/workspaces\/([\w-]+)\/activate$/)) && req.method === 'POST') {
    assertWorkspaceIdle();
    const target = listWorkspaces().find(item => item.id === match[1]);
    if (!target) return json(res, 404, { error: '工作目录不存在' });
    if (target.kind === 'ssh') {
      if (!requireLocalApi(req, res, 'SSH 工作区')) return;
      const connection = getSshConnection(target.connectionId);
      if (!connection?.workspaceRoot || connection.workspaceRoot !== target.remotePath || !listActiveSshConnections().some(item => item.id === target.connectionId)) {
        return json(res, 409, { error: 'SSH 工作区路径已失效或主机已断开。请重新设置远程项目目录，确认路径后再打开。', code: 'SSH_WORKSPACE_UNAVAILABLE' });
      }
    }
    const item = setActiveWorkspace(match[1]);
    setSessionStorageRoot(item.kind === 'ssh' ? item.storagePath : undefined);
    if (item.kind === 'ssh') { cfg.security.remoteWorkspaceId = item.id; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg); emit('workspace_changed', { workspace: item }); return json(res, 200, { workspace: item, workspaces: listWorkspaces() }); }
    setWorkspaceRoot(item.path); cfg.security.workspaceRoot = item.path; delete cfg.security.remoteWorkspaceId; saveConfigFile(CONFIG_FILE); setLoopConfig(cfg); emit('workspace_changed', { workspace: item }); return json(res, 200, { workspace: item, workspaces: listWorkspaces() });
  }
  if ((match = m(/^\/api\/workspaces\/([\w-]+)$/)) && req.method === 'DELETE') {
    const target = listWorkspaces().find((item) => item.id === match[1]);
    if (!target) return json(res, 404, { error: '工作目录不存在' });
    if (target.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    if (target.active) {
      assertWorkspaceIdle();
      const next = listWorkspaces().find((item) => item.id !== target.id);
      if (next?.kind === 'ssh') {
        const connection = getSshConnection(next.connectionId);
        if (!connection?.workspaceRoot || connection.workspaceRoot !== next.remotePath || !listActiveSshConnections().some(item => item.id === next.connectionId)) {
          return json(res, 409, { error: '备用 SSH 工作区路径已失效或主机已断开。请先重新连接并确认其项目目录，或移除此工作区。', code: 'SSH_WORKSPACE_UNAVAILABLE' });
        }
      }
      const root = next?.path || path.join(DATA_ROOT, 'workspace');
      setSessionStorageRoot(next?.kind === 'ssh' ? next.storagePath : undefined);
      if (next?.kind === 'ssh') cfg.security.remoteWorkspaceId = next.id;
      else { setWorkspaceRoot(root); cfg.security.workspaceRoot = root; delete cfg.security.remoteWorkspaceId; }
      saveConfigFile(CONFIG_FILE); setLoopConfig(cfg);
      removeWorkspace(target.id);
      if (next) setActiveWorkspace(next.id);
      emit('workspace_changed', { workspace: next || null });
    } else {
      removeWorkspace(target.id);
      emit('workspace_removed', { workspaceId: target.id });
    }
    return json(res, 200, { ok: true, workspaces: listWorkspaces() });
  }
  if (pathname === '/api/files' && req.method === 'GET') {
    if (getActiveWorkspace()?.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    return json(res, 200, await listDirectory(url.searchParams.get('path') || ''));
  }
  if (pathname === '/api/files/references' && req.method === 'GET') {
    const active = getActiveWorkspace();
    if (active?.kind === 'ssh') {
      if (!requireLocalApi(req, res, 'SSH 工作区')) return;
      if (!listActiveSshConnections().some(item => item.id === active.connectionId)) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
      return json(res, 200, await listSshWorkspaceReferences(active.connectionId, { query: url.searchParams.get('query') || '', limit: url.searchParams.get('limit') }));
    }
    return json(res, 200, await listWorkspaceReferences({ query: url.searchParams.get('query') || '', limit: url.searchParams.get('limit') }));
  }
  if (pathname.startsWith('/api/terminal/agent')) {
    if (!requireLocalApi(req, res, '终端 Agent')) return;
    try {
      const dependencies = { localTerminals: interactiveTerminals, sshOwners: sshTerminalOwners, connection: getSshConnection, sshClient: getSshSessionClient, workspaceRoot: getWorkspaceRoot() };
      if (pathname === '/api/terminal/agent' && req.method === 'POST') {
        const body = await readBody(req);
        const binding = terminalAgentBinding(String(body.terminalId || ''), dependencies);
        assertTerminalAgentTarget(binding, dependencies);
        const session = Session.create('终端 · ' + binding.name, { directory: path.join(binding.storageRoot, '.agent', 'terminal-sessions') });
        const context = terminalAgentContext(contextForSession(session), binding, () => assertTerminalAgentTarget(binding, dependencies));
        if (terminalAgents.size >= 100) { const obsolete = [...terminalAgents].find(([id]) => !activeSequences.has(id) && !isRunning(id)); if (obsolete) terminalAgents.delete(obsolete[0]); }
        terminalAgents.set(session.id, { session, binding, context, error: null });
        return json(res, 201, { id: session.id, target: binding, model: context.modelSelection?.model?.name || context.modelSelection?.model?.id || cfg.provider?.model || '当前模型' });
      }
      const route = pathname.match(/^\/api\/terminal\/agent\/([\w-]+)(?:\/(message|abort|permission))?$/);
      const item = route && terminalAgents.get(route[1]);
      if (!item) return notFound(res, '终端 Agent 会话不存在，请重新开始');
      const { session, binding, context } = item;
      if (req.method === 'GET' && !route[2]) return json(res, 200, { entries: session.chain(), running: activeSequences.has(session.id) || isRunning(session.id), activeStep: runningStep(session.id), permission: pendingRequest(session.id), error: item.error, target: binding });
      if (req.method === 'POST' && route[2] === 'abort') return json(res, 200, { ok: stopSession(session.id) });
      if (req.method === 'POST' && route[2] === 'permission') {
        const body = await readBody(req);
        if (!['allow', 'deny'].includes(body.decision)) return badRequest(res, '无效审批决定');
        if (body.decision === 'allow') assertTerminalAgentTarget(binding, dependencies);
        return json(res, 200, { ok: resolveRequest(body.requestId, body.decision, session.id) });
      }
      if (req.method === 'POST' && route[2] === 'message') {
        assertTerminalAgentTarget(binding, dependencies);
        if (activeSequences.has(session.id) || isRunning(session.id)) return json(res, 409, { error: 'Agent 正在处理上一条消息' });
        const body = await readBody(req, 32768);
        const text = String(body.text || '').trim();
        if (!text || text.length > 12000) return badRequest(res, '消息需要 1–12000 字符');
        assertTerminalAgentTarget(binding, dependencies);
        if (activeSequences.has(session.id) || isRunning(session.id)) return json(res, 409, { error: 'Agent 正在处理上一条消息' });
        if (cfg.provider?.managed) requireAccount('调用平台内置模型');
        item.error = null;
        runSequence(session, terminalAgentInstruction(binding) + '\n\n用户请求：' + text, [], { context }).catch(error => { item.error = error.message; emit('error', { sessionId: session.id, message: error.message }); });
        return json(res, 202, { ok: true });
      }
      return notFound(res);
    } catch (error) { return json(res, 409, { error: error.message }); }
  }
  if (pathname === '/api/terminal/run' && req.method === 'POST') {
    try { return json(res, 200, startTerminalRun((await readBody(req)).command)); }
    catch (error) { return json(res, 400, { error: error.message, code: 'TERMINAL_COMMAND_REJECTED' }); }
  }
  if (pathname === '/api/terminal/interactive' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      if (body.sshConnectionId) {
        if (!requireLocalApi(req, res, 'SSH 终端')) return;
        if (!listActiveSshConnections().some(item => item.id === String(body.sshConnectionId))) return json(res, 409, { error: '请先连接 SSH 主机', code: 'SSH_NOT_CONNECTED' });
        const connection = getSshConnection(String(body.sshConnectionId));
        const cwd = connection?.workspaceRoot || undefined;
        const result = startSshTerminal(String(body.sshConnectionId), { ...body, cwd });
        sshTerminalOwners.set(result.terminalId, String(body.sshConnectionId));
        return json(res, 200, result);
      }
      return json(res, 200, startInteractiveTerminal(body));
    }
    catch (error) { return json(res, 400, { error: error.message, code: 'TERMINAL_PTY_START_FAILED' }); }
  }
  if ((match = m(/^\/api\/terminal\/([\w-]+)\/input$/)) && req.method === 'POST') {
    const sshOwner = sshTerminalOwners.get(match[1]);
    if (sshOwner && !requireLocalApi(req, res, 'SSH 终端')) return;
    const body = await readBody(req);
    return json(res, 200, { ok: sshOwner ? writeSshTerminal(sshOwner, match[1], body.data) : writeInteractiveTerminal(match[1], body.data) });
  }
  if ((match = m(/^\/api\/terminal\/([\w-]+)\/resize$/)) && req.method === 'POST') {
    const sshOwner = sshTerminalOwners.get(match[1]);
    if (sshOwner && !requireLocalApi(req, res, 'SSH 终端')) return;
    const body = await readBody(req);
    return json(res, 200, { ok: sshOwner ? resizeSshTerminal(sshOwner, match[1], body.cols, body.rows) : resizeInteractiveTerminal(match[1], body.cols, body.rows) });
  }
  if ((match = m(/^\/api\/terminal\/([\w-]+)\/stop$/)) && req.method === 'POST') {
    const sshOwner = sshTerminalOwners.get(match[1]);
    if (sshOwner && !requireLocalApi(req, res, 'SSH 终端')) return;
    if (sshOwner) { for (const item of terminalAgents.values()) if (item.binding.terminalId === match[1]) stopSession(item.session.id); sshTerminalOwners.delete(match[1]); }
    return json(res, 200, { ok: sshOwner ? stopSshTerminal(sshOwner, match[1]) : stopTerminalRun(match[1]) || stopInteractiveTerminal(match[1]) });
  }
  if ((match = m(/^\/api\/terminal\/([\w-]+)$/)) && req.method === 'GET') {
    const run = terminalRuns.get(match[1]);
    if (!run) return notFound(res, '终端任务不存在或已过期');
    return json(res, 200, { terminalId: run.id, command: run.command, cwd: run.cwd, status: run.status, output: run.output, startedAt: run.startedAt });
  }
  if (pathname === '/api/assets' && req.method === 'GET') return json(res, 200, { assets: listAssets() });
  if (pathname === '/api/film-canvas' && req.method === 'GET') return json(res, 200, { canvas: readFilmCanvas() });
  if (pathname === '/api/film-canvas/actions' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const actions = {
        archive: () => archiveFilmCanvasNode(body.nodeId),
        'restore-version': () => restoreFilmCanvasVersion(body.nodeId, body.versionId),
        batch: () => batchUpdateFilmCanvasNodes(body.updates),
        delete: () => deleteFilmCanvasNodes(body.nodeIds),
        disconnect: () => disconnectFilmCanvasEdges(body.edgeIds),
        arrange: () => arrangeFilmCanvasNodes(body),
        group: () => groupFilmCanvasNodes(body),
      };
      if (!Object.hasOwn(actions, body.action)) return json(res, 400, { error: '未知画布操作' });
      return json(res, 200, { canvas: actions[body.action]() });
    } catch (error) { return json(res, error.statusCode || 400, { error: error.message }); }
  }
  if (pathname === '/api/film-canvas' && req.method === 'PUT') {
    try { return json(res, 200, { canvas: saveFilmCanvasEdits(await readBody(req)) }); }
    catch (error) { return json(res, error.statusCode || 400, { error: error.message }); }
  }
  if (pathname === '/api/film-canvas/media/info' && req.method === 'GET') {
    try { return json(res, 200, filmCanvasMediaInfo({ assetId: url.searchParams.get('assetId'), path: url.searchParams.get('path') })); }
    catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (pathname === '/api/film-canvas/media/open' && req.method === 'POST') {
    try { const body = await readBody(req); return json(res, 200, await openFilmCanvasMedia(body, body.action)); }
    catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (pathname === '/api/film-canvas/media' && req.method === 'GET') {
    const media = filmCanvasMediaPath(url.searchParams.get('path') || '');
    return serveMedia(req, res, media.path, media.mime, { 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(media.name)}`, 'cache-control': 'no-store' });
  }
  if (pathname === '/api/assets' && req.method === 'POST') { const body = await readBody(req, 140 * 1024 * 1024); return json(res, 200, { asset: addAsset({ ...body, source: body.source || 'user' }) }); }
  if ((match = m(/^\/api\/assets\/([\w-]+)$/)) && req.method === 'DELETE') return json(res, 200, { asset: deleteAsset(match[1]) });
  if ((match = m(/^\/api\/assets\/([\w-]+)\/raw$/)) && req.method === 'GET') {
    const asset = assetFile(match[1]); return serveMedia(req, res, asset.path, asset.item.mime);
  }
  if (pathname === '/api/file' && req.method === 'GET') {
    if (getActiveWorkspace()?.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    return json(res, 200, await readWorkspaceFile(url.searchParams.get('path') || ''));
  }
  if (pathname === '/api/file/meta' && req.method === 'GET') {
    if (getActiveWorkspace()?.kind === 'ssh') return json(res, 409, { error: 'SSH 工作区暂不支持本地文件元数据读取', code: 'SSH_LOCAL_FILE_UNSUPPORTED' });
    const file = rawWorkspaceFile(url.searchParams.get('path') || '');
    return json(res, 200, { path: file.relative, name: path.basename(file.abs), kind: file.kind, size: file.stat.size });
  }
  if (pathname.startsWith('/api/file/raw/') && req.method === 'GET') {
    if (getActiveWorkspace()?.kind === 'ssh') return json(res, 409, { error: 'SSH 工作区暂不支持二进制和原始文件预览', code: 'SSH_BINARY_PREVIEW_UNSUPPORTED' });
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
    if (getActiveWorkspace()?.kind === 'ssh') return json(res, 409, { error: 'SSH 工作区暂不支持二进制和原始文件预览', code: 'SSH_BINARY_PREVIEW_UNSUPPORTED' });
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
  if (pathname === '/api/file/typesetting-preview' && req.method === 'POST') {
    if (!requireLocalApi(req, res, '排版编译')) return;
    if (getActiveWorkspace()?.kind === 'ssh') return json(res, 409, { error: 'SSH 工作区支持源码编辑，请在本地工作区编译预览' });
    const body = await readBody(req, 6 * 1024 * 1024);
    try {
      const pdf = await compileTypesetting(body.path, body.content);
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': pdf.length, 'cache-control': 'no-store' });
      res.end(pdf);
      return true;
    } catch (error) { return json(res, 422, { error: error.message, code: 'TYPESETTING_PREVIEW_UNAVAILABLE' }); }
  }
  if (pathname === '/api/file/office-preview' && req.method === 'GET') {
    if (getActiveWorkspace()?.kind === 'ssh') return json(res, 409, { error: 'SSH 工作区暂不支持远程 Office 预览', code: 'SSH_OFFICE_PREVIEW_UNSUPPORTED' });
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
    if (getActiveWorkspace()?.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    const body = await readBody(req); return json(res, 200, { file: await writeWorkspaceFile(body.path, body.content) });
  }
  if (pathname === '/api/file/create' && req.method === 'POST') {
    if (getActiveWorkspace()?.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    const body = await readBody(req); return json(res, 200, { item: await createWorkspaceItem(body.parent || '', body.name, body.type) });
  }
  if (pathname === '/api/file/rename' && req.method === 'POST') {
    if (getActiveWorkspace()?.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    const body = await readBody(req); return json(res, 200, { item: await renameWorkspaceItem(body.path, body.name) });
  }
  if (pathname === '/api/file/move' && req.method === 'POST') {
    if (getActiveWorkspace()?.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    const body = await readBody(req); return json(res, 200, { item: await moveWorkspaceItem(body.path, body.target || '') });
  }
  if (pathname === '/api/file/copy' && req.method === 'POST') {
    if (getActiveWorkspace()?.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    const body = await readBody(req); return json(res, 200, { item: await copyWorkspaceItem(body.path, body.target || '') });
  }
  if (pathname === '/api/file/delete' && req.method === 'POST') {
    if (getActiveWorkspace()?.kind === 'ssh' && !requireLocalApi(req, res, 'SSH 工作区')) return;
    const body = await readBody(req); return json(res, 200, { item: await deleteWorkspaceItem(body.path) });
  }
  if (pathname === '/api/file/reveal' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, revealWorkspaceItem(body.path));
  }
  if (pathname === '/api/file/open' && req.method === 'POST') {
    const body = await readBody(req); return json(res, 200, openWorkspaceItem(body.path));
  }
  if (pathname === '/api/permissions' && req.method === 'GET') return json(res, 200, { allow: listPersistentRules() });
  if (pathname === '/api/sandbox' && req.method === 'GET') return json(res, 200, await sandboxStatus());
  if (pathname === '/api/sandbox/diagnostics' && req.method === 'GET') return json(res, 200, await sandboxStatus());
  // Readiness only: system installation is available exclusively through desktop IPC.
  if (pathname === '/api/sandbox/install-preflight' && req.method === 'POST') {
    if(activeSequences.size || agentManager.hasPending() || hasActiveSandboxCommands() || [...terminalRuns.values()].some(run=>['starting','running'].includes(run.status)))return json(res,409,{error:'任务或终端命令正在运行，请停止或完成后再安装沙箱'});
    // The idle broker holds the native sandbox claim the installer needs.
    await shutdownSandboxBroker();
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
    if (body.defaultPermissionMode !== undefined && !['default', 'auto-all'].includes(body.defaultPermissionMode)) return badRequest(res, '无效权限模式');
    if (body.desktopEnabled !== undefined && typeof body.desktopEnabled !== 'boolean') return badRequest(res, '无效桌面会话开关');
    const preferences = updateUiPreferences(body);
    emit('ui_preferences_updated', preferences);
    return json(res, 200, preferences);
  }
  if (pathname === '/api/memory/settings' && req.method === 'GET') return json(res, 200, { settings: memorySettings() });
  if (pathname === '/api/user-profiles' && req.method === 'GET') return json(res, 200, listUserProfiles());
  if (pathname === '/api/user-profiles' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.id) return badRequest(res, '新增档案不能包含已有 ID');
    try { return json(res, 201, { profile: saveUserProfile(body), ...listUserProfiles() }); }
    catch (error) { return json(res, error.status || 400, { error: error.message }); }
  }
  if (pathname === '/api/user-profiles/active' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.id !== '' && (typeof body.id !== 'string' || body.id.length > 80)) return badRequest(res, '无效档案 ID');
    try { return json(res, 200, setActiveUserProfile(body.id)); }
    catch (error) { return json(res, error.status || 400, { error: error.message }); }
  }
  if ((match = m(/^\/api\/user-profiles\/([\w-]+)\/proposals\/([\w-]+)$/)) && req.method === 'POST') {
    const body = await readBody(req);
    if (!Number.isInteger(body.expectedRevision) || typeof body.approve !== 'boolean') return badRequest(res, '请提供档案版本和审核结果');
    try { return json(res, 200, { profile: reviewUserProfileUpdate(match[1], match[2], body.expectedRevision, body.approve), ...listUserProfiles() }); }
    catch (error) { return json(res, error.status || 400, { error: error.message }); }
  }
  if ((match = m(/^\/api\/user-profiles\/([\w-]+)$/)) && ['PUT', 'DELETE'].includes(req.method)) {
    const body = await readBody(req);
    try {
      if (req.method === 'DELETE') {
        if (!Number.isInteger(body.expectedRevision)) return badRequest(res, '请提供档案版本 expectedRevision');
        deleteUserProfile(match[1], body.expectedRevision);
        return json(res, 200, listUserProfiles());
      }
      return json(res, 200, { profile: saveUserProfile({ ...body, id: match[1] }), ...listUserProfiles() });
    } catch (error) { return json(res, error.status || 400, { error: error.message }); }
  }
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
        reasoningSettings: body.reasoningSettings,
        apiKey: body.apiKey || undefined,
        protocol: body.protocol,
      });
      return json(res, 200, r);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }
  if (pathname === '/api/sessions') {
    const activeWorkspace = getActiveWorkspace();
    const activeDirectory = activeWorkspace?.kind === 'ssh' ? path.join(activeWorkspace.storagePath, '.agent', 'sessions') : undefined;
    const sessions = Session.list({ directory: activeDirectory }).map((session) => ({
      ...session,
      running: isRunning(session.id) || activeSequences.has(session.id),
    }));
    const workspaceSessions = Object.fromEntries(listWorkspaces().map((workspace) => {
      if (workspace.active) return [workspace.id, sessions];
      const directory = workspace.kind === 'ssh' ? path.join(workspace.storagePath, '.agent', 'sessions') : path.join(workspace.path, '.agent', 'sessions');
      return [workspace.id, Session.list({ directory }).map((session) => ({
        ...session,
        running: isRunning(session.id) || activeSequences.has(session.id),
      }))];
    }));
    return json(res, 200, { sessions, workspaceSessions });
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
    const remoteWorkspace = getActiveWorkspace()?.kind === 'ssh' ? getActiveWorkspace() : null;
    const s = Session.create(body.title ?? '新会话', remoteWorkspace ? { directory: path.join(remoteWorkspace.storagePath, '.agent', 'sessions') } : {});
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
  if ((match = m(/^\/api\/session\/([\w-]+)\/tool\/([^/]+)\/retry-unsandboxed$/)) && req.method === 'POST') {
    const host = String(req.headers.host || '');
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '无沙箱重试仅允许本机应用操作' });
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return json(res, 403, { error: '无效来源' }); }
      if (origin.host !== host || !['http:', 'https:'].includes(origin.protocol)) return json(res, 403, { error: '无沙箱重试不允许跨站调用' });
    }
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (isRunning(s.id) || activeSequences.has(s.id) || agentManager.pending(s).length || hasActiveSandboxCommands()) return json(res, 409, { error: '会话或沙箱命令正在运行，请完成后再重试' });
    const body = await readBody(req);
    try {
      let callId;
      try { callId = decodeURIComponent(match[2]); } catch { return badRequest(res, '无效工具调用 ID'); }
      if (!callId || callId.length > 300) return badRequest(res, '无效工具调用 ID');
      const result = await retryBashWithoutSandbox(s, callId, { confirmed: body.confirmed, context: contextForSession(s) });
      return json(res, 200, result);
    } catch (error) { return json(res, error.status || 400, { error: error.message, code: error.code }); }
  }
  if (['/api/mcp/settings', '/api/mcp/test', '/api/mcp/auth', '/api/mcp/auth/status', '/api/mcp/auth/cancel', '/api/mcp/auth/browser'].includes(pathname) && ['GET', 'POST'].includes(req.method)) {
    const host = String(req.headers.host || '');
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) return json(res, 403, { error: 'MCP 配置仅允许本机访问' });
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return json(res, 403, { error: '无效来源' }); }
      if (origin.host !== host || !['http:', 'https:'].includes(origin.protocol)) return json(res, 403, { error: 'MCP 配置不允许跨站访问' });
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'MCP 配置不允许跨站访问' });
    if (req.method === 'GET') return pathname.endsWith('/settings') ? json(res, 200, publicMcpSettings(getConfig())) : badRequest(res, '请使用 POST 测试连接');
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: '需要 application/json' });
    if (!pathname.includes('/auth')) assertWorkspaceIdle();
    const body = await readBody(req), cfg = getConfig();
    try {
      if (pathname.endsWith('/auth/browser')) return json(res, 200, oauthBrowserJob(body.id));
      if (pathname.includes('/auth')) {
        const server = mcpServers(cfg).find(s => s.name === body.name);
        if (!server) return badRequest(res, '服务不存在');
        if (pathname.endsWith('/cancel')) return json(res, 200, cancelOAuth(server));
        if (pathname.endsWith('/status')) return json(res, 200, oauthStatus(server));
        await closeMcp(); beginOAuth(server, { force: true });
        return json(res, 200, oauthStatus(server));
      }
      if (pathname.endsWith('/test')) {
        const server = mcpServers(cfg).find(s => s.name === body.name);
        if (!server) return badRequest(res, '服务不存在');
        return json(res, 200, await testMcpServer(server));
      }
      const previous = cfg.mcp;
      cfg.mcp = updateMcpSettings(cfg, body);
      try { saveConfigFile(CONFIG_FILE); } catch (error) { cfg.mcp = previous; throw error; }
      await closeMcp();
      setLoopConfig(cfg);
      return json(res, 200, publicMcpSettings(cfg));
    } catch (error) { return badRequest(res, error.message); }
  }
  if (pathname === '/api/acp/settings' && ['GET', 'POST'].includes(req.method)) {
    const host = String(req.headers.host || '');
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) return json(res, 403, { error: 'ACP 配置仅允许本机访问' });
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return json(res, 403, { error: '无效来源' }); }
      if (origin.host !== host || !['http:', 'https:'].includes(origin.protocol)) return json(res, 403, { error: 'ACP 配置不允许跨站访问' });
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'ACP 配置不允许跨站访问' });
    if (req.method === 'GET') return json(res, 200, { agents: acpSettings(getConfig()) });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: '需要 application/json' });
    assertWorkspaceIdle();
    const body = await readBody(req), previous = getConfig().acp;
    try {
      getConfig().acp = updateAcpSettings(getConfig(), body);
      try { saveConfigFile(CONFIG_FILE); } catch (error) { getConfig().acp = previous; throw error; }
      return json(res, 200, { agents: acpSettings(getConfig()) });
    } catch (error) { return badRequest(res, error.message); }
  }
  if (pathname === '/api/acp/discover' && req.method === 'POST') {
    const host = String(req.headers.host || '');
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) return json(res, 403, { error: 'ACP 检测仅允许本机访问' });
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return json(res, 403, { error: '无效来源' }); }
      if (origin.host !== host || !['http:', 'https:'].includes(origin.protocol)) return json(res, 403, { error: 'ACP 检测不允许跨站访问' });
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'ACP 检测不允许跨站访问' });
    try {
      const agents = await discoverAcpAgents();
      return json(res, 200, { agents });
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
  if ((match = m(/^\/api\/session\/([\w-]+)\/goal$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (s.parentSessionId) return badRequest(res, '请从主任务设置目标');
    const body = await readBody(req);
    try {
      const goal = s.setGoal(body.text, body.status || 'active');
      emit('goal_updated', { sessionId: s.id, goal });
      return json(res, 200, { goal });
    } catch (error) { return badRequest(res, error.message); }
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
    const all = req.method === 'GET' && url.searchParams.get('all') === '1';
    if (paged && url.searchParams.has('before') && !/^\d+$/.test(url.searchParams.get('before'))) return badRequest(res, '无效历史游标');
  const activeWorkspace = getActiveWorkspace();
  const directory = activeWorkspace?.kind === 'ssh' ? path.join(activeWorkspace.storagePath, '.agent', 'sessions') : undefined;
    const s = paged || all ? (runningSessions.get(match[1]) || Session.loadLight(match[1], directory)) : getSessionOr400(res, match[1]); if (!s) { if (paged || all) notFound(res, '会话不存在'); return; }
    if (req.method === 'GET') {
      const group = agentManager.view(s);
      const ids = [group.rootSessionId, s.id, ...group.tasks.map(task => task.sessionId)].filter((id, index, all) => all.indexOf(id) === index);
      // Read live approval requests after the asynchronous worker snapshot.
      const contextWindow = agentManager.executionFor(s)?.context.modelSelection?.model?.contextWindow || cfg.provider?.contextWindow || 128000;
      const snapshot = paged || all ? await readSessionView(s.id, 'snapshot', { contextWindow, all, limit: url.searchParams.get('limit') || 120, before: url.searchParams.get('before') }, s.directory) : { ...s.snapshot(contextWindow), queue: s.queued() };
      if (!snapshot) return notFound(res, '会话不存在');
      if (!snapshot.meetingId && snapshot.expertId === 'meeting-secretary') snapshot.meetingId = listMeetings().find(meeting => meeting.summarySessionId === s.id)?.id || null;
      const permissions = ids.map(pendingRequest).filter(Boolean);
      return json(res, 200, { ...snapshot, running: isRunning(s.id) || activeSequences.has(s.id), activeStep: runningStep(s.id), eventSeq: eventSequence(), group: agentManager.view(s), permissions, permission: permissions[0] || null, uiRequests: ids.flatMap(pendingUiRequests) });
    }
    if (req.method === 'DELETE') {
      if (isRunning(s.id) || activeSequences.has(s.id) || agentManager.pending(s).length) return json(res, 409, { error: '任务或子任务正在运行，停止后才能删除' });
      if (s.parentSessionId) return json(res, 409, { error: '子会话作为主任务证据保留，请管理主任务' });
      Session.remove(s.id, directory);
      emit('session_deleted', { sessionId: s.id });
      return json(res, 200, { ok: true });
    }
    return notFound(res);
  }
  if (pathname === '/api/agent-profiles' && req.method === 'GET') return json(res, 200, { enabled: cfg.agent?.subagents?.enabled !== false, mode: 'dynamic', profiles: [], capabilities: Object.keys(swarmCapabilities) });
  if ((match = m(/^\/api\/session\/([\w-]+)\/mission$/))) {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (s.parentSessionId) return badRequest(res, '请从主任务管理目标要求');
    if (req.method === 'GET') return json(res, 200, { mission: agentManager.view(s).mission });
    if (req.method === 'POST') {
      const body = await readBody(req), context = contextForSession(s);
      try { return json(res, 200, { mission: withRunContext(context, () => agentManager.updateMission(s, body)) }); }
      catch (error) { return badRequest(res, error.message); }
    }
    return notFound(res);
  }
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
    const interrupted = interruptRunForAdjustment(s.id);
    emit('queue_updated', { sessionId: s.id, queue: s.queued() });
    return json(res, 200, { queue: s.queued(), interrupted });
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
    setPermissionMode(s, mode);
    emit('session_updated', { sessionId: s.id, mode });
    return json(res, 200, { mode });
  }
  if ((match = m(/^\/api\/session\/([\w-]+)\/desktop$/)) && req.method === 'POST') {
    const s = getSessionOr400(res, match[1]); if (!s) return;
    if (s.parentSessionId) return badRequest(res, '子 Agent 的工具权限由派发时决定');
    const body = await readBody(req);
    if (typeof body.enabled !== 'boolean') return badRequest(res, '无效桌面会话开关');
    const preferences = updateUiPreferences({ desktopEnabled: body.enabled });
    emit('ui_preferences_updated', preferences);
    return json(res, 200, { desktopEnabled: preferences.desktopEnabled });
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
    if ((body.kind === 'ssh' || getActiveWorkspace()?.kind === 'ssh') && !requireLocalApi(req, res, 'SSH 工作区')) return;
    const item = body.kind === 'ssh'
      ? await (async () => {
        const connection = getSshConnection(body.connectionId);
        if (!connection?.workspaceRoot || !listActiveSshConnections().some(value => value.id === body.connectionId)) throw new Error('请先连接 SSH 并设置远程项目目录');
        return addSshWorkspace({ connectionId: body.connectionId, remotePath: connection.workspaceRoot, name: body.name || connection.name }, { activate: false });
      })()
      : addWorkspace(body, { activate: false });
    s.moveToWorkspace(item.kind === 'ssh' ? item.storagePath : item.path);
    setActiveWorkspace(item.id);
    setSessionStorageRoot(item.kind === 'ssh' ? item.storagePath : undefined);
    if (item.kind === 'ssh') cfg.security.remoteWorkspaceId = item.id;
    else { setWorkspaceRoot(item.path); cfg.security.workspaceRoot = item.path; delete cfg.security.remoteWorkspaceId; }
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
  if (pathname === '/api/plugins/pi' && req.method === 'GET') return json(res, 200, { packages: listPiPackages(), runtime: pluginsInfo() });
  if (pathname === '/api/plugins/pi/install' && req.method === 'POST') {
    const body = await readBody(req);
    const result = await withPluginManagement(async () => { assertWorkspaceIdle(); return installPiPackage(body.source); });
    return json(res, 200, result);
  }
  if ((match = m(/^\/api\/plugins\/pi\/([a-f0-9]{20})$/)) && req.method === 'DELETE') {
    await withPluginManagement(async () => { assertWorkspaceIdle(); removePiPackage(match[1]); });
    return json(res, 200, { status: 'pending-reload' });
  }
  if (pathname === '/api/plugins/reload' && req.method === 'POST') {
    const info = await withPluginManagement(async () => {
      assertWorkspaceIdle();
      await disconnectChannels();
      const result = await loadAll({ reload: true });
      await initializeChannels();
      return result;
    });
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
