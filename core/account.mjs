import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { emit } from './events.mjs';
import { listPlatformPlugins as fetchPlatformPlugins, installPlatformPlugin } from './platform-plugins.mjs';

let config = {};
let current = null;
let billingBlocked = false;
let accountSessionCookie = '';

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
    if (typeof data.token === 'string' && data.token) current = { token: data.token, user: data.user || null };
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
  fs.writeFileSync(tmp, JSON.stringify({ token: current.token, user: current.user }, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

async function request(pathname, { method = 'GET', body, token, appSecret } = {}) {
  const cfg = accountConfig();
  if (!cfg.baseUrl) throw new Error('未配置账户服务地址');
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (appSecret) headers['x-app-secret'] = appSecret;
  if (accountSessionCookie) headers.cookie = accountSessionCookie;
  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${pathname}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`无法连接账户服务：${error.message}`);
  }
  const setCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()[0]
    : response.headers.get('set-cookie');
  if (setCookie) accountSessionCookie = String(setCookie).split(';', 1)[0];
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error?.message || payload.error || `账户服务 HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload.error?.code || 'ACCOUNT_REQUEST_FAILED';
    throw error;
  }
  return payload.data ?? payload;
}

export function setAccountConfig(value) {
  config = value || {};
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
  };
}
export function accountToken() { return current?.token || ''; }
export function accountServerUrl() { return accountConfig().baseUrl; }
export async function listManagedModels() {
  if (!current?.token) return { models: [] };
  return request('/api/v2/models', { token: current.token });
}
export async function listPlatformLibrary() {
  if (!current?.token) return { items: [] };
  return request('/api/v2/library', { token: current.token });
}

export async function listAccountPlugins() {
  return fetchPlatformPlugins({ baseUrl: accountConfig().baseUrl, token: current?.token });
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
  saveStoredSession();
  return publicAccountStatus();
}

async function accountCaptchaRequest(pathname, body) {
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
  const setCookie = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()[0]
    : response.headers.get('set-cookie');
  if (setCookie) accountSessionCookie = String(setCookie).split(';', 1)[0];
  if (pathname.endsWith('/captcha')) {
    const svg = await response.text();
    if (!response.ok) throw Object.assign(new Error('生成验证码失败'), { status: response.status });
    return { svg };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error?.message || payload.error || `账户服务 HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload.error?.code || 'ACCOUNT_REQUEST_FAILED';
    throw error;
  }
  return payload.data ?? payload;
}

export function getAccountCaptcha() { return accountCaptchaRequest('/api/auth/captcha'); }
export function verifyAccountCaptcha(code) { return accountCaptchaRequest('/api/auth/verify-captcha', { code }); }
export function sendRegisterCode(email) { return accountCaptchaRequest('/api/auth/send-register-code', { email }); }
export function registerAccount(email, password, code) { return accountCaptchaRequest('/api/auth/register', { email, password, code }); }
export function sendResetCode(email) { return accountCaptchaRequest('/api/auth/send-code', { email }); }
export function resetAccountPassword(email, code, newPassword) { return accountCaptchaRequest('/api/auth/reset-password', { email, code, newPassword }); }

export function logoutAccount() {
  current = null;
  billingBlocked = false;
  accountSessionCookie = '';
  saveStoredSession();
  return publicAccountStatus();
}

export async function refreshAccount() {
  const cfg = accountConfig();
  if (!cfg.enabled || !current?.token) return publicAccountStatus();
  try {
    const data = await request('/api/v2/auth/session', { token: current.token });
    current.user = data.user;
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
  if (paid && cfg.magicValuePerCurrencyUnit > 0 && Number(current?.user?.magicValue || 0) <= 0) {
    billingBlocked = true;
    const error = new Error('魔力值不足，请充值后刷新账户');
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
  try {
    const data = await request('/api/v2/billing/consume-magic', {
      method: 'POST', appSecret,
      body: {
        userId: current.user.id,
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
        },
      },
    });
    current.user = { ...current.user, magicValue: data.magicValue };
    saveStoredSession();
    emit('account_updated', { account: publicAccountStatus() });
    return { status: 'settled', magicValue, balance: data.magicValue, transactionId: data.transactionId, idempotent: !!data.idempotent };
  } catch (error) {
    if (error.code === 'INSUFFICIENT_POINTS') billingBlocked = true;
    if (error.code === 'INSUFFICIENT_MAGIC_VALUE') billingBlocked = true;
    return { status: 'failed', magicValue, code: error.code, error: error.message };
  }
}
