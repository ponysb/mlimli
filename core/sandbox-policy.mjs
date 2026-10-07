// Approval policy and execution isolation are independent. Tool code cannot
// weaken this policy by supplying arguments or remembering an approval rule.
import { AsyncLocalStorage } from 'node:async_hooks';
import { getRunContext } from './run-context.mjs';

export const SANDBOX_DEFAULTS = Object.freeze({
  mode: 'workspace-write', backend: 'auto', networkAccess: false,
  dockerImage: 'mli-agent-sandbox:1',
  allowedDomains: Object.freeze([]),
});
let policy = { ...SANDBOX_DEFAULTS };
const execution = new AsyncLocalStorage();

export class SandboxError extends Error {
  constructor(message, code = 'SANDBOX_DENIED') { super(message); this.name = 'SandboxError'; this.code = code; }
}

export function normalizeSandboxPolicy(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SandboxError('沙箱配置必须是对象', 'SANDBOX_CONFIG');
  const next = { ...SANDBOX_DEFAULTS, ...value };
  if (!['workspace-write', 'read-only', 'off'].includes(next.mode)) throw new SandboxError('未知沙箱模式', 'SANDBOX_CONFIG');
  if (!['auto', 'windows-native', 'docker', 'bubblewrap', 'seatbelt'].includes(next.backend)) throw new SandboxError('未知沙箱后端', 'SANDBOX_CONFIG');
  if (typeof next.networkAccess !== 'boolean') throw new SandboxError('networkAccess 必须是布尔值', 'SANDBOX_CONFIG');
  if (typeof next.dockerImage !== 'string' || !/^[a-z0-9][a-z0-9._/:@-]{0,200}$/.test(next.dockerImage)) throw new SandboxError('容器镜像名称无效', 'SANDBOX_CONFIG');
  if (!Array.isArray(next.allowedDomains) || next.allowedDomains.length > 100 || next.allowedDomains.some(domain => typeof domain !== 'string' || domain.length > 253 || !/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?$/i.test(domain) || (domain.includes(':') && (+domain.split(':').at(-1) < 1 || +domain.split(':').at(-1) > 65535)))) throw new SandboxError('网络白名单必须是域名列表，可使用 *.example.com 和 :443，不允许 *', 'SANDBOX_CONFIG');
  return { mode: next.mode, backend: next.backend, networkAccess: next.networkAccess, dockerImage: next.dockerImage, allowedDomains: [...new Set(next.allowedDomains.map(domain => domain.toLowerCase()))] };
}
export function setSandboxPolicy(value) { policy = normalizeSandboxPolicy(value); return getSandboxPolicy(); }
export function getSandboxPolicy() { const value = execution.getStore() || getRunContext()?.sandboxPolicy || policy; return { ...value, allowedDomains: [...(value.allowedDomains || [])] }; }
export function toolSandboxPolicy() { return execution.getStore(); }
export function withSandboxPolicy(value, fn) { return execution.run(Object.freeze({ ...value }), fn); }

export const PRIVATE_DIRS = ['.agent', '.security', '.codex', '.ssh', '.aws', '.gnupg', 'partitions', 'session storage', 'local storage', 'indexeddb'];
export const READ_ONLY_DIRS = ['.git', '.agents'];
export function privateFile(name) {
  const lower = name.toLowerCase();
  return (/(^|\.)env(?:\.|$)/i.test(lower) && !/\.(example|sample|template)$/.test(lower)) ||
    ['.npmrc', '.pypirc', '.netrc'].includes(lower) || /\.(pem|key|p12|pfx)$/i.test(lower);
}
export function pathProtection(relative) {
  const parts = relative.replaceAll('\\', '/').split('/').filter(Boolean).map(part => part.toLowerCase());
  if (parts.length === 1 && parts[0] === 'config.json') return 'private';
  if (parts.some(part => PRIVATE_DIRS.includes(part) || privateFile(part))) return 'private';
  if (parts.some(part => READ_ONLY_DIRS.includes(part))) return 'read-only';
  return null;
}
