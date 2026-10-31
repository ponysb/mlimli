import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_ROOT } from './paths.mjs';

const storeFile = path.join(DATA_ROOT, '.security', 'ssh', 'connections.json');

function readStore() {
  try {
    const value = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    return Array.isArray(value.connections) ? value : { connections: [] };
  } catch { return { connections: [] }; }
}

function writeStore(value) {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true, mode: 0o700 });
  try { fs.chmodSync(path.dirname(storeFile), 0o700); } catch {}
  const temporary = `${storeFile}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { fs.chmodSync(temporary, 0o600); } catch {}
  fs.renameSync(temporary, storeFile);
}

function validHost(value) {
  const host = String(value || '').trim();
  if (!host || host.length > 253 || /[\s\x00-\x1f\x7f/@?#]/.test(host)) throw new Error('SSH 主机名无效');
  return host;
}

function normalize(input, previous = {}) {
  const name = String(input.name ?? previous.name ?? '').trim();
  const username = String(input.username ?? previous.username ?? '').trim();
  const authMode = input.authMode ?? previous.authMode ?? 'agent';
  const privateKeyPath = String(input.privateKeyPath ?? previous.privateKeyPath ?? '').trim();
  const agentSocket = String(input.agentSocket ?? previous.agentSocket ?? '').trim();
  const port = Number(input.port ?? previous.port ?? 22);
  const host = validHost(input.host ?? previous.host);
  const sameTarget = previous.host === host && previous.port === port;
  if (!name || name.length > 80) throw new Error('连接名称必须为 1–80 个字符');
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(username)) throw new Error('SSH 用户名格式无效');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SSH 端口必须在 1–65535 之间');
  if (!['agent', 'key', 'password'].includes(authMode)) throw new Error('请选择 SSH Agent、私钥文件或登录密码认证');
  if (authMode === 'key' && (!path.isAbsolute(privateKeyPath) || privateKeyPath.length > 2048)) throw new Error('私钥路径必须是本机绝对路径');
  if (authMode === 'agent' && agentSocket && (!path.isAbsolute(agentSocket) || agentSocket.length > 2048)) throw new Error('SSH Agent Socket 路径无效');
  return {
    id: previous.id || crypto.randomUUID().slice(0, 12), name,
    host, port, username, authMode,
    ...(authMode === 'key' ? { privateKeyPath } : {}),
    ...(authMode === 'agent' && agentSocket ? { agentSocket } : {}),
    hostKeyFingerprint: sameTarget ? previous.hostKeyFingerprint || null : null,
    workspaceRoot: sameTarget ? previous.workspaceRoot || null : null,
    createdAt: previous.createdAt || Date.now(), updatedAt: Date.now(),
  };
}

export function listSshConnections() {
  return readStore().connections.map(({ id, name, host, port, username, authMode, hostKeyFingerprint, workspaceRoot, createdAt, updatedAt }) => ({
    id, name, host, port, username, authMode, hostKeyFingerprint, workspaceRoot: workspaceRoot || null, createdAt, updatedAt,
  }));
}

export function getSshConnection(id) {
  return readStore().connections.find(item => item.id === id) || null;
}

export function saveSshConnection(input = {}) {
  const store = readStore();
  const previous = input.id ? store.connections.find(item => item.id === input.id) : null;
  if (input.id && !previous) throw new Error('SSH 连接不存在');
  const item = normalize(input, previous || {});
  store.connections = previous
    ? store.connections.map(value => value.id === item.id ? item : value)
    : [...store.connections, item];
  writeStore(store);
  return listSshConnections().find(value => value.id === item.id);
}

export function confirmSshHostKey(id, fingerprint, observedFingerprint) {
  if (!fingerprint || fingerprint !== observedFingerprint) throw new Error('主机指纹与刚才观察到的指纹不一致，请重新检查');
  const store = readStore();
  const item = store.connections.find(value => value.id === id);
  if (!item) throw new Error('SSH 连接不存在');
  item.hostKeyFingerprint = fingerprint;
  item.updatedAt = Date.now();
  writeStore(store);
  return listSshConnections().find(value => value.id === id);
}

export function setSshWorkspaceRoot(id, workspaceRoot) {
  const store = readStore();
  const item = store.connections.find(value => value.id === id);
  if (!item) throw new Error('SSH 连接不存在');
  const root = String(workspaceRoot || '').trim();
  if (!root || root.length > 4096 || !root.startsWith('/') || root.includes('\\') || root.includes('\0')) throw new Error('远程工作区必须是有效的 POSIX 绝对路径');
  item.workspaceRoot = root.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  item.updatedAt = Date.now();
  writeStore(store);
  return listSshConnections().find(value => value.id === id);
}

export function deleteSshConnection(id) {
  const store = readStore(), count = store.connections.length;
  store.connections = store.connections.filter(item => item.id !== id);
  if (store.connections.length === count) return false;
  writeStore(store);
  return true;
}

export function sshConnectionStorePath() { return storeFile; }
