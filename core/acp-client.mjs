import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { APP_VERSION } from './version.mjs';
import { stopProcessTree } from './process-tree.mjs';
import { authorize, cancelRequests } from './permissions.mjs';
import { emit } from './events.mjs';
import { getRunContext } from './run-context.mjs';

const executions = new Map();
const execFileAsync = promisify(execFile);
const environmentKeys = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'USER', 'LOGNAME'];
let sdkPromise;

function loadAcpSdk() {
  sdkPromise ||= import('@agentclientprotocol/sdk');
  return sdkPromise;
}

// ACP has no OS-level registry. Discovery is therefore deliberately limited to
// known ACP entrypoints; ordinary agent CLIs are not treated as ACP clients.
export const ACP_DISCOVERY_CANDIDATES = Object.freeze([
  { id: 'opencode', name: 'OpenCode', entries: [{ command: 'opencode', args: ['acp'], kind: 'native' }] },
  { id: 'cursor', name: 'Cursor', entries: [{ command: 'cursor-agent', args: ['acp'], kind: 'native' }, { command: 'cursor-acp', args: [], kind: 'adapter' }] },
  { id: 'qoder', name: 'Qoder', entries: [{ command: 'qodercli', args: ['--acp'], kind: 'native' }, { command: 'qoderclicn', args: ['--acp'], kind: 'native' }] },
  { id: 'claude', name: 'Claude Code', entries: [{ command: 'claude-agent-acp', args: [], kind: 'adapter' }, { command: 'claude-code-cli-acp', args: [], kind: 'adapter' }] },
  { id: 'codex', name: 'Codex', entries: [{ command: 'codex-acp', args: [], kind: 'adapter' }] },
  { id: 'omp', name: 'Oh My Pi', entries: [{ command: 'omp-acp', args: [], kind: 'adapter' }] },
  { id: 'zcode', name: 'ZCode', entries: [{ command: 'zcode-acp-server', args: [], kind: 'adapter' }, { command: 'zcode-acp', args: [], kind: 'adapter' }] },
  { id: 'workbuddy', name: 'WorkBuddy', entries: [], unsupportedReason: '检测到的 ACP 实现使用本机 HTTP/SSE Gateway；MLI 当前仅支持 stdio ACP' },
  { id: 'trae', name: 'Trae', entries: [], unsupportedReason: '尚未确认官方 stdio ACP Agent 入口' },
]);

async function resolveDiscoveryCommand(command) {
  if (command.includes('/') || (process.platform === 'win32' && command.includes('\\'))) return command;
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(lookup, [command], { windowsHide: true, timeout: 3000, encoding: 'utf8' });
    const resolved = String(stdout).split(/\r?\n/).map(line => line.trim()).find(Boolean);
    return resolved || null;
  } catch {
    return null;
  }
}

async function probeAcpCandidate(candidate, timeoutMs = 5000) {
  const { client, ndJsonStream, PROTOCOL_VERSION } = await loadAcpSdk();
  const command = await resolveDiscoveryCommand(candidate.command);
  if (!command) return { ...candidate, status: 'not_found', kind: candidate.kind };
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const env = Object.fromEntries(environmentKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const child = spawn(command, candidate.args || [], { cwd: process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: useShell });
  let connection;
  let settled = false;
  let stderr = '';
  let timerId;
  child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-1000); });
  const failure = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => { if (!settled) reject(new Error(`ACP process exited (${code})${stderr ? `: ${stderr}` : ''}`)); });
  });
  failure.catch(() => {});
  try {
    connection = client({ name: 'mli-acp-discovery' })
      .connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout), { maxMessageBytes: 256 * 1024 }));
    const timer = new Promise((_, reject) => { timerId = setTimeout(() => reject(new Error('ACP initialize timed out')), timeoutMs); });
    timerId.unref?.();
    const initialized = await Promise.race([
      connection.agent.request('initialize', { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: 'mli-acp-discovery', version: APP_VERSION } }),
      failure,
      timer,
    ]);
    clearTimeout(timerId);
    if (initialized.protocolVersion !== PROTOCOL_VERSION) throw new Error(`Unsupported ACP protocol version: ${initialized.protocolVersion}`);
    settled = true;
    return { id: candidate.id, name: candidate.name, command, args: candidate.args || [], status: 'available', kind: candidate.kind, protocolVersion: initialized.protocolVersion, agentCapabilities: initialized.agentCapabilities || {} };
  } catch (error) {
    settled = true;
    return { id: candidate.id, name: candidate.name, command, args: candidate.args || [], status: 'invalid', kind: candidate.kind, error: error.message };
  } finally {
    if (timerId) clearTimeout(timerId);
    connection?.close();
    if (child.exitCode === null && !child.killed) child.kill();
    await Promise.race([once(child, 'exit').catch(() => {}), new Promise(resolve => setTimeout(resolve, 250))]);
    child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
  }
}

async function probeAcpAgent(candidate, timeoutMs) {
  if (candidate.unsupportedReason) return { id: candidate.id, name: candidate.name, status: 'unsupported', reason: candidate.unsupportedReason };
  const attempts = [];
  for (const entry of candidate.entries) {
    const result = await probeAcpCandidate({ id: candidate.id, name: candidate.name, ...entry }, timeoutMs);
    if (result.status === 'available') return result;
    attempts.push({ command: entry.command, args: entry.args, status: result.status, ...(result.error ? { error: result.error } : {}) });
  }
  const invalid = attempts.find(attempt => attempt.status === 'invalid');
  return { id: candidate.id, name: candidate.name, status: invalid ? 'invalid' : 'not_found', attempts, ...(invalid?.error ? { error: invalid.error } : {}) };
}

export async function discoverAcpAgents({ candidates = ACP_DISCOVERY_CANDIDATES, timeoutMs = 5000 } = {}) {
  if (!Array.isArray(candidates) || candidates.length > 16) throw new Error('ACP discovery candidates are invalid');
  return Promise.all(candidates.map(candidate => {
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.name !== 'string') throw new Error('ACP discovery candidate is invalid');
    // Retain the flat form for callers/tests that supply an ad-hoc candidate.
    const normalized = candidate.entries ? candidate : { id: candidate.id, name: candidate.name, entries: [{ command: candidate.command, args: candidate.args, kind: candidate.kind }] };
    if (!Array.isArray(normalized.entries) || normalized.entries.some(entry => !entry || typeof entry.command !== 'string' || !Array.isArray(entry.args))) throw new Error('ACP discovery candidate is invalid');
    return probeAcpAgent(normalized, timeoutMs);
  }));
}

export function externalAgents(config = {}) {
  const agents = config.acp?.agents ?? [];
  if (!Array.isArray(agents) || agents.length > 32) throw new Error('acp.agents 必须是最多 32 个 Agent 的数组');
  const ids = new Set();
  return agents.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('ACP Agent ID 无效或重复');
    ids.add(item.id);
    if (typeof item.command !== 'string' || !item.command.trim() || /[\0\r\n]/.test(item.command)) throw new Error('ACP command 必须是可执行文件，而不是 shell 命令');
    if (item.args !== undefined && (!Array.isArray(item.args) || item.args.some(arg => typeof arg !== 'string' || arg.includes('\0')))) throw new Error('ACP args 必须是字符串数组');
    if (item.env !== undefined && (!item.env || typeof item.env !== 'object' || Array.isArray(item.env) || Object.entries(item.env).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string' || value.includes('\0')))) throw new Error('ACP env 必须是字符串环境变量对象');
    const timeoutMs = item.timeoutMs ?? 600000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 86400000) throw new Error('ACP timeoutMs 必须是 100–86400000 毫秒');
    return { id: item.id, name: String(item.name || item.id).slice(0, 120), command: item.command, args: item.args || [], env: item.env || {}, timeoutMs };
  });
}

export function publicExternalAgents(config) {
  return externalAgents(config).map(({ id, name, timeoutMs }) => ({ id, name, timeoutMs, profile: 'worker', sandbox: 'external-agent-owned' }));
}

export async function callExternalAgent(definition, { cwd, prompt, signal, onUpdate = () => {}, onPermission = async () => ({ outcome: { outcome: 'cancelled' } }) }) {
  if (signal?.aborted) throw new Error('ACP task cancelled');
  const { client, ndJsonStream, PROTOCOL_VERSION } = await loadAcpSdk();
  const env = Object.fromEntries(environmentKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const child = spawn(definition.command, definition.args, { cwd, env: { ...env, ...definition.env }, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true, shell: false });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
  let rejectFailure;
  const failure = new Promise((resolve, reject) => { rejectFailure = reject; });
  failure.catch(() => {});
  child.on('error', error => rejectFailure(error));
  child.on('exit', code => rejectFailure(new Error(`ACP Agent exited (${code}): ${stderr}`)));
  let connection;
  let sessionId;
  let output = '';
  const abort = () => rejectFailure(new Error('ACP task cancelled'));
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => rejectFailure(new Error(`ACP Agent timed out (${definition.timeoutMs}ms)`)), definition.timeoutMs);
  let startupTimer;
  try {
    connection = client({ name: 'mli-agent' })
      .onNotification('session/update', ({ params }) => {
        if (!sessionId || params.sessionId !== sessionId || signal?.aborted) return;
        const update = params.update;
        if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') output = (output + update.content.text).slice(-64000);
        try { onUpdate(update); } catch (error) { rejectFailure(error); }
      })
      .onRequest('session/request_permission', async ({ params }) => {
        if (!sessionId || params.sessionId !== sessionId || signal?.aborted) return { outcome: { outcome: 'cancelled' } };
        try {
          const response = await Promise.race([onPermission(params), failure]);
          if (signal?.aborted) return { outcome: { outcome: 'cancelled' } };
          const selected = response?.outcome;
          if (selected?.outcome === 'selected' && params.options.some(option => option.optionId === selected.optionId && ['allow_once', 'reject_once'].includes(option.kind))) return response;
        } catch {}
        return { outcome: { outcome: 'cancelled' } };
      })
      .connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout), { maxMessageBytes: 2 * 1024 * 1024 }));
    connection.closed.then(() => rejectFailure(new Error('ACP connection closed before task completion')));
    startupTimer = setTimeout(() => rejectFailure(new Error('ACP initialization timed out')), 30000);
    const initialized = await Promise.race([connection.agent.request('initialize', { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: 'mli-agent', version: APP_VERSION } }), failure]);
    if (initialized.protocolVersion !== PROTOCOL_VERSION) throw new Error(`Unsupported ACP protocol version: ${initialized.protocolVersion}`);
    const created = await Promise.race([connection.agent.request('session/new', { cwd, mcpServers: [] }), failure]);
    sessionId = created.sessionId;
    clearTimeout(startupTimer);
    const response = await Promise.race([connection.agent.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }), failure]);
    if (response.stopReason !== 'end_turn') throw new Error(`ACP task did not complete: ${response.stopReason}`);
    return { text: output, externalSessionId: sessionId, stopReason: response.stopReason };
  } finally {
    clearTimeout(timer);
    clearTimeout(startupTimer);
    signal?.removeEventListener('abort', abort);
    if (sessionId && connection && !connection.signal.aborted) {
      await Promise.race([connection.agent.notify('session/cancel', { sessionId }).catch(() => {}), new Promise(resolve => setTimeout(resolve, 100))]);
    }
    connection?.close();
    const exited = child.exitCode !== null || child.signalCode ? Promise.resolve() : once(child, 'exit').catch(() => {});
    stopProcessTree(child);
    const killTimer = setTimeout(() => stopProcessTree(child, 'SIGKILL'), 500);
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1000))]);
    clearTimeout(killTimer);
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
}

export function stopExternalAgent(sessionId) {
  const execution = executions.get(sessionId);
  if (!execution) return false;
  execution.abort();
  cancelRequests(sessionId);
  return true;
}

export async function runExternalAgent(session, prompt) {
  const context = getRunContext();
  const definition = externalAgents(context.config).find(item => item.id === context.externalAgentId);
  if (!definition) throw new Error('ACP Agent 不在受信任配置中');
  const controller = new AbortController();
  executions.set(session.id, controller);
  const timeoutMs = context.config.security?.permissionTimeoutMs;
  let updates = 0;
  const record = entry => { if (updates++ < 2000) session.append(entry); };
  try {
    const permission = await authorize({ session: { ...session, mode: 'default' }, tool: { name: 'acp_launch', permission: 'L3' }, args: { warning: '外部 Agent 不受 MLI 沙箱限制，可能访问宿主文件、网络及其自身凭据', agent: definition.id, command: definition.command, args: definition.args, cwd: context.executionRoot }, timeoutMs, allowRemember: false });
    if (!permission.ok || controller.signal.aborted) throw new Error('外部 ACP Agent 启动已拒绝或取消');
    session.append({ type: 'message', role: 'user', content: prompt, source: 'acp' });
    const result = await callExternalAgent(definition, {
      cwd: context.executionRoot, prompt, signal: controller.signal,
      onUpdate(update) {
        if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') emit('text_delta', { sessionId: session.id, text: update.content.text, source: 'acp' });
        else if (update.sessionUpdate === 'agent_thought_chunk' && update.content.type === 'text') emit('thinking_delta', { sessionId: session.id, text: update.content.text, source: 'acp' });
        else if (update.sessionUpdate === 'tool_call') emit('tool_call', { sessionId: session.id, call: { id: update.toolCallId, name: update.title || 'ACP tool', args: update.rawInput }, source: 'acp' });
        else if (update.sessionUpdate === 'tool_call_update' && ['completed', 'failed'].includes(update.status)) emit('tool_result', { sessionId: session.id, callId: update.toolCallId, status: update.status === 'completed' ? 'ok' : 'error', content: JSON.stringify(update.content || []).slice(0, 16000), source: 'acp' });
        record({ type: 'acp_update', source: 'acp', content: JSON.stringify(update).slice(0, 16000) });
      },
      async onPermission(params) {
        const allow = params.options.find(option => option.kind === 'allow_once');
        if (!allow) return { outcome: { outcome: 'cancelled' } };
        const decision = await authorize({ session: { ...session, mode: 'default' }, tool: { name: 'acp_permission', permission: 'L3' }, args: { warning: '外部 Agent 请求；允许仅对本次操作生效', agent: definition.id, toolCall: params.toolCall }, timeoutMs, allowRemember: false });
        return controller.signal.aborted || !decision.ok ? { outcome: { outcome: 'cancelled' } } : { outcome: { outcome: 'selected', optionId: allow.optionId } };
      },
    });
    session.append({ type: 'message', role: 'assistant', text: result.text, content: result.text, source: 'acp' });
    session.append({ type: 'task_summary', reason: 'done', summaryText: result.text || '外部 Agent 返回 end_turn（无文本结果）', source: 'acp', externalSessionId: result.externalSessionId, verification: 'external-agent-reported; not independently verified', files: [], artifacts: [] });
    emit('turn_end', { sessionId: session.id, reason: 'done' });
  } catch (error) {
    session.append({ type: 'task_summary', reason: controller.signal.aborted ? 'aborted' : 'error', error: error.message, summaryText: error.message, source: 'acp' });
    throw error;
  } finally {
    controller.abort();
    cancelRequests(session.id);
    executions.delete(session.id);
  }
}
