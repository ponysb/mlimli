import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { getSshConnection } from './ssh-connection-store.mjs';

const require = createRequire(import.meta.url);
const active = new Map();
const terminalEvents = new EventEmitter();
const MAX_OUTPUT_CHUNKS = 4000;
const MAX_PRIVATE_KEY_BYTES = 256 * 1024;
let SshClient;

function sshClient() {
  if (!SshClient) SshClient = require('ssh2').Client;
  return new SshClient();
}

function hostFingerprint(key) {
  return `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

function clientOptions(connection, { hostVerifier, passphrase, password } = {}) {
  const options = {
    host: connection.host,
    port: connection.port,
    username: connection.username,
    hostVerifier,
    readyTimeout: 12000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 3,
    agentForward: false,
    sock: undefined,
    tryKeyboard: false,
  };
  if (connection.authMode === 'password') {
    if (typeof password !== 'string' || !password) throw new Error('请输入服务器登录密码（不是私钥口令）');
    options.password = password;
  } else if (connection.authMode === 'key') {
    const stat = fs.statSync(connection.privateKeyPath);
    if (!stat.isFile() || stat.size > MAX_PRIVATE_KEY_BYTES) throw new Error('私钥文件不存在或超过 256 KB');
    options.privateKey = fs.readFileSync(connection.privateKeyPath);
    if (passphrase) options.passphrase = String(passphrase);
  } else {
    const agent = connection.agentSocket || process.env.SSH_AUTH_SOCK || (process.platform === 'win32' ? 'pageant' : '');
    if (!agent) throw new Error('未找到 SSH Agent，请启动系统 Agent 或配置 Agent Socket');
    options.agent = agent;
  }
  return options;
}

export function sshConnectionError(authMode, error) {
  if (error.level === 'client-authentication' || /All configured authentication methods failed/.test(error.message || '')) {
    const hint = authMode === 'password'
      ? '登录密码未被服务器接受。请核对用户名和密码，并确认服务器允许密码登录；部分服务器禁止 root 密码登录。'
      : authMode === 'key'
        ? '私钥未被服务器接受。请核对用户名、私钥文件和私钥口令，并确认对应公钥已添加到服务器 authorized_keys。'
        : 'SSH Agent 中的密钥未被服务器接受。请确认 Agent 已加载该服务器的密钥（ssh-add -l）；若平时用密码登录，请切换为“登录密码”。';
    return `SSH 认证失败：${hint}`;
  }
  if (/Host denied/.test(error.message || '')) return 'SSH 主机指纹校验失败，请重新检查服务器身份。';
  return `SSH 连接失败：${error.message}`;
}

function connectClient(client, options, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('SSH 握手超时')), timeoutMs);
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      client.removeListener('ready', onReady);
      client.removeListener('error', onError);
      if (error) reject(error); else resolve(value);
    };
    const onReady = () => finish(null, client);
    const onError = error => finish(error);
    client.once('ready', onReady);
    client.once('error', onError);
    try { client.connect(options); } catch (error) { finish(error); }
  });
}

export async function inspectSshHost(id) {
  const connection = getSshConnection(id);
  if (!connection) throw new Error('SSH 连接不存在');
  const client = sshClient();
  let observed = null;
  const options = {
    host: connection.host, port: connection.port, username: connection.username,
    readyTimeout: 10000, tryKeyboard: false, agentForward: false,
    hostVerifier(key) {
      observed = hostFingerprint(Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex'));
      queueMicrotask(() => client.end());
      return false;
    },
  };
  try { await connectClient(client, options, 11000); }
  catch (error) {
    if (!observed) throw new Error(error.message === 'Timed out while waiting for handshake' ? 'SSH 主机握手超时' : `SSH 主机探测失败：${error.message}`);
  } finally { try { client.end(); } catch {} }
  if (!observed) throw new Error('未收到 SSH 主机指纹');
  return { fingerprint: observed, trusted: observed === connection.hostKeyFingerprint, changed: Boolean(connection.hostKeyFingerprint && observed !== connection.hostKeyFingerprint) };
}

function cleanupConnection(id, session, signal = 'SSH_DISCONNECTED') {
  if (session.closed) return;
  session.closed = true;
  for (const terminal of session.terminals.values()) {
    terminal.status = 'exited';
    try { terminal.stream.close(); } catch {}
    terminalEvents.emit('event', { type: 'terminal_exit', terminalId: terminal.id, code: null, signal, interactive: true });
  }
  try { session.sftpChannel?.end(); } catch {}
  session.sftpChannel = null;
  session.terminals.clear();
  if (active.get(id) === session) active.delete(id);
  terminalEvents.emit('event', { type: 'ssh_connection_status', connectionId: id, connected: false, signal });
}

export async function connectSsh(id, { passphrase, password } = {}) {
  const connection = getSshConnection(id);
  if (!connection) throw new Error('SSH 连接不存在');
  if (!connection.hostKeyFingerprint) throw new Error('请先检查并确认 SSH 主机指纹');
  const existing = active.get(id);
  if (existing && !existing.closed) return { id, connected: true };
  const client = sshClient();
  const session = { client, terminals: new Map(), closed: false };
  const options = clientOptions(connection, { passphrase, password, hostVerifier(key) {
    const actual = hostFingerprint(Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex'));
    return actual === connection.hostKeyFingerprint;
  } });
  try { await connectClient(client, options); }
  catch (error) { try { client.end(); } catch {} throw new Error(sshConnectionError(connection.authMode, error)); }
  active.set(id, session);
  client.on('error', () => cleanupConnection(id, session));
  client.on('end', () => cleanupConnection(id, session));
  client.on('close', () => cleanupConnection(id, session));
  terminalEvents.emit('event', { type: 'ssh_connection_status', connectionId: id, connected: true });
  return { id, connected: true };
}

export function listActiveSshConnections() {
  return [...active].filter(([, session]) => !session.closed).map(([id]) => ({ id }));
}

export function getSshSessionClient(id) {
  const session = active.get(id);
  if (!session || session.closed) throw new Error('SSH 尚未连接');
  return session.client;
}

export function getSshSftpClient(id) {
  const session = active.get(id);
  if (!session || session.closed) return Promise.reject(new Error('SSH 尚未连接'));
  if (session.sftpChannel) return session.sftpChannel;
  session.sftpChannel = new Promise((resolve, reject) => {
    session.client.sftp((error, sftp) => {
      if (error) { session.sftpChannel = null; reject(error); return; }
      if (session.closed) { sftp.end(); reject(new Error('SSH 连接已关闭')); return; }
      session.sftpChannel = sftp;
      resolve(sftp);
    });
  });
  return session.sftpChannel;
}

export function startSshTerminal(id, { cols = 120, rows = 32, cwd } = {}) {
  const session = active.get(id), connection = getSshConnection(id);
  if (!session || session.closed || !connection) throw new Error('SSH 尚未连接');
  const terminalId = crypto.randomUUID().slice(0, 12);
  const safeCols = Math.max(20, Math.min(500, Number(cols) || 120));
  const safeRows = Math.max(5, Math.min(200, Number(rows) || 32));
  const terminal = { id: terminalId, stream: null, status: 'starting', output: [], startedAt: Date.now() };
  session.terminals.set(terminalId, terminal);
    session.client.shell({ term: 'xterm-256color', cols: safeCols, rows: safeRows, modes: { ECHO: 1, ICANON: 1, ISIG: 1 } }, (error, stream) => {
    if (error || session.closed) {
      session.terminals.delete(terminalId);
      terminalEvents.emit('event', { type: 'terminal_exit', terminalId, code: null, signal: 'SSH_PTY_FAILED', interactive: true });
      return;
    }
    terminal.stream = stream; terminal.status = 'running';
    terminalEvents.emit('event', { type: 'terminal_started', terminalId, cwd: cwd || connection.workspaceRoot || connection.host, connectionId: id, connectionName: connection.name, interactive: true });
    stream.on('data', data => {
      if (terminal.status !== 'running') return;
      const text = Buffer.from(data).toString('utf8');
      if (!text) return;
      terminal.output.push(text);
      if (terminal.output.length > MAX_OUTPUT_CHUNKS) terminal.output.shift();
      terminalEvents.emit('event', { type: 'terminal_output', terminalId, stream: 'stdout', text, interactive: true });
    });
    stream.on('close', (code, signal) => {
      if (terminal.status === 'exited') return;
      terminal.status = 'exited'; session.terminals.delete(terminalId);
      terminalEvents.emit('event', { type: 'terminal_exit', terminalId, code: code ?? null, signal: signal || null, interactive: true });
    });
    if (cwd) stream.write(`cd -- '${String(cwd).replaceAll("'", "'\\''")}'\n`);
  });
  return { terminalId, cwd: cwd || connection.workspaceRoot || connection.host, connectionId: id, connectionName: connection.name, interactive: true };
}

export function writeSshTerminal(id, terminalId, data) {
  const terminal = active.get(id)?.terminals.get(terminalId);
  if (!terminal || terminal.status !== 'running') return false;
  terminal.stream.write(String(data || ''));
  return true;
}

export function resizeSshTerminal(id, terminalId, cols, rows) {
  const terminal = active.get(id)?.terminals.get(terminalId);
  if (!terminal || terminal.status !== 'running') return false;
  terminal.stream.setWindow(Math.max(5, Math.min(200, Number(rows) || 32)), Math.max(20, Math.min(500, Number(cols) || 120)), 0, 0);
  return true;
}

export function stopSshTerminal(id, terminalId) {
  const session = active.get(id), terminal = session?.terminals.get(terminalId);
  if (!terminal || terminal.status !== 'running') return false;
  terminal.status = 'stopping';
  try { terminal.stream.write('\u0003'); } catch {}
  setTimeout(() => {
    if (terminal.status === 'exited') return;
    try { terminal.stream.close(); } catch {}
    session.terminals.delete(terminalId); terminal.status = 'exited';
    terminalEvents.emit('event', { type: 'terminal_exit', terminalId, code: null, signal: 'STOPPED', interactive: true });
  }, 500).unref();
  return true;
}

export function closeSshConnection(id) {
  const session = active.get(id);
  if (!session) return false;
  cleanupConnection(id, session, 'SSH_DISCONNECTED');
  try { session.client.end(); } catch {}
  return true;
}

export function shutdownSshRuntime() {
  for (const id of active.keys()) closeSshConnection(id);
}

export function onSshTerminalEvent(listener) { terminalEvents.on('event', listener); return () => terminalEvents.off('event', listener); }

export function sshFingerprint(key) { return hostFingerprint(key); }
