import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { emit } from './events.mjs';
import { listPlatformPlugins as fetchPlatformPlugins, installPlatformPlugin } from './platform-plugins.mjs';
import { resolveResourceCover } from './resource-images.mjs';

let config = {};
let current = null;
let billingBlocked = false;
let accountSessionCookie = '';
let captchaRequestQueue = Promise.resolve();
// 当前主体：personal 为个人主体，enterprise 时 currentOrganizationId 指向所属企业。
// 主体只用于「哪些资源可见」和「魔力值从哪个钱包扣」，鉴权仍由账户 token 决定。
let currentOrganizationId = '';
const clientSessionId = crypto.randomUUID();
const clientVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function clientIdentityFile() {
  return path.join(path.dirname(sessionFile()), 'client-identity.json');
}

function clientId() {
  try {
    const value = JSON.parse(fs.readFileSync(clientIdentityFile(), 'utf8')).clientId;
    if (/^[a-f0-9-]{36}$/i.test(value)) return value;
  } catch { /* 首次启动 */ }
  const value = crypto.randomUUID();
  const file = clientIdentityFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ clientId: value }, null, 2), { encoding: 'utf8', mode: 0o600 });
  return value;
}

let persistentClientId = '';
function currentClientId() {
  if (!persistentClientId) persistentClientId = clientId();
  return persistentClientId;
}
function telemetryHeaders() {
  return {
    'x-mli-client-id': currentClientId(),
    'x-mli-session-id': clientSessionId,
    'x-mli-client-version': clientVersion,
    'x-mli-platform': process.platform,
    'x-mli-arch': process.arch,
  };
}

function subjectOrganizationId() {
  const value = String(currentOrganizationId || '').trim();
  return value && value !== 'personal' && value !== 'me' ? value : '';
}

// 目录请求带上当前主体；服务端会据此返回官方 + 该企业资源。
function subjectHeaders() {
  const organizationId = subjectOrganizationId();
  return organizationId ? { 'x-mli-organization-id': organizationId } : {};
}

function accountConfig() {
  const value = config.account || {};
  const enabledOverride = String(process.env.MLI_ACCOUNT_ENABLED || '').trim().toLowerCase();
  return {
    enabled: enabledOverride ? !['0', 'false', 'no', 'off'].includes(enabledOverride) : value.enabled !== false,
    baseUrl: String(process.env.MLI_ACCOUNT_SERVER_URL || value.baseUrl || 'http://127.0.0.1:3086').trim().replace(/\/$/, ''),
    magicValuePerCurrencyUnit: Math.max(0, Number(value.billing?.magicValuePerCurrencyUnit ?? value.billing?.pointsPerCurrencyUnit) || 0),
    billingCurrency: String(value.billing?.currency || 'USD').toUpperCase(),
    source: String(value.billing?.source || 'mli-agent').slice(0, 64),
  };
}

function sessionFile() {
  if (process.env.MLI_ACCOUNT_SESSION_FILE) return path.resolve(process.env.MLI_ACCOUNT_SESSION_FILE);
  const base = process.platform === 'win32'
    ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'MLI Agent', 'account-session.json');
}

function loadStoredSession() {
  try {
    const data = JSON.parse(fs.readFileSync(sessionFile(), 'utf8'));
    if (typeof data.token === 'string' && data.token) {
      current = { token: data.token, user: data.user || null };
      // 恢复上次使用的主体；失效的企业会在下次拉取目录时被服务端拒绝并回落。
      currentOrganizationId = typeof data.organizationId === 'string' ? data.organizationId : '';
    }
  } catch { /* 尚未登录 */ }
}

function saveStoredSession() {
  const file = sessionFile();
  if (!current?.token) {
    try { fs.unlinkSync(file); } catch { /* 文件不存在 */ }
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ token: current.token, user: current.user, organizationId: currentOrganizationId }, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

async function request(pathname, { method = 'GET', body, token, appSecret, telemetry = false, timeoutMs = 15000 } = {}) {
  const cfg = accountConfig();
  if (!cfg.baseUrl) throw new Error('未配置账户服务地址');
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (appSecret) headers['x-app-secret'] = appSecret;
  if (telemetry) Object.assign(headers, telemetryHeaders());
  Object.assign(headers, subjectHeaders());
  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${pathname}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`无法连接账户服务：${error.message}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error?.message || payload.error || `账户服务 HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload.error?.code || payload.code || 'ACCOUNT_REQUEST_FAILED';
    throw error;
  }
  return payload.data ?? payload;
}

// 当前主体状态。subjects 由服务端返回，客户端不自行构造。
let subjects = [];

function listSubjectCache() {
  return subjects.map((item) => ({ ...item, magicValue: Number(item.magicValue) || 0 }));
}

// 个人主体永远可用；企业主体只有在服务端确认仍是成员时才返回。
function currentSubjectStatus() {
  const organizationId = subjectOrganizationId();
  if (!organizationId) {
    return {
      subjectType: 'personal',
      subjectId: current?.user?.id || null,
      key: 'personal',
      name: '个人主体',
      role: 'owner',
      magicValue: Number(current?.user?.magicValue) || 0,
      organizationId: null,
      organizationName: null,
      status: 'active'
    };
  }
  const found = subjects.find((item) => item.organizationId === organizationId);
  if (found) return { ...found, magicValue: Number(found.magicValue) || 0 };
  // 企业已被移除或停用：回落个人主体，避免继续使用失效的钱包。
  return currentSubjectStatusForPersonal();
}

function currentSubjectStatusForPersonal() {
  return {
    subjectType: 'personal',
    subjectId: current?.user?.id || null,
    key: 'personal',
    name: '个人主体',
    role: 'owner',
    magicValue: Number(current?.user?.magicValue) || 0,
    organizationId: null,
    organizationName: null,
    status: 'active'
  };
}

// 扣费后把余额写回当前主体的钱包：企业主体只更新企业余额，个人主体更新用户余额。
function applyBalance(magicValue) {
  const value = Number(magicValue);
  if (!Number.isFinite(value)) return;
  const organizationId = subjectOrganizationId();
  if (organizationId) {
    subjects = subjects.map((item) => (item.organizationId === organizationId ? { ...item, magicValue: value } : item));
  } else if (current?.user) {
    current.user = { ...current.user, magicValue: value };
  }
  saveStoredSession();
}

function applySubjects(list) {
  subjects = Array.isArray(list) ? list.filter((item) => item && (item.subjectType === 'personal' || item.organizationId)) : [];
  // 当前企业已不在可用列表中时回落到个人主体。
  const organizationId = subjectOrganizationId();
  if (organizationId && !subjects.some((item) => item.organizationId === organizationId && item.status === 'active')) {
    currentOrganizationId = '';
  }
}

// 拉取可用主体列表。未登录时返回空列表，不抛错。
export async function listSubjects() {
  if (!current?.token) { subjects = []; return listSubjectCache(); }
  try {
    const data = await request('/api/v2/subjects', { token: current.token });
    applySubjects(data.subjects);
    saveStoredSession();
    emit('account_updated', { account: publicAccountStatus() });
    return listSubjectCache();
  } catch {
    return listSubjectCache();
  }
}

// 切换主体。服务端校验成员关系；切换后由调用方刷新目录。
export async function switchSubject(organizationId) {
  if (!current?.token) throw Object.assign(new Error('请先登录账户'), { status: 401 });
  const target = String(organizationId || '').trim();
  const data = await request('/api/v2/subjects/switch', { method: 'POST', token: current.token, body: { organizationId: target } });
  currentOrganizationId = data.subject?.organizationId || '';
  applySubjects(data.subjects);
  saveStoredSession();
  const account = publicAccountStatus();
  emit('account_updated', { account });
  return account;
}

export function accountOrganizationId() { return subjectOrganizationId(); }

export function setAccountConfig(value) {
  const previousUrl = accountConfig().baseUrl;
  config = value || {};
  if (previousUrl !== accountConfig().baseUrl) accountSessionCookie = '';
  if (current === null) loadStoredSession();
}

export function publicAccountStatus() {
  const cfg = accountConfig();
  return {
    enabled: cfg.enabled,
    baseUrl: cfg.baseUrl,
    authenticated: !!current?.token,
    user: current?.user ? Object.fromEntries(Object.entries(current.user).filter(([field]) => field !== 'points')) : null,
    billing: {
      enabled: cfg.magicValuePerCurrencyUnit > 0,
      configured: cfg.magicValuePerCurrencyUnit > 0 && !!process.env.MLI_ACCOUNT_APP_SECRET,
      magicValuePerCurrencyUnit: cfg.magicValuePerCurrencyUnit,
      currency: cfg.billingCurrency,
    },
    subjects: listSubjectCache(),
    currentSubject: currentSubjectStatus(),
  };
}
export function accountToken() { return current?.token || ''; }
export function accountUserId() { return current?.user?.id ? String(current.user.id) : ''; }
export function accountServerUrl() { return accountConfig().baseUrl; }
export async function listManagedModels() {
  if (!current?.token) return { models: [] };
  return request('/api/v2/models', { token: current.token });
}
export async function listPlatformLibrary() {
  const data = await request('/api/v2/library', { token: current?.token });
  return { ...data, items: (data.items || []).map(item => ({ ...item, coverUrl: resolveResourceCover(item.coverUrl, accountServerUrl()) })) };
}

export async function listTeamMemory({ timeoutMs = 15000 } = {}) {
  if (!current?.token || !subjectOrganizationId()) return { memories: [], repositories: [], scope: { subjectType: 'personal', organizationId: null } };
  return request('/api/v2/library/team', { token: current.token, timeoutMs });
}

export async function listAccountPlugins() {
  return fetchPlatformPlugins({ baseUrl: accountConfig().baseUrl, token: current?.token, organizationId: subjectOrganizationId() });
}

export async function installAccountPlugin(id, sha256) {
  if (!current?.token) throw new Error('请先登录账户');
  const result = await installPlatformPlugin({ baseUrl: accountConfig().baseUrl, token: current.token, id, sha256 });
  emit('plugins_reloaded', { plugin: result.name });
  return result;
}

export async function listPurchasePackages() {
  return request('/api/packages');
}

export async function createPurchaseOrder(packageId, payType) {
  if (!current?.token) throw new Error('请先登录');
  return request('/api/payment/create', { method: 'POST', token: current.token, body: { packageId, payType, wallet: 'magic' } });
}

export async function queryPurchaseOrder(outTradeNo) {
  if (!current?.token) throw new Error('请先登录');
  return request(`/api/payment/query/${encodeURIComponent(outTradeNo)}`, { token: current.token });
}

export async function loginAccount(email, password) {
  const data = await request('/api/v2/auth/login', { method: 'POST', body: { email, password } });
  if (!data.token || !data.user) throw new Error('账户服务返回了无效的登录结果');
  current = { token: data.token, user: data.user };
  billingBlocked = false;
  // 新登录默认回到个人主体，避免沿用上一次会话的企业上下文。
  currentOrganizationId = '';
  subjects = [];
  saveStoredSession();
  // 登录后立即加载个人与所属企业，确保客户端直接提供主体切换。
  await listSubjects();
  await recordClientLaunch().catch(() => {});
  return publicAccountStatus();
}

export function recordClientLaunch() {
  if (!accountConfig().enabled) return Promise.resolve({ recorded: false });
  return request('/api/v2/client-analytics/session', {
    method: 'POST', token: current?.token,
    body: { clientId: currentClientId(), sessionId: clientSessionId, version: clientVersion, platform: process.platform, arch: process.arch }
  });
}

function accountCaptchaRequest(pathname, body) {
  const pending = captchaRequestQueue.then(() => performCaptchaRequest(pathname, body));
  captchaRequestQueue = pending.catch(() => {});
  return pending;
}

async function performCaptchaRequest(pathname, body) {
  const cfg = accountConfig();
  const headers = { accept: 'application/json' };
  if (body !== undefined) { headers['content-type'] = 'application/json'; }
  if (accountSessionCookie) headers.cookie = accountSessionCookie;
  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${pathname}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`无法连接账户服务：${error.message}`);
  }
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  const sessionCookie = cookies.find(cookie => /^connect\.sid=/.test(cookie));
  if (sessionCookie && cfg.baseUrl === accountConfig().baseUrl) accountSessionCookie = sessionCookie.split(';', 1)[0];
  if (pathname.endsWith('/captcha')) {
    const svg = await response.text();
    if (!response.ok || !svg.includes('<svg')) throw Object.assign(new Error('生成验证码失败'), { status: response.ok ? 502 : response.status });
    if (!accountSessionCookie) throw Object.assign(new Error('账户服务未建立验证码会话，请更新账户后台或检查 HTTPS 代理配置'), { status: 502 });
    return { svg };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error?.message || payload.error || `账户服务 HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload.error?.code || payload.code || 'ACCOUNT_REQUEST_FAILED';
    throw error;
  }
  return payload.data ?? payload;
}

export function getAccountCaptcha() { return accountCaptchaRequest('/api/auth/captcha'); }
export function checkAccountEmail(email) { return request('/api/auth/check-email', { method: 'POST', body: { email } }); }
export function verifyAccountCaptcha(code) { return accountCaptchaRequest('/api/auth/verify-captcha', { code }); }
export function sendRegisterCode(email) { return accountCaptchaRequest('/api/auth/send-register-code', { email }); }
export function registerAccount(email, password, code, inviteCode = '') { return accountCaptchaRequest('/api/auth/register', { email, password, code, inviteCode }); }
export function getMarketingConfig() { return request('/api/v2/marketing/config'); }
export function getMarketingSummary() {
  if (!current?.token) throw Object.assign(new Error('请先登录账户'), { status: 401 });
  return request('/api/v2/marketing/summary', { token: current.token });
}
export async function claimDailyCheckin() {
  if (!current?.token) throw Object.assign(new Error('请先登录账户'), { status: 401 });
  const result = await request('/api/v2/marketing/checkin', { method: 'POST', token: current.token, body: {} });
  current.user = { ...current.user, magicValue: result.magicValue };
  saveStoredSession();
  emit('account_updated', { account: publicAccountStatus() });
  return result;
}
export function sendResetCode(email) { return accountCaptchaRequest('/api/auth/send-code', { email }); }
export function resetAccountPassword(email, code, newPassword) { return accountCaptchaRequest('/api/auth/reset-password', { email, code, newPassword }); }

export function logoutAccount() {
  current = null;
  billingBlocked = false;
  accountSessionCookie = '';
  currentOrganizationId = '';
  subjects = [];
  saveStoredSession();
  return publicAccountStatus();
}

export async function refreshAccount() {
  const cfg = accountConfig();
  if (!cfg.enabled || !current?.token) return publicAccountStatus();
  try {
    const data = await request('/api/v2/auth/session', { token: current.token, telemetry: true });
    current.user = data.user;
    // 每次刷新都重新拉取主体；首次登录时缓存为空也必须发现所属企业。
    await listSubjects();
    billingBlocked = false;
    saveStoredSession();
    emit('account_updated', { account: publicAccountStatus() });
  } catch (error) {
    if (error.status === 401 || error.status === 403) logoutAccount();
    throw error;
  }
  return publicAccountStatus();
}

export async function updateAccountNickname(nickname) {
  if (!current?.token) throw Object.assign(new Error('请先登录账户'), { status: 401 });
  const data = await request('/api/v2/auth/session', { method: 'PATCH', token: current.token, body: { nickname } });
  current.user = data.user;
  saveStoredSession();
  const account = publicAccountStatus();
  emit('account_updated', { account });
  return account;
}

export async function requireAccount({ paid = false } = {}) {
  const cfg = accountConfig();
  if (!cfg.enabled) return null;
  if (!current?.token) {
    const error = new Error('请先登录账户');
    error.status = 401;
    throw error;
  }
  if (billingBlocked) {
    const error = new Error('魔力值不足，请充值后刷新账户');
    error.status = 402;
    throw error;
  }
  await refreshAccount();
  if (paid && cfg.magicValuePerCurrencyUnit > 0 && !process.env.MLI_ACCOUNT_APP_SECRET) {
    const error = new Error('魔力值结算未配置：缺少 MLI_ACCOUNT_APP_SECRET');
    error.status = 503;
    throw error;
  }
  // 企业主体下用企业余额判断，个人主体下用个人余额。
  if (paid && cfg.magicValuePerCurrencyUnit > 0 && Number(currentSubjectStatus().magicValue) <= 0) {
    billingBlocked = true;
    const subject = currentSubjectStatus();
    const error = new Error(subject.subjectType === 'enterprise' ? '企业魔力值不足，请联系企业管理员充值' : '魔力值不足，请充值后刷新账户');
    error.status = 402;
    throw error;
  }
  return current.user;
}

export function pointsForCost(cost, currency) {
  const cfg = accountConfig();
  const amount = Math.max(0, Number(cost) || 0);
  if (!cfg.magicValuePerCurrencyUnit || !amount) return 0;
  if (String(currency || '').toUpperCase() !== cfg.billingCurrency) return 0;
  return Math.max(1, Math.ceil(amount * cfg.magicValuePerCurrencyUnit));
}

export function magicValueForCost(cost, currency) {
  const cfg = accountConfig();
  const amount = Number(cost);
  if (!Number.isFinite(amount) || amount <= 0 || !cfg.magicValuePerCurrencyUnit) return 0;
  if (String(currency || '').toUpperCase() !== cfg.billingCurrency) return 0;
  return Math.ceil(amount * cfg.magicValuePerCurrencyUnit * 1e6 - 1e-8) / 1e6;
}

export async function settleApiUsage(log) {
  const cfg = accountConfig();
  const magicValue = magicValueForCost(log.metrics?.cost, log.metrics?.currency);
  if (!cfg.enabled || !magicValue) return { status: 'not_billable', magicValue: 0 };
  if (!current?.token || !current?.user?.id) return { status: 'not_authenticated', magicValue };
  const appSecret = process.env.MLI_ACCOUNT_APP_SECRET;
  if (!appSecret) return { status: 'not_configured', magicValue, error: '未配置 MLI_ACCOUNT_APP_SECRET' };
  // 企业主体下自备密钥的调用同样从企业钱包扣除，由服务端按主体判定。
  const organizationId = subjectOrganizationId();
  try {
    const data = await request('/api/v2/billing/consume-magic', {
      method: 'POST', appSecret,
      body: {
        userId: current.user.id,
        organizationId: organizationId || null,
        magicValue,
        idempotencyKey: `llm:${log.id}`,
        referenceId: log.id,
        source: cfg.source,
        description: `${log.provider?.model || '模型'} API 调用`,
        metadata: {
          sessionId: log.sessionId || null,
          model: log.provider?.model || null,
          totalTokens: log.metrics?.totalTokens || 0,
          cost: log.metrics?.cost || 0,
          currency: log.metrics?.currency || null,
          subjectType: organizationId ? 'enterprise' : 'personal',
          organizationId: organizationId || null,
        },
      },
    });
    applyBalance(data.magicValue);
    const account = publicAccountStatus();
    emit('account_updated', { account });
    return { status: 'settled', magicValue, balance: data.magicValue, transactionId: data.transactionId, idempotent: !!data.idempotent };
  } catch (error) {
    if (error.code === 'INSUFFICIENT_POINTS') billingBlocked = true;
    if (error.code === 'INSUFFICIENT_MAGIC_VALUE') billingBlocked = true;
    if (error.code === 'BUDGET_EXCEEDED') billingBlocked = true;
    return { status: 'failed', magicValue, code: error.code, error: error.message };
  }
}
