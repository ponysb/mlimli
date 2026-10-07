import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalPath, isInside } from './paths.mjs';

const MAX_STORED_CHARS = 1024 * 1024;
const MAX_TURN_STORED_CHARS = 4 * MAX_STORED_CHARS;

function outputDirectory(directory, sessionId) {
  if (!/^[\w-]+$/.test(String(sessionId))) throw new Error('无效会话 ID');
  const root = path.resolve(directory), target = path.join(root, `${sessionId}-tool-outputs`);
  if (!isInside(canonicalPath(target), canonicalPath(root))) throw new Error('输出存储路径越界');
  return target;
}
function outputFile(session, outputId) {
  if (!/^[a-f0-9]{32}$/.test(String(outputId))) throw new Error('无效 outputId');
  const directory = outputDirectory(path.dirname(session.file), session.id);
  const target = path.join(directory, `${outputId}.txt`);
  if (!isInside(canonicalPath(target), canonicalPath(directory))) throw new Error('输出文件路径越界');
  return target;
}
export function removeToolOutputs(directory, sessionId) {
  fs.rmSync(outputDirectory(directory, sessionId), { recursive: true, force: true });
}
export function copyToolOutputs(source, target) {
  for (const entry of source.chain().filter(item => item.type === 'tool_output' && !item.storedContent)) {
    const file = outputFile(source, entry.outputId);
    if (!fs.existsSync(file)) continue;
    const destination = outputFile(target, entry.outputId);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file, destination, fs.constants.COPYFILE_EXCL);
  }
}

export function toolResultText(result = {}) {
  if (typeof result.content === 'string') return result.content;
  if (Array.isArray(result.content)) return result.content.filter(part => part?.type === 'text').map(part => part.text || '').join('\n');
  return result.content == null ? '' : typeof result.content === 'object' ? JSON.stringify(result.content) : String(result.content);
}

export function toolResultState(result = {}) {
  const state = { status: result.status || 'ok' };
  if (Number.isInteger(result.exitCode)) state.exitCode = result.exitCode;
  // Only small, explicit state fields; output/DOM and arbitrary metadata stay in the body.
  for (const key of ['exit_code', 'return_code', 'done', 'terminated', 'truncated', 'reward']) {
    const value = result.structuredContent?.[key];
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) state[key] = value;
  }
  return state;
}

function preview(text, limit) {
  if (text.length <= limit) return text;
  const marker = `\n…[正文中间已省略，原始 ${text.length} 字符]…\n`;
  const length = Math.max(0, limit - marker.length), head = Math.ceil(length * 0.6);
  return text.slice(0, head) + marker + text.slice(text.length - (length - head));
}

export function prepareToolOutput(session, result, { turnId, maxChars = 12000 } = {}) {
  const text = toolResultText(result), state = toolResultState(result);
  const limit = Math.max(2000, Math.min(64000, Number(maxChars) || 12000));
  let output;
  if (text.length > limit && session) {
    const used = session.entries().filter(entry => entry.type === 'tool_output' && entry.turnId === turnId).reduce((total, entry) => total + entry.storedChars, 0);
    const storedContent = text.slice(0, Math.max(0, Math.min(MAX_STORED_CHARS, MAX_TURN_STORED_CHARS - used)));
    if (storedContent) {
      output = { outputId: crypto.randomBytes(16).toString('hex'), originalChars: text.length, storedChars: storedContent.length, sha256: crypto.createHash('sha256').update(storedContent).digest('hex') };
      const file = outputFile(session, output.outputId);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, storedContent, { flag: 'wx', mode: 0o600 });
      // Only the reference is in the transcript/API; large bodies never enter UI snapshots.
      session.append({ type: 'tool_output', turnId, ...output });
    }
  }
  const header = `[工具执行状态] ${JSON.stringify(state)}\n`;
  const hint = output ? `\n[长输出可用 read_tool_output 回读：outputId=${output.outputId}，offset=0，limit=4000；已保存 ${output.storedChars}/${output.originalChars} 字符${output.storedChars < output.originalChars ? '，超限部分未保存，请重新定向查询' : ''}]`
    : text.length > limit ? '\n[正文已裁剪；本轮输出存储预算不足或无会话，请重新缩小查询范围]' : '';
  return { content: header + preview(text, Math.max(0, limit - header.length - hint.length)) + hint, state, output };
}

export function readToolOutput(session, { outputId, offset = 0, limit = 4000 } = {}) {
  if (!session || !/^[a-f0-9]{32}$/.test(String(outputId))) throw new Error('无效的当前会话 outputId');
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 8000) throw new Error('offset 必须为非负整数，limit 范围 1–8000');
  const entry = session.entries().find(item => item.type === 'tool_output' && item.outputId === outputId);
  if (!entry) throw new Error('当前会话不存在该输出；不能读取其他会话或任意路径');
  // Compatibility with the initial append-only inline format.
  const storedContent = entry.storedContent ?? fs.readFileSync(outputFile(session, outputId), 'utf8');
  if (storedContent.length !== entry.storedChars || crypto.createHash('sha256').update(storedContent).digest('hex') !== entry.sha256) throw new Error('保存的工具输出已改变或损坏，请重新检查来源');
  const text = storedContent.slice(offset, offset + limit);
  const nextOffset = offset + text.length;
  const state = { outputId, offset, nextOffset: nextOffset < entry.storedChars ? nextOffset : null, originalChars: entry.originalChars, storedChars: entry.storedChars, storageComplete: entry.originalChars === entry.storedChars, sha256: entry.sha256 };
  return { content: JSON.stringify(state) + '\n' + text, status: 'ok' };
}

export const outputTools = [{
  name: 'read_tool_output', permission: 'L0',
  description: '按 outputId 分页回读当前会话保存的长工具输出；不能读取其他会话或任意文件路径。offset/limit 单位为字符，返回 nextOffset；超存储预算时仅保存前段，须缩小原查询。',
  parameters: { type: 'object', properties: { outputId: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 8000 } }, required: ['outputId'] },
  run: (args, ctx) => readToolOutput(ctx.session, args),
}];
