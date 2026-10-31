import { mcpAuthentication, observeMcpAuthentication } from './mcp-auth-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { DATA_ROOT } from './paths.mjs';

const jobs = new Map();
const challenges = new Map();
export async function rememberOAuthChallenge(server, response) {
  const { extractWWWAuthenticateParams } = await import('@modelcontextprotocol/sdk/client/auth.js');
  challenges.set(keyFor(server), extractWWWAuthenticateParams(response));
}
const keyFor = server => crypto.createHash('sha256').update(server.url).digest('hex');
const root = () => path.join(DATA_ROOT, '.security', 'mcp-oauth');
function read(server) { try { return JSON.parse(fs.readFileSync(path.join(root(), keyFor(server) + '.json'), 'utf8')); } catch { return {}; } }
function write(server, value) {
  fs.mkdirSync(root(), { recursive: true, mode: 0o700 });
  const file = path.join(root(), keyFor(server) + '.json'), temp = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
// Only the desktop host may open an active authorization job, inside the app.
export function oauthBrowserJob(id) {
  const job = [...jobs.values()].find(value => value.id === id && value.status === 'waiting');
  if (!job?.url) throw new Error('授权页面已失效，请重新连接');
  return { id: job.id, url: job.url, redirectUrl: job.redirectUrl };
}
export function oauthStatus(server) {
  const job = jobs.get(keyFor(server));
  const tokens = read(server).tokens;
  return { status: job?.status || (tokens ? 'authorized' : 'not_authorized'), ...(job ? { id: job.id, url: job.url, error: job.error } : {}) };
}
export function oauthProvider(server, flow) {
  const stored = read(server);
  const config = typeof server.oauth === 'object' ? server.oauth : {};
  const secret = config.client_secret_env ? process.env[config.client_secret_env] : undefined;
  if (config.client_secret_env && !secret) throw new Error('缺少 OAuth 客户端密钥环境变量：' + config.client_secret_env);
  const save = () => write(server, stored);
  let verifier;
  return {
    get redirectUrl() { return flow?.redirectUrl || stored.redirectUrl; },
    get clientMetadata() { return { client_name: 'MLI Workbench', client_uri: 'https://github.com/ponysb/mlimli', redirect_uris: [flow?.redirectUrl || stored.redirectUrl].filter(Boolean), grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], ...(config.scope ? { scope: config.scope } : {}), token_endpoint_auth_method: secret ? 'client_secret_post' : flow?.clientAuthMethod || stored.discovery?.authorizationServerMetadata?.token_endpoint_auth_methods_supported?.[0] || 'none' }; },
    ...(config.client_metadata_url ? { clientMetadataUrl: config.client_metadata_url } : {}),
    state: () => flow?.state,
    clientInformation: () => config.client_id ? { client_id: config.client_id, ...(secret ? { client_secret: secret } : {}) } : stored.client,
    saveClientInformation: value => { stored.client = value; stored.redirectUrl = flow?.redirectUrl || stored.redirectUrl; save(); },
    tokens: () => stored.tokens,
    discoveryState: () => stored.discovery,
    saveDiscoveryState: value => { observeMcpAuthentication(server, { metadata: value.authorizationServerMetadata }); if (flow && mcpAuthentication(server).action === 'configure') throw new Error(mcpAuthentication(server).detail); stored.discovery = value; if (flow) { const methods = value.authorizationServerMetadata?.token_endpoint_auth_methods_supported || []; flow.clientAuthMethod = methods.includes('none') ? 'none' : methods.includes('client_secret_post') ? 'client_secret_post' : methods[0] || 'none'; } save(); },
    saveTokens: value => { stored.tokens = value; save(); },
    saveCodeVerifier: value => { verifier = value; },
    codeVerifier: () => { if (!verifier) throw new Error('授权验证已失效，请重新授权'); return verifier; },
    redirectToAuthorization: url => {
      if (!flow) { const error = new Error('此服务需要授权，请在 MCP 设置点击「授权连接」'); error.code = 'MCP_AUTH_REQUIRED'; throw error; }
      flow.url = url.toString(); flow.status = 'waiting'; flow.notify?.(flow.url, flow.id);

    },
    invalidateCredentials: scope => { if (scope === 'all' || scope === 'tokens') delete stored.tokens; if (scope === 'all' || scope === 'client') delete stored.client; save(); },
  };
}
export function cancelOAuth(server) {
  const job = jobs.get(keyFor(server));
  if (job?.status === 'waiting' || job?.status === 'starting') job.cancel?.();
  return oauthStatus(server);
}
export function beginOAuth(server, options = {}) {
  const policy = mcpAuthentication(server);
  if (!['authorize','detect'].includes(policy.action)) throw new Error(policy.detail);
  if (!server.url || server.type === 'sse') throw new Error('浏览器授权需要 HTTP MCP 服务');
  const key = keyFor(server), existing = jobs.get(key);
  if (existing && ['starting', 'waiting'].includes(existing.status)) return existing;
  if (options.force) { const stored = read(server); delete stored.tokens; write(server, stored); }
  const job = { id: crypto.randomUUID(), status: 'starting', state: crypto.randomBytes(32).toString('hex'), ...options };
  jobs.set(key, job);
  job.done = run(server, job).catch(error => { job.status = error.code === 'ABORT_ERR' ? 'cancelled' : 'error'; job.error = describeOAuthError(error, job, server); job.url = undefined; });
  return job;
}
function describeOAuthError(error, job, server) {
  if (job.failedRequest?.status === 403) return `授权服务拒绝${job.failedRequest.stage}（HTTP 403）。${job.url ? '已获得授权页面，但后续请求失败。' : '尚未生成授权页面。'}仅凭 403 无法确认是客户端注册策略、请求配置还是网络访问限制；需要检查服务端响应与 OAuth 配置。在线 MCP 不要求开启桌面 MCP。`;
  return error.message;
}
async function run(server, job) {
  let listener, timer, removeAbort;
  try {
    let resolveCode, rejectCode;
    const code = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
    // Attach rejection handler immediately, including when discovery fails before awaiting callback.
    code.catch(() => {});
    job.cancel = () => { const e = new Error('授权已取消'); e.code = 'ABORT_ERR'; rejectCode(e); listener?.close(); };
    if (job.signal?.aborted) { const e = new Error('授权已取消'); e.code = 'ABORT_ERR'; throw e; }
    const onAbort = () => job.cancel?.();
    job.signal?.addEventListener('abort', onAbort, { once: true });
    removeAbort = () => job.signal?.removeEventListener('abort', onAbort);
    listener = http.createServer((req, res) => {
      const url = new URL(req.url, job.redirectUrl);
      res.setHeader('content-type', 'text/plain; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');
      if (url.pathname !== '/oauth/callback' || url.searchParams.get('state') !== job.state) { res.writeHead(400); res.end('授权回调无效，请返回 MLI 重试。'); return; }
      if (url.searchParams.has('error')) { res.end('授权未完成，请返回 MLI。'); rejectCode(new Error('服务端拒绝授权：' + url.searchParams.get('error'))); return; }
      const value = url.searchParams.get('code');
      if (!value) { res.writeHead(400);res.end('缺少授权码');return; }
      res.end('已收到授权，请返回 MLI 查看连接结果。'); resolveCode(value);
    });
    const oauth = typeof server.oauth === 'object' ? server.oauth : {};
    if (oauth.client_id && /[<>]/.test(oauth.client_id)) throw new Error('此插件的 OAuth client_id 是占位符，尚未配置服务方分配的客户端。请在服务配置中填写有效 OAuth 信息。');
    if (new URL(server.url).hostname === 'api.githubcopilot.com' && !oauth.client_id) throw new Error('GitHub 远程 MCP 不支持自动注册 OAuth 客户端。请在配置中填写 GitHub Token，或配置你注册的 OAuth App。');
    const preferred = read(server).redirectUrl;
    const port = preferred ? Number(new URL(preferred).port) : 0;
    await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(port, '127.0.0.1', resolve); });
    job.redirectUrl = `http://127.0.0.1:${listener.address().port}/oauth/callback`;
    timer = setTimeout(() => { job.cancel?.(); }, 45000);
    const provider = oauthProvider(server, job);
    const { auth } = await import('@modelcontextprotocol/sdk/client/auth.js');
    const requestController = new AbortController();
    const fetchFn = async (url, init) => {
      const response = await fetch(url, { ...init, signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) {
        const endpoint = new URL(String(url));
        job.failedRequest = { status: response.status, stage: endpoint.pathname.includes('register') ? '客户端注册' : endpoint.pathname.includes('token') ? '令牌交换' : '授权信息发现' };
      }
      return response;
    };
    const originalCancel = job.cancel; job.cancel = () => { requestController.abort(); originalCancel(); };
    // Preserve the RFC 9728 challenge instead of guessing a well-known location.
    let challenge = challenges.get(keyFor(server));
    if (!challenge) {
      const response = await fetchFn(server.url, { method: 'POST', headers: { ...server.headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'MLI Workbench', version: '1.0' } } }) });
      if (response.status === 401) { await rememberOAuthChallenge(server, response); challenge = challenges.get(keyFor(server)); }
      await response.body?.cancel();
    }
    const scope = typeof server.oauth === 'object' ? server.oauth.scope : undefined;
    const authOptions = { serverUrl: server.url, fetchFn, ...challenge, ...(scope ? { scope } : {}) };
    // A challenge carries a resource-metadata URL, not a cached authorization-server decision.
    if (challenge?.resourceMetadataUrl) provider.discoveryState = () => undefined;
    const status = await auth(provider, authOptions);
    if (status !== 'AUTHORIZED') {
      clearTimeout(timer); timer = setTimeout(() => job.cancel?.(), 180000);
      const authorizationCode = await code;
      await auth(provider, { ...authOptions, authorizationCode });
    }
    job.status = 'authorized'; job.url = undefined;
  } finally { clearTimeout(timer); removeAbort?.(); listener?.close(); job.cancel = undefined; }
}
