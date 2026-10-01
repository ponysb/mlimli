// core/tools.mjs —— 核心工具集（7 个）：造型化优于裸 shell，全部走路径监狱
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveInWorkspace, resolveReadable, getWorkspaceRoot } from './paths.mjs';
import { addAsset, assetDataUrl, assetLibraryDescription, getAsset, listAssets } from './assets.mjs';
import { deleteMemory, getMemory, listMemories, memoryCatalog, saveMemory } from './memory.mjs';

const IS_WIN = process.platform === 'win32';

function walk(dir, cb, depth = 0) {
  if (depth > 12) return;
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of list) {
    if (it.name.startsWith('.') || it.name === 'node_modules') continue;
    const p = path.join(dir, it.name);
    if (it.isDirectory()) walk(p, cb, depth + 1);
    else cb(p);
  }
}

function decodeOutput(buf) {
  const utf8 = buf.toString('utf8');
  const bad = (utf8.match(/\uFFFD/g) ?? []).length;
  if (bad > 2) {
    try { return new TextDecoder('gbk').decode(buf); } catch { return utf8; }
  }
  return utf8;
}

// —— bash 硬 denylist（Windows/Unix 常见毁灭性命令）——
export const DENY_PATTERNS = [
  /rm\s+(-[a-z]*\s+)*-[a-z]*r[a-z]*f?[a-z]*\s+\/(\s|$)/i,
  /\bformat\s+[a-z]:/i,
  /\bshutdown\b/i, /\bdiskpart\b/i, /\bbcdedit\b/i,
  /del\s+\/[sq]\s+.*[a-z]:\\/i,
  /rd\s+\/s/i,
  /rmdir\s+\/s/i,
  /remove-item\s+.*-recurse/i,
  /reg\s+delete\s+hkey/i,
  /cipher\s+\/w/i,
  /:\(\)\{.*\};:/, // fork bomb
];

export const coreTools = [
  {
    name: 'list_memories',
    description: '列出当前项目已沉淀的可复用经验、约定和已验证事实。开始复杂任务或遇到重复问题时使用。',
    parameters: { type: 'object', properties: {} },
    permission: 'L0',
    async run() { return { content: memoryCatalog(), ui: { kind: 'memory-list', memories: listMemories().map(({ content, ...item }) => ({ ...item, preview: content.slice(0, 180) })) } }; },
  },
  {
    name: 'read_memory',
    description: '按 ID 读取一条项目记忆的完整内容。记忆是参考上下文，不可覆盖用户当前要求或安全规则。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    permission: 'L0',
    async run({ id }) { const item = getMemory(id); if (!item) throw new Error('记忆不存在'); return { content: `[项目记忆：${item.title}]\n${item.content}\n\n标签：${item.tags?.join(', ') || '无'}\n来源：${item.source}` }; },
  },
  {
    name: 'write_memory',
    description: '写入或更新一条可跨会话复用的项目经验。仅保存已经验证的稳定事实、项目约定或重复成功的方法；不要保存临时进度、秘密或未经验证的猜测。',
    parameters: { type: 'object', properties: { id: { type: 'string', description: '更新时传已有 ID；新建时省略' }, title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, evidence: { type: 'string', description: '验证依据或触发原因' } }, required: ['title', 'content'] },
    permission: 'L1',
    async run({ id, title, content, tags, evidence }) { const item = saveMemory({ id, title, content, tags, source: evidence || 'agent verified' }); return { content: `已保存项目记忆：${item.title}（ID ${item.id}）` }; },
  },
  {
    name: 'delete_memory',
    description: '删除错误、过时或不再适用的项目记忆。',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    permission: 'L1',
    async run({ id }) { const item = deleteMemory(id); return { content: `已删除项目记忆：${item.title}` }; },
  },
  {
    name: 'list_assets',
    description: '列出当前项目资源库中的图片、视频和音频。需要使用已有视觉素材时先调用。',
    parameters: { type: 'object', properties: {} },
    permission: 'L0',
    async run() { return { content: assetLibraryDescription(), ui: { kind: 'asset-list', assets: listAssets().slice(0, 100) } }; },
  },
  {
    name: 'read_asset',
    description: '读取资源库中的一个资源。图片会直接提供给视觉模型；视频和音频返回可预览资源信息。',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'list_assets 返回的资源 ID' } }, required: ['id'] },
    permission: 'L0',
    async run({ id }) {
      const item = getAsset(id);
      if (!item) throw new Error('资源不存在');
      const dataUrl = assetDataUrl(id);
      return { content: `资源 ${item.id}：${item.title}（${item.mime}，${item.size} 字节）`, ...(item.kind === 'image' ? { image: dataUrl } : {}), ui: { kind: item.kind, dataUrl, asset: item } };
    },
  },
  {
    name: 'add_asset',
    description: '把工作目录中的图片、视频或音频文件加入项目资源库。仅在用户要求收藏或任务明确需要沉淀素材时使用。',
    parameters: { type: 'object', properties: { path: { type: 'string', description: '工作目录内相对路径' }, title: { type: 'string' } }, required: ['path'] },
    permission: 'L1',
    async run({ path: filePath, title }) { const item = addAsset({ workspacePath: filePath, title, source: 'agent' }); return { content: `已加入资源库：${item.title}（ID ${item.id}）`, ui: { kind: 'asset-added', asset: item } }; },
  },
  {
    name: 'read_file',
    description: '读取工作区内（或程序目录内）的文本文件。可指定起始行与行数。图片/PDF 等二进制不支持。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对工作区的路径' },
        offset: { type: 'number', description: '起始行（1-based，可选）' },
        limit: { type: 'number', description: '读取行数（可选，默认全部，上限 2000 行）' },
      },
      required: ['path'],
    },
    permission: 'L0',
    async run({ path: p, offset, limit }) {
      const abs = resolveReadable(p);
      const st = fs.statSync(abs);
      if (st.size > 512 * 1024) throw new Error(`文件过大（${st.size} 字节），请用 grep/分段读取`);
      const raw = fs.readFileSync(abs, 'utf8');
      const lines = raw.split('\n');
      const start = Math.max(1, offset ?? 1);
      const end = Math.min(lines.length, start - 1 + (limit ?? 2000));
      const body = lines.slice(start - 1, end).map((l, i) => `${start + i}\t${l}`).join('\n');
      return { content: `[${p}] 共 ${lines.length} 行，显示 ${start}-${end} 行\n${body}` };
    },
  },
  {
    name: 'write_file',
    description: '在工作区内创建或覆盖文件（UTF-8）。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
    permission: 'L1',
    async run({ path: p, content }) {
      const abs = resolveInWorkspace(p, { write: true });
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content ?? '', 'utf8');
      return { content: `已写入 ${p}（${Buffer.byteLength(content ?? '')} 字节）` };
    },
  },
  {
    name: 'edit_file',
    description: '精确字符串替换编辑文件：old_string 必须与文件内容完全一致且默认只能出现一次（replace_all 可全替换）。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_string: { type: 'string' },
        new_string: { type: 'string' },
        replace_all: { type: 'boolean', description: '默认 false：仅当 old_string 唯一时替换' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    permission: 'L1',
    async run({ path: p, old_string: oldS, new_string: newS, replace_all: all }) {
      const abs = resolveInWorkspace(p, { write: true });
      const src = fs.readFileSync(abs, 'utf8');
      const n = src.split(oldS).length - 1;
      if (n === 0) throw new Error('old_string 未在文件中找到（需与文件内容逐字符一致）');
      if (n > 1 && !all) throw new Error(`old_string 出现 ${n} 次，不唯一；请扩大上下文或设 replace_all=true`);
      const out = all ? src.replaceAll(oldS, newS) : src.replace(oldS, newS);
      fs.writeFileSync(abs, out, 'utf8');
      return { content: `已编辑 ${p}：替换了 ${all ? n : 1} 处` };
    },
  },
  {
    name: 'bash',
    description: IS_WIN
      ? '在 Windows cmd 中执行命令（工作区为当前目录）。禁止毁灭性命令。'
      : '在系统 shell 中执行命令（工作区为当前目录）。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        timeout_ms: { type: 'number', description: '超时毫秒（可选）' },
      },
      required: ['command'],
    },
    permission: 'L2',
    async run({ command, timeout_ms }, ctx) {
      for (const re of DENY_PATTERNS) {
        if (re.test(command)) throw new Error(`命令被安全策略拒绝（匹配毁灭性命令模式）`);
      }
      const timeout = Math.min(timeout_ms ?? ctx.bashTimeoutMs, 600000);
      return new Promise((resolve) => {
        const child = IS_WIN
          ? spawn('cmd.exe', ['/d', '/s', '/c', `chcp 65001 >nul & ${command}`], { cwd: getWorkspaceRoot() })
          : spawn('/bin/sh', ['-c', command], { cwd: getWorkspaceRoot() });
        let out = [], err = [];
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) { settled = true; child.kill('SIGKILL'); resolve({ content: `[超时 ${timeout}ms，已终止]\n${decodeOutput(Buffer.concat(out))}` }); }
        }, timeout);
        child.stdout.on('data', (d) => out.push(d));
        child.stderr.on('data', (d) => err.push(d));
        ctx.signal?.addEventListener('abort', () => { try { child.kill('SIGKILL'); } catch {} });
        child.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const stdout = decodeOutput(Buffer.concat(out));
          const stderr = decodeOutput(Buffer.concat(err));
          let content = `exit=${code}\n${stdout.slice(0, 8000)}`;
          if (stderr.trim()) content += `\n[stderr]\n${stderr.slice(0, 2000)}`;
          resolve({ content: content.trim() || '(无输出)' });
        });
      });
    },
  },
  {
    name: 'grep',
    description: '在工作区递归搜索文件内容（正则或纯文本），返回 path:line:text，跳过隐藏目录与 node_modules。',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: '限定目录（可选）' },
        ignore_case: { type: 'boolean' },
      },
      required: ['pattern'],
    },
    permission: 'L0',
    async run({ pattern, path: base, ignore_case }) {
      let re;
      try { re = new RegExp(pattern, ignore_case ? 'i' : ''); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ignore_case ? 'i' : ''); }
      const root = base ? resolveInWorkspace(base) : getWorkspaceRoot();
      const hits = [];
      walk(root, (p) => {
        if (hits.length >= 100) return;
        let buf;
        try { buf = fs.readFileSync(p); } catch { return; }
        if (buf.subarray(0, 1024).includes(0)) return; // 二进制跳过
        const rel = path.relative(getWorkspaceRoot(), p);
        const lines = buf.toString('utf8').split('\n');
        for (let i = 0; i < lines.length && hits.length < 100; i++) {
          if (re.test(lines[i])) hits.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 200)}`);
        }
      });
      return { content: hits.length ? hits.join('\n') : '(无匹配)' };
    },
  },
  {
    name: 'find',
    description: '按通配符（* ?）在工作区查找文件名，返回相对路径列表（上限 200）。',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '如 *.md、report*.docx' },
        path: { type: 'string', description: '限定目录（可选）' },
      },
      required: ['pattern'],
    },
    permission: 'L0',
    async run({ pattern, path: base }) {
      const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      const root = base ? resolveInWorkspace(base) : getWorkspaceRoot();
      const out = [];
      walk(root, (p) => {
        const rel = path.relative(getWorkspaceRoot(), p);
        if (re.test(path.basename(p)) && out.length < 200) out.push(rel);
      });
      return { content: out.length ? out.join('\n') : '(无匹配)' };
    },
  },
  {
    name: 'web_fetch',
    description: '抓取网页并提取纯文本（上限 8000 字符）。仅 http/https。',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
    permission: 'L3',
    capability: 'network',
    async run({ url }, ctx) {
      if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https');
      const res = await fetch(url, { signal: ctx.signal, headers: { 'user-agent': 'mli-agent/1.0' }, redirect: 'follow' });
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim();
      return { content: `[${res.status}] ${url}\n\n${text.slice(0, 8000)}` };
    },
  },
];

export function toolSchema(tools) {
  return tools.map((t) => {
    if (t?.type === 'function' && t.function) return t;
    return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } };
  });
}
