// core/permissions.mjs —— 四级权限引擎：分类 → 规则 → 模式 → 请求/响应协议
// L0 只读 | L1 工作区写 | L2 系统执行 | L3 敏感操作（桌面/外发）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { emit } from './events.mjs';
import { agentDataDir, getWorkspaceRoot } from './paths.mjs';

export const LEVEL_INFO = {
  L0: '只读',
  L1: '工作区写入',
  L2: '系统执行',
  L3: '敏感操作',
};

const pending = new Map();
const sessionRules = new Map();
function sessionKey(sessionId) { return JSON.stringify([getWorkspaceRoot(), sessionId]); }

function rulesFile() { return path.join(agentDataDir(), 'rules.json'); }

function loadRules() {
  try { return JSON.parse(fs.readFileSync(rulesFile(), 'utf8')); } catch { return { allow: [] }; }
}
function saveRules(rules) {
  fs.mkdirSync(path.dirname(rulesFile()), { recursive: true });
  fs.writeFileSync(rulesFile(), JSON.stringify(rules, null, 2));
}

function ruleKey(tool, pattern = '') {
  return JSON.stringify({ tool, pattern });
}

export function addSessionRule(sessionId, tool, pattern = '') {
  const key = sessionKey(sessionId);
  if (!sessionRules.has(key)) sessionRules.set(key, new Set());
  sessionRules.get(key).add(ruleKey(tool, pattern));
}

export function addPersistentRule(tool, pattern = '') {
  const rules = loadRules();
  if (!Array.isArray(rules.allow)) rules.allow = [];
  rules.allow.push({ tool, pattern, ts: Date.now() });
  saveRules(rules);
}

export function listPersistentRules() {
  return loadRules().allow ?? [];
}

export function replacePersistentRules(allow = []) {
  const cleaned = Array.isArray(allow) ? allow.filter((r) => r && typeof r.tool === 'string').map((r) => ({ tool: r.tool, pattern: String(r.pattern ?? ''), ts: r.ts ?? Date.now() })) : [];
  saveRules({ allow: cleaned });
  return cleaned;
}

function globToRegExp(pattern) {
  // 支持 'git *' 这种简易 glob；若已是正则（含 ^ 或 .*）则原样编译
  if (!pattern) return null;
  if (pattern.startsWith('^') || pattern.includes('.*')) {
    try { return new RegExp(pattern); } catch { return null; }
  }
  const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  try { return new RegExp('^' + esc); } catch { return null; }
}

function ruleMatch(rule, tool, argsStr) {
  if (rule.tool !== tool) return false;
  if (!rule.pattern) return true;
  const re = globToRegExp(rule.pattern);
  if (!re) return false;
  return re.test(argsStr);
}

function checkRules(session, tool, args, argsStr) {
  const sess = sessionRules.get(sessionKey(session.id));
  if (sess) {
    for (const key of sess) {
      try {
        const rule = JSON.parse(key);
        if (rule.tool === tool && rule.pattern === rememberPattern({ name: tool }, args)) return true;
      } catch { /* 旧格式 tool 或 tool|pattern */ }
      const [t, p] = key.includes('|') ? [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)] : [key, ''];
      if (ruleMatch({ tool: t, pattern: p }, tool, argsStr)) return true;
    }
  }
  for (const rule of loadRules().allow ?? []) {
    if (ruleMatch(rule, tool, argsStr)) return true;
  }
  return false;
}

function argsSummary(toolName, args) {
  if (toolName === 'bash') return String(args?.command ?? '');
  const s = JSON.stringify(args ?? {});
  return s.length > 400 ? s.slice(0, 400) + '…' : s;
}

export function isReadOnlyCommand(value) {
  const command = String(value ?? '').trim();
  if (!command || /[\r\n;&|><`$%(){}!^]/.test(command)) return false;
  const parts = command.match(/(?:"[^"]*"|'[^']*'|[^\s"']+)/g) || [];
  const name = parts.shift()?.toLowerCase();
  if (!name) return false;
  if (['pwd', 'ls', 'dir', 'where', 'which', 'type', 'cat', 'rg', 'grep', 'findstr', 'head', 'tail', 'wc'].includes(name)) {
    return !parts.some((part) => /^(?:-e|--exec|--pre|--post|--replace|--files-with-matches|--mmap|--no-ignore|-f|--file)(?:[=-]|$)/i.test(part));
  }
  if (name === 'git') return ['status', 'diff', 'log', 'show', 'rev-parse'].includes(parts[0]?.toLowerCase()) && !parts.slice(1).some((part) => /^--(?:output|ext-diff|textconv|exec-path)(?:=|$)/i.test(part));
  return false;
}

function rememberPattern(tool, args) {
  if (tool.name === 'bash') return String(args?.command ?? '').trim();
  if (['write_file', 'edit_file', 'office_edit'].includes(tool.name) && args?.path) return `path:${String(args.path)}`;
  return JSON.stringify(args ?? {});
}

function buildPreview(tool, args) {
  if (tool.name === 'write_file') {
    const body = String(args?.content ?? '');
    return { kind: 'diff', path: args?.path, after: body.slice(0, 4000) };
  }
  if (tool.name === 'edit_file') {
    return { kind: 'diff', path: args?.path, before: String(args?.old_string ?? '').slice(0, 2000), after: String(args?.new_string ?? '').slice(0, 2000) };
  }
  if (tool.name === 'office_edit') {
    return { kind: 'json', data: { action: args?.action, path: args?.path, replacements: args?.replacements, cells: args?.cells } };
  }
  return null;
}

/**
 * 权限裁决。返回 {ok, reason, decision}。
 * - ok=false 时调用方应把拒绝原因作为工具结果回灌给模型。
 */
export async function authorize({ session, tool, args, timeoutMs }) {
  const level = tool.permission ?? 'L0';
  const argsStr = argsSummary(tool.name, args);

  if (level === 'L0') return { ok: true, decision: 'auto' };

  if (level === 'L3' && tool.capability === 'desktop' && !session.desktopEnabled) {
    return { ok: false, reason: 'L3 敏感操作（桌面控制）未启用：请在侧边栏开启「桌面会话」后再试。', decision: 'blocked' };
  }

  if (tool.name === 'bash' && isReadOnlyCommand(args?.command)) return { ok: true, decision: 'auto' };

  const mode = session.mode;
  if (mode === 'auto-all' && (level === 'L1' || level === 'L2')) return { ok: true, decision: 'auto' };

  if (checkRules(session, tool.name, args, argsStr)) return { ok: true, decision: 'rule' };

  const reqId = crypto.randomUUID().slice(0, 12);
  const request = {
    reqId, sessionId: session.id, tool: tool.name,
    level, levelLabel: LEVEL_INFO[level] ?? level,
    summary: argsStr.slice(0, 500),
    sessionScope: tool.name === 'bash' ? '当前任务中完全相同的命令' : ['write_file', 'edit_file', 'office_edit'].includes(tool.name) && args?.path ? `当前任务中 ${tool.name} 操作 ${args.path}` : `当前任务中完全相同的 ${tool.name} 调用`,
    preview: buildPreview(tool, args),
  };
  const decisionP = new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(reqId);
      resolve('timeout');
    }, timeoutMs ?? 120000);
    pending.set(reqId, { resolve, timer, request });
  });
  emit('permission_request', {
    sessionId: session.id,
    request,
  });
  const decision = await decisionP;
  emit('permission_resolved', { sessionId: session.id, reqId, decision });

  const pattern = rememberPattern(tool, args);
  if (decision === 'allow') return { ok: true, decision };
  if (decision === 'allow_session') {
    addSessionRule(session.id, tool.name, pattern);
    return { ok: true, decision };
  }
  if (decision === 'allow_always') {
    addPersistentRule(tool.name, pattern);
    return { ok: true, decision };
  }
  return { ok: false, reason: `用户拒绝了本次 ${tool.name} 调用（decision=${decision}）`, decision };
}

export function resolveRequest(reqId, decision, sessionId) {
  const p = pending.get(reqId);
  if (!p || (sessionId && p.request.sessionId !== sessionId)) return false;
  clearTimeout(p.timer);
  pending.delete(reqId);
  p.resolve(decision);
  return true;
}

export function pendingCount() { return pending.size; }

export function pendingRequest(sessionId) {
  for (const item of pending.values()) if (item.request?.sessionId === sessionId) return item.request;
  return null;
}

export { globToRegExp, ruleMatch, argsSummary, rememberPattern, buildPreview };
