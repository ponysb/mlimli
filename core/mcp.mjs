// core/mcp.mjs —— MCP 兜底桥：stdio JSON-RPC 客户端 + search/describe/call 代理工具
import { spawn } from 'node:child_process';

const sessions = new Map();

function feedJsonRpc(sess, chunk) {
  sess.buf += chunk;
  const out = [];
  while (true) {
    const crlf = sess.buf.indexOf('\r\n\r\n');
    const lf = sess.buf.indexOf('\n\n');
    let headerEnd = -1, sepLen = 0;
    if (crlf >= 0 && (lf < 0 || crlf <= lf)) { headerEnd = crlf; sepLen = 4; }
    else if (lf >= 0) { headerEnd = lf; sepLen = 2; }
    else break;
    const header = sess.buf.slice(0, headerEnd);
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) { sess.buf = sess.buf.slice(headerEnd + sepLen); continue; }
    const len = parseInt(m[1], 10);
    const start = headerEnd + sepLen;
    if (sess.buf.length < start + len) break;
    const body = sess.buf.slice(start, start + len);
    sess.buf = sess.buf.slice(start + len);
    try { out.push(JSON.parse(body)); } catch { /* 跳过坏帧 */ }
  }
  return out;
}

function send(sess, msg) {
  const json = JSON.stringify(msg);
  sess.child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

function rpc(sess, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sess.nextId;
    const timer = setTimeout(() => {
      sess.pending.delete(id);
      reject(new Error(`MCP ${sess.name} 超时：${method}`));
    }, 30000);
    sess.pending.set(id, { resolve, reject, timer });
    send(sess, { jsonrpc: '2.0', id, method, params });
  });
}

async function connect(server) {
  if (sessions.has(server.name) && sessions.get(server.name).ready) return sessions.get(server.name);
  const child = spawn(server.command, server.args ?? [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(server.env ?? {}) },
    windowsHide: true,
  });
  const sess = { name: server.name, child, buf: '', pending: new Map(), tools: [], ready: false, nextId: 0 };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    for (const msg of feedJsonRpc(sess, chunk)) {
      if (msg.id != null && sess.pending.has(msg.id)) {
        const p = sess.pending.get(msg.id);
        sess.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    }
  });
  child.on('exit', () => {
    sessions.delete(server.name);
    for (const p of sess.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(`MCP ${server.name} 进程退出`));
    }
  });
  sessions.set(server.name, sess);
  await rpc(sess, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'mli-agent', version: '1.0.0' },
  });
  send(sess, { jsonrpc: '2.0', method: 'notifications/initialized' });
  const listed = await rpc(sess, 'tools/list', {});
  sess.tools = (listed?.tools ?? []).map((t) => ({
    server: server.name,
    name: t.name,
    description: t.description ?? '',
    inputSchema: t.inputSchema ?? { type: 'object' },
  }));
  sess.ready = true;
  return sess;
}

export function mcpServers(config) {
  return Array.isArray(config?.mcp?.servers) ? config.mcp.servers : [];
}

export async function mcpSearch(config, query = '') {
  const servers = mcpServers(config);
  if (!servers.length) return { tools: [], note: '未配置 MCP 服务器（config.json → mcp.servers）' };
  const all = [];
  for (const s of servers) {
    try {
      const sess = await connect(s);
      all.push(...sess.tools);
    } catch (err) {
      all.push({ server: s.name, name: '(连接失败)', description: err.message });
    }
  }
  const q = String(query ?? '').toLowerCase();
  const tools = q
    ? all.filter((t) => `${t.server} ${t.name} ${t.description}`.toLowerCase().includes(q))
    : all;
  return { tools, note: `共 ${tools.length} 个工具` };
}

export async function mcpDescribe(config, name) {
  const { tools } = await mcpSearch(config, '');
  const t = tools.find((x) => x.name === name || `${x.server}/${x.name}` === name);
  if (!t) throw new Error(`未找到 MCP 工具 ${name}，请先 mcp action=search`);
  return t;
}

export async function mcpCall(config, name, args) {
  const { tools } = await mcpSearch(config, '');
  const t = tools.find((x) => x.name === name || `${x.server}/${x.name}` === name);
  if (!t) throw new Error(`未找到 MCP 工具 ${name}`);
  const server = mcpServers(config).find((s) => s.name === t.server);
  const sess = await connect(server);
  const result = await rpc(sess, 'tools/call', { name: t.name, arguments: args ?? {} });
  const text = (result?.content ?? []).map((c) => c.text ?? JSON.stringify(c)).join('\n');
  return text || JSON.stringify(result);
}

export function mcpTool(getConfig) {
  return {
    name: 'mcp',
    description: 'MCP 生态兜底桥。action=search 按关键词发现工具；describe 查看 schema；call 调用。优先使用内置与插件工具，仅在它们不够时用 MCP。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'describe', 'call'] },
        query: { type: 'string', description: 'search 关键词' },
        name: { type: 'string', description: '工具名（describe/call）' },
        arguments: { type: 'object', description: 'call 的参数对象' },
      },
      required: ['action'],
    },
    permission: 'L2',
    plugin: 'core',
    async run({ action, query, name, arguments: args }) {
      const cfg = getConfig() ?? {};
      if (action === 'search') {
        const r = await mcpSearch(cfg, query);
        const lines = r.tools.map((t) => `- ${t.server}/${t.name}：${t.description}`);
        return { content: `${r.note}\n${lines.join('\n') || '(无)'}` };
      }
      if (action === 'describe') {
        if (!name) throw new Error('describe 需要 name');
        return { content: JSON.stringify(await mcpDescribe(cfg, name), null, 2) };
      }
      if (action === 'call') {
        if (!name) throw new Error('call 需要 name');
        return { content: await mcpCall(cfg, name, args ?? {}) };
      }
      throw new Error(`未知 action：${action}`);
    },
  };
}
