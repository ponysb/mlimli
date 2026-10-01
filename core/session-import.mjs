import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SKIP_DIRS = new Set(['node_modules', '.git', '.agent', 'logs']);
const SOURCES = [
  ['.mlimli/.agent-sessions', 'mli'],
  ['.agent-sessions', 'mli'],
  ['.workbuddy/.agent-sessions', 'workbuddy'],
  ['.workbuddy/sessions', 'workbuddy'],
  ['.codex/sessions', 'codex'],
  ['.claude/projects', 'claude'],
  ['.claude/sessions', 'claude'],
  ['.cursor/chats', 'cursor'],
  ['.cursor/projects', 'cursor'],
];

function walk(dir, depth = 0, out = []) {
  if (depth > 7 || !fs.existsSync(dir)) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.mlimli') continue;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), depth + 1, out);
    } else if (entry.isFile() && /\.jsonl?$/i.test(entry.name)) out.push(path.join(dir, entry.name));
  }
  return out;
}

export function discoverLegacySessions(root) {
  const found = new Map();
  for (const [relative, format] of SOURCES) {
    const directory = path.join(root, relative);
    for (const file of walk(directory)) found.set(path.resolve(file), { path: file, format });
  }
  return [...found.values()];
}

function textContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((part) => {
    if (typeof part === 'string') return part;
    if (part?.type === 'text' || part?.type === 'input_text' || part?.type === 'output_text') return part.text || part.content || '';
    return '';
  }).filter(Boolean).join('\n');
  if (value && typeof value === 'object') return textContent(value.text ?? value.content ?? value.message ?? '');
  return '';
}

function addMessage(out, role, content) {
  if (!['user', 'assistant'].includes(role)) return;
  const text = textContent(content).replace(/\0/g, '').trim();
  if (text) out.push({ role, text: text.slice(0, 12000) });
}

function extractMessages(value, out) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) extractMessages(item, out);
    return;
  }
  if (value.role && (value.content != null || value.text != null)) addMessage(out, value.role, value.content ?? value.text);
  if (value.message && typeof value.message === 'object') {
    const message = value.message;
    addMessage(out, message.role, message.content ?? message.text);
  }
  if (value.payload && typeof value.payload === 'object') {
    const payload = value.payload;
    addMessage(out, payload.role, payload.content ?? payload.text ?? payload.message);
    if (payload.message && typeof payload.message === 'object') addMessage(out, payload.message.role, payload.message.content ?? payload.message.text);
  }
  if (value.type === 'event_msg' && value.payload?.type === 'user_message') addMessage(out, 'user', value.payload.message ?? value.payload.text);
}

export function readLegacyTranscript(file, format = 'unknown') {
  let lines;
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { return { messages: [], fingerprint: '' }; }
  const messages = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try { extractMessages(JSON.parse(line), messages); } catch { /* 忽略损坏记录，保留可读的部分 */ }
    if (messages.length >= 160) break;
  }
  let fingerprint = '';
  try { const stat = fs.statSync(file); fingerprint = `${stat.size}:${stat.mtimeMs}`; } catch { /* 文件在扫描期间被移除 */ }
  return { messages, fingerprint, format };
}

function clip(value, length) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export function summarizeLegacyTranscript(messages, { format = 'unknown', source = '' } = {}) {
  const firstUser = messages.find((item) => item.role === 'user')?.text || '';
  const assistants = messages.filter((item) => item.role === 'assistant');
  const lastAssistant = assistants.at(-1)?.text || '';
  const recent = messages.slice(-6).map((item) => `${item.role === 'user' ? '用户' : 'Agent'}：${clip(item.text, 360)}`).join('\n');
  const files = [...new Set(messages.flatMap((item) => item.text.match(/(?:[A-Za-z]:[\\/]|\.\/?)[^\s"']+\.(?:js|mjs|ts|tsx|vue|md|json|html|css)/gi) || []))].slice(0, 12);
  const sourceLabel = { mli: '旧版 MLI Agent', workbuddy: 'WorkBuddy', codex: 'Codex', claude: 'Claude Code', cursor: 'Cursor' }[format] || '第三方 Agent';
  return [
    '## Summary（历史会话已导入）',
    `来源：${sourceLabel}${source ? ` · ${source}` : ''}`,
    `历史任务：${clip(firstUser, 900) || '未识别到用户任务'}`,
    `最近进展：${clip(lastAssistant, 900) || '未识别到 Agent 回复'}`,
    '',
    '## Recent Context',
    recent || '无可读取的文本消息',
    '',
    '## Files Mentioned',
    files.length ? files.join('、') : '无',
    '',
    '## Import Note',
    '以上内容由兼容层压缩为摘要，原始会话文件仍保留在工作目录中。后续消息会继续写入当前 Agent 会话格式。',
  ].join('\n').slice(0, 5200);
}

export function legacySessionId(file) {
  return `legacy-${crypto.createHash('sha1').update(path.resolve(file)).digest('hex').slice(0, 20)}`;
}

export function legacyTitle(messages, file, format) {
  const firstUser = messages.find((item) => item.role === 'user')?.text;
  const title = clip(firstUser, 56);
  if (title) return title;
  const prefix = { mli: '旧版会话', workbuddy: 'WorkBuddy 会话', codex: 'Codex 会话', claude: 'Claude Code 会话', cursor: 'Cursor 会话' }[format] || '历史会话';
  return `${prefix} · ${path.basename(file, path.extname(file))}`.slice(0, 60);
}
