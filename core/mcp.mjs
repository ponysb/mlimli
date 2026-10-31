import { mcpAuthentication, observeMcpAuthentication } from './mcp-auth-policy.mjs';
// Standard MCP transports and one connection owner per effective server configuration.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { APP_VERSION } from './version.mjs';
import { getRunContext } from './run-context.mjs';

const sessions = new Map();
const contributed = new Map();
export function registerMcpServers(owner, servers) {
  if (contributed.has(owner)) throw new Error(`MCP owner 已注册：${owner}`);
  contributed.set(owner, servers);
  return async () => { contributed.delete(owner); const closing = []; for (const [key, s] of sessions) if (s.owner === owner) { sessions.delete(key); closing.push(s.client.close()); } await Promise.allSettled(closing); };
}
export function pluginMcpServers(dir, owner) {
  const file = path.join(dir, '.mcp.json');
  if (!fs.existsSync(file)) return () => {};
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  return registerMcpServers(owner, normalizeServers(payload.mcpServers, dir));
}
function normalizeServers(value, cwd) {
  const entries = Array.isArray(value) ? value : Object.entries(value || {}).map(([name, config]) => ({ ...config, name }));
  return entries.filter(s => s.enabled !== false).map(s => ({ ...s, cwd: s.cwd ? path.resolve(cwd || process.cwd(), s.cwd) : cwd }));
}
export function mcpServers(config) {
  const all = [...normalizeServers(config?.mcp?.servers || config?.mcpServers), ...[...contributed].flatMap(([owner, list]) => normalizeServers(list).map(s => ({ ...s, ...config?.mcp?.pluginOverrides?.[owner]?.[s.name], name: s.name, owner })))];
  const names = new Set();
  for (const s of all) { if (!s.name || names.has(s.name)) throw new Error(`MCP 服务器名称缺失或重复：${s.name}`); names.add(s.name); }
  return all;
}
export async function closeMcp() {
  const old = [...sessions.values()]; sessions.clear();
  await Promise.allSettled(old.map(s => s.client.close()));
}
export async function testMcpServer(server) {
  if (server.enabled === false) throw new Error('请先启用并保存服务');
  const s = await connect(server);
  await listTools(s);
  return { tools: s.tools.map(({ name, description }) => ({ name, description })) };
}
function effectiveServer(server) {
  const s = { ...server, env: { ...server.env }, headers: { ...server.headers } };
  if (s.bearer_token_env_var) {
    const token = process.env[s.bearer_token_env_var];
    if (!token && !s.headers.Authorization) throw new Error(`MCP ${s.name} 缺少环境变量 ${s.bearer_token_env_var}`);
    if (token && !s.headers.Authorization) s.headers.Authorization = `Bearer ${token}`;
  }
  if (!s.url && (typeof s.command !== 'string' || !s.command.trim())) throw new Error(`MCP ${s.name} 需要 command 或 url`);
  if (s.url && !['http:', 'https:'].includes(new URL(s.url).protocol)) throw new Error('MCP URL 仅支持 HTTP/HTTPS');
  return s;
}
function requestOptions(server, options = {}) { return { timeout: options.timeoutMs ?? server.timeout ?? 30000, signal: options.signal }; }
async function listTools(s, options) {
  const all = []; const cursors = new Set(); let cursor;
  do {
    const result = await s.client.listTools(cursor ? { cursor } : {}, requestOptions(s.server, options));
    all.push(...result.tools.map(t => ({ ...t, server: s.server.name })));
    cursor = result.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('MCP tools/list 重复分页游标');
    cursors.add(cursor);
    if (cursors.size > 1000) throw new Error('MCP tools/list 分页过多');
  } while (cursor);
  s.tools = all; s.dirty = false; return all;
}
async function connectionAuthProvider(server) {
  const { oauthProvider } = await import('./mcp-oauth.mjs');
  return oauthProvider(server);
}
async function oauthAwareFetch(server, url, init) {
  const response = await fetch(url, init);
  // Pause on the actual challenge, before the SDK attempts registration. Public servers remain usable.
  if (response.status === 401) observeMcpAuthentication(server, { unauthorized: true, oauth: /resource_metadata\s*=/i.test(response.headers.get('www-authenticate') || '') });
  if (response.status === 401 && mcpAuthentication(server).action === 'authorize' && !(await connectionAuthProvider(server)).tokens()) {
    const { rememberOAuthChallenge } = await import('./mcp-oauth.mjs');
    await rememberOAuthChallenge(server, response);
    await response.body?.cancel();
    const error = new Error(`MCP ${server.name} 需要连接授权`); error.code = 'MCP_AUTH_REQUIRED'; throw error;
  }
  if (response.status === 401 && !['authorize','detect'].includes(mcpAuthentication(server).action)) { await response.body?.cancel(); throw new Error(mcpAuthentication(server).detail); }
  return response;
}
export async function authorizeMcpServer(server, options = {}) {
  const policy = mcpAuthentication(server);
  if (!['authorize', 'detect'].includes(policy.action)) throw new Error(policy.detail);
  const { beginOAuth } = await import('./mcp-oauth.mjs');
  if (!options.session?.id) { const job = beginOAuth(server); await job.done; if (job.status !== 'authorized') throw new Error(job.error || '授权未完成'); return; }
  const { uiRequest } = await import('./plugins.mjs');
  const approved = await uiRequest(options.session, 'confirm', { confirmLabel: '连接并授权', title: `连接并授权 ${server.name}`, text: `需要连接 ${server.name}`, detail: '点击确认后启动浏览器授权。授权成功后自动继续当前任务，无需前往设置。' }, 180000, options.signal);
  if (!approved) throw new Error('已取消 MCP 授权');
  let prompt;
  const job = beginOAuth(server, { signal: options.signal, notify: (url, authorizationId) => {
    prompt = uiRequest(options.session, 'oauth', { title: `授权 ${server.name}`, detail: '请在浏览器完成登录，完成后自动继续当前任务。', url, authorizationId }, 180000, options.signal);
    prompt.then(value => { if (!value) job.cancel?.(); });
  } });
  await job.done;
  const { pendingUiRequests, resolveUiRequest } = await import('./plugins.mjs');
  for (const request of pendingUiRequests(options.session.id).filter(r => r.kind === 'oauth' && r.title === `授权 ${server.name}`)) resolveUiRequest(request.reqId, true, options.session.id);
  if (job.status !== 'authorized') {
    await uiRequest(options.session, 'present', { title: `${server.name} 授权未完成`, text: job.error || '授权未完成' }, 180000, options.signal);
    throw new Error(`MCP ${server.name} 授权失败：${job.error || job.status}`);
  }
}
async function connect(raw, options = {}) {
  options.signal?.throwIfAborted();
  if (options.prepareServer) raw = await options.prepareServer(raw, options);
  const server = effectiveServer(raw);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(server)).digest('hex');
  let s = sessions.get(server.name);
  if (s && s.fingerprint !== fingerprint) { sessions.delete(server.name); await s.client.close().catch(() => {}); s = null; }
  if (!s) {
    const [{ Client }, { StdioClientTransport }, { StreamableHTTPClientTransport }, { SSEClientTransport }, { ToolListChangedNotificationSchema }] = await Promise.all([
      import('@modelcontextprotocol/sdk/client/index.js'), import('@modelcontextprotocol/sdk/client/stdio.js'),
      import('@modelcontextprotocol/sdk/client/streamableHttp.js'), import('@modelcontextprotocol/sdk/client/sse.js'), import('@modelcontextprotocol/sdk/types.js'),
    ]);
    // Another request may have completed the module import first.
    const existing = sessions.get(server.name);
    if (existing?.fingerprint === fingerprint) return connect(raw, options);
    const client = new Client({ name: 'mli-agent', version: APP_VERSION }, { capabilities: {} });
    const transport = server.url
      ? server.type === 'sse' ? new SSEClientTransport(new URL(server.url), { requestInit: { headers: server.headers }, eventSourceInit: { fetch: (url, init) => fetch(url, { ...init, headers: { ...init?.headers, ...server.headers } }) } })
        : new StreamableHTTPClientTransport(new URL(server.url), { fetch: (url, init) => oauthAwareFetch(server, url, init), authProvider: !['authorize','detect'].includes(mcpAuthentication(server).action) ? undefined : await connectionAuthProvider(server), requestInit: { headers: server.headers } })
      : new StdioClientTransport({ command: server.command, args: server.args || [], env: { ...process.env, ...server.env }, cwd: server.cwd, stderr: 'pipe' });
    s = { client, transport, server, owner: server.owner, fingerprint, tools: [], dirty: true };
    sessions.set(server.name, s);
    const current = s;
    client.onclose = () => { if (sessions.get(server.name) === current) sessions.delete(server.name); };
    client.onerror = () => { current.dirty = true; };
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => { current.dirty = true; });
    // Install the connection promise before yielding, so simultaneous discovery shares it.
    s.connecting = (async () => {
      try {
        const connecting = client.connect(transport, { timeout: server.timeout ?? 30000 });
        transport.stderr?.on('data', () => {}); // Drain diagnostics without exposing credentials.
        await connecting;
        await listTools(current);
        observeMcpAuthentication(server, { public: !Object.keys(server.headers || {}).length });
        return current;
      } catch (error) {
        if (sessions.get(server.name) === current) sessions.delete(server.name);
        await client.close().catch(() => {});
        if ((error.code === 'MCP_AUTH_REQUIRED' || error.name === 'UnauthorizedError') && options.session?.id && !options.authRetried) {
          await authorizeMcpServer(server, options);
          return connect(raw, { ...options, authRetried: true });
        }
        throw new Error(`MCP ${server.name} 连接失败：${error.message}`, { cause: error });
      }
    })();
  }
  if (!options.signal) return s.connecting;
  // A cancelled waiter must not terminate a connection shared by other requests.
  return new Promise((resolve, reject) => {
    const abort = () => reject(options.signal.reason || new Error('MCP 已取消'));
    options.signal.addEventListener('abort', abort, { once: true });
    s.connecting.then(resolve, reject).finally(() => options.signal.removeEventListener('abort', abort));
    if (options.signal.aborted) abort();
  });
}
export async function mcpSearch(config, query = '', options = {}) {
  let servers = scopedServers(config, options);
  const q = String(query).toLowerCase();
  // Match an explicit server query before connecting, rather than filtering only tools afterwards.
  const named = servers.filter(s => s.name.toLowerCase() === q);
  if (named.length) servers = named;
  const connectionOptions = options.serverNames?.length || named.length ? options : { ...options, prepareServer: undefined };
  const outcomes = await Promise.all(servers.map(async server => {
    try { const s = await connect(server, connectionOptions); if (s.dirty) await listTools(s, options); return { tools: s.tools }; }
    catch (error) { if (options.signal?.aborted) throw error; return { tools: [], error: { server: server.name, message: error.message } }; }
  }));
  const tools = outcomes.flatMap(r => r.tools).filter(t => `${t.server} ${t.name} ${t.description || ''}`.toLowerCase().includes(q));
  const errors = outcomes.flatMap(r => r.error ? [r.error] : []);
  return { tools, errors, note: servers.length ? `共 ${tools.length} 个工具${errors.length ? `，${errors.length} 个服务器连接失败` : ''}` : '未配置 MCP 服务器' };
}
function scopedServers(config, options = {}) {
  const servers = mcpServers(config);
  return options.serverNames?.length ? servers.filter(s => options.serverNames.includes(s.name)) : servers;
}
async function resolveTool(config, name, options) {
  const servers = scopedServers(config, options);
  const qualified = servers.find(s => name.startsWith(`${s.name}/`));
  if (name.includes('/') && !qualified) throw new Error(`MCP 工具 ${name} 不在当前选择的服务范围内或服务不存在`);
  const scope = qualified ? [qualified] : servers;
  const matches = [];
  for (const server of scope) {
    const s = await connect(server, qualified || options.serverNames?.length ? options : { ...options, prepareServer: undefined }); if (s.dirty) await listTools(s, options);
    for (const t of s.tools) if (t.name === name || `${server.name}/${t.name}` === name) matches.push({ s, t });
  }
  if (!matches.length) throw new Error(`未找到 MCP 工具 ${name}`);
  if (matches.length > 1) throw new Error(`MCP 工具 ${name} 名称重复，请使用 server/tool`);
  return matches[0];
}
export async function mcpDescribe(config, name, options = {}) { return (await resolveTool(config, name, options)).t; }
export async function mcpCall(config, name, args, options = {}) {
  const { s, t } = await resolveTool(config, name, options);
  const { default: Ajv } = await import('ajv');
  const validate = new Ajv({ strict: false, allErrors: true }).compile(t.inputSchema || { type: 'object' });
  if (!validate(args || {})) throw new Error(`MCP 工具参数不符合 inputSchema：${JSON.stringify(validate.errors)}`);
  return s.client.callTool({ name: t.name, arguments: args || {} }, undefined, requestOptions(s.server, options));
}
export function normalizeMcpResult(result) {
  const content = result.content || [];
  const media = content.filter(c => ['image', 'audio'].includes(c.type) && c.data).map(c => ({ dataUrl: `data:${c.mimeType};base64,${c.data}` }));
  const text = content.filter(c => !['image', 'audio'].includes(c.type)).map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n');
  return { content: text || (result.structuredContent ? JSON.stringify(result.structuredContent) : ''), status: result.isError ? 'error' : 'ok', structuredContent: result.structuredContent, mcpContent: content, ...(media.length ? { media } : {}) };
}
export function mcpTool(getConfig) {
  return {
    name: 'mcp', permission: 'L2', plugin: 'core',
    description: 'MCP 工具桥：connect 连接目标服务，authorize 在聊天内请求并启动浏览器授权；缺少授权不要只让用户去设置。无目标的 search 仅返回服务目录，不连接。根据用户选择或任务确定目标，用 server 指定服务后 search 发现工具；describe 查看参数；call 使用 server/tool 调用。不要为寻找目标遍历连接无关服务。',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['search', 'describe', 'call', 'connect', 'authorize'] }, server: { type: 'string', description: '限定服务名称；本轮已选择服务时不能超出选择范围' }, query: { type: 'string' }, name: { type: 'string' }, arguments: { type: 'object' } }, required: ['action'] },
    async run({ action, query, name, server, arguments: args }, options = {}) {
      const selected = getRunContext()?.selectedMcpServers || [];
      if (server && selected.length && !selected.includes(server)) throw new Error(`MCP ${server} 不在本轮选择的服务范围内`);
      options = { ...options, serverNames: server ? [server] : selected, prepareServer: (await import('./mcp-auth.mjs')).prepareMcpAuthorization };
      const cfg = getConfig() || {};
      if (action === 'connect' || action === 'authorize') {
        const target = server || (selected.length === 1 ? selected[0] : undefined);
        if (!target) throw new Error('请指定 server 连接或授权');
        const raw = mcpServers(cfg).find(s => s.name === target);
        if (!raw) throw new Error('MCP 服务不存在或已停用');
        if (action === 'authorize') await authorizeMcpServer(raw, options);
        const connection = await connect(raw, options);
        return { content: JSON.stringify({ server: target, connected: true, tools: connection.tools }) };
      }
      if (action === 'search' && !options.serverNames.length) {
        const named = mcpServers(cfg).find(s => s.name.toLowerCase() === String(query || '').toLowerCase());
        if (named) options.serverNames = [named.name];
        else return { content: JSON.stringify({ servers: mcpServers(cfg).map(s => ({ name: s.name, transport: s.url ? s.type === 'sse' ? 'sse' : 'http' : 'stdio', ...(s.owner ? { owner: s.owner } : {}) })), tools: [], note: '服务目录尚未连接。根据用户选择或任务确定目标，然后指定 server 搜索工具。' }) };
      }
      if (action !== 'search' && !options.serverNames.length && !String(name || '').includes('/')) throw new Error('请用 server/tool 明确目标服务，或指定 server；不会遍历连接其他服务');
      if (action === 'search') return { content: JSON.stringify(await mcpSearch(cfg, query, options)) };
      if (!name) throw new Error(`${action} 需要 name`);
      if (action === 'describe') return { content: JSON.stringify(await mcpDescribe(cfg, name, options)) };
      if (action === 'call') return normalizeMcpResult(await mcpCall(cfg, name, args, options));
      throw new Error(`未知 action：${action}`);
    },
  };
}
