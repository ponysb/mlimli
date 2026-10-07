import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-account-test-'));
process.env.MLI_ACCOUNT_SESSION_FILE = path.join(temp, 'session.json');
process.env.MLI_ACCOUNT_APP_SECRET = 'test-app-secret';

const account = await import('../core/account.mjs');

test('后台托管模型倍率从账户目录传递到界面，并在刷新后保持最新值', async t => {
  const { setConfig, publicSettings, refreshManagedCatalog } = await import('../core/llm.mjs');
  let multiplier = 0.8;
  account.setAccountConfig({ account: { enabled: true, baseUrl: 'https://catalog.example.invalid' } });
  t.after(() => account.logoutAccount());
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url) === 'https://catalog.example.invalid/api/v2/auth/login') return Response.json({ success: true, data: { token: 'catalog-fixture-token', user: { id: 'catalog-user', magicValue: 10 } } });
    assert.equal(String(url), 'https://catalog.example.invalid/api/v2/models');
    assert.equal(options.headers.authorization, 'Bearer catalog-fixture-token');
    return Response.json({ success: true, data: { models: [{ id: 'model-1', name: '托管模型', contextWindow: 128000, billingMultiplier: multiplier, supportsImage: true }], magicValue: 10 } });
  });
  await account.loginAccount('fixture@example.com', 'fixture-password');
  setConfig({ providers: [], models: [] });
  for (const value of [0.8, 1.25, 0.5, 1]) {
    multiplier = value;
    await refreshManagedCatalog({ force: true });
    const item = publicSettings().models.find(model => model.id === 'managed-model-1');
    assert.equal(item.displayMultiplier, value);
    assert.equal(item.capabilities.image, true);
    assert.equal(item.pricing.inputPer1M, 0);
  }
  multiplier = undefined;
  await refreshManagedCatalog({ force: true });
  assert.equal(publicSettings().models[0].displayMultiplier, 1);
});

test('邀请注册透传邀请码，签到后更新客户端和保存会话余额', async t => {
  let registration;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    const send = payload => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
    if (req.url === '/api/auth/register') { registration = body; return send({ user: { id: 'new-user' } }); }
    if (req.url === '/api/v2/marketing/config') { assert.equal(req.headers.authorization, undefined); return send({ success: true, data: { visible: true, inviteEnabled: true } }); }
    if (req.url === '/api/v2/auth/login') return send({ success: true, data: { token: 'marketing-token', user: { id: 'new-user', magicValue: 5 } } });
    assert.equal(req.headers.authorization, 'Bearer marketing-token');
    if (req.url === '/api/v2/marketing/summary') return send({ success: true, data: { inviteCode: 'ABCDEF0123456789', checkedIn: false } });
    if (req.url === '/api/v2/marketing/checkin') return send({ success: true, data: { magicValue: 105, reward: 100, checkedIn: true } });
    res.writeHead(404); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { account.logoutAccount(); server.closeAllConnections(); server.close(); });
  account.setAccountConfig({ account: { baseUrl: `http://127.0.0.1:${server.address().port}` } });
  assert.equal((await account.getMarketingConfig()).visible, true);
  assert.throws(() => account.getMarketingSummary(), error => error.status === 401);
  await account.registerAccount('friend@qq.com', 'test-password', '123456', 'ABCDEF0123456789');
  assert.equal(registration.inviteCode, 'ABCDEF0123456789');
  await account.loginAccount('friend@qq.com', 'test-password');
  assert.equal((await account.getMarketingSummary()).inviteCode, 'ABCDEF0123456789');
  await account.claimDailyCheckin();
  assert.equal(account.publicAccountStatus().user.magicValue, 105);
  assert.equal(JSON.parse(fs.readFileSync(process.env.MLI_ACCOUNT_SESSION_FILE, 'utf8')).user.magicValue, 105);
});

test('统一账户登录、会话复验和幂等魔力值结算', async (t) => {
  let points = 100;
  let magicValue = 10;
  let nickname = '旧用户';
  const consumed = new Map();
  const orders = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    const send = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
    if (req.url === '/api/v2/auth/login' && body.email === 'legacy@example.com' && body.password === 'secret') {
      return send(200, { success: true, data: { token: 'legacy-jwt', user: { id: 'user-1', email: body.email, nickname, points, magicValue, status: 'active', level: 2 } } });
    }
    if (req.url === '/api/v2/auth/session' && req.headers.authorization === 'Bearer legacy-jwt') {
      if (req.method === 'PATCH') nickname = body.nickname;
      return send(200, { success: true, data: { user: { id: 'user-1', email: 'legacy@example.com', nickname, points, magicValue, status: 'active', level: 2 } } });
    }
    if (req.url === '/api/payment/create' && req.headers.authorization === 'Bearer legacy-jwt') {
      orders.push(body);
      return send(200, { success: true, data: { outTradeNo: 'order-test' } });
    }
    if (req.url === '/api/v2/billing/consume-magic' && req.headers['x-app-secret'] === 'test-app-secret') {
      const key = body.idempotencyKey;
      if (!consumed.has(key)) { magicValue -= body.magicValue; consumed.set(key, { transactionId: 'tx-1', magicValue }); }
      return send(200, { success: true, data: { ...consumed.get(key), amount: -body.magicValue, idempotent: consumed.size === 1 && magicValue !== 8 } });
    }
    return send(401, { success: false, error: { code: 'UNAUTHORIZED', message: '未授权' } });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = server.address().port;
  account.setAccountConfig({ account: { enabled: true, baseUrl: `http://127.0.0.1:${port}`, billing: { pointsPerCurrencyUnit: 100, currency: 'USD' } } });

  const loggedIn = await account.loginAccount('legacy@example.com', 'secret');
  assert.equal(loggedIn.user.points, undefined);
  assert.equal(loggedIn.user.magicValue, 10);
  assert.equal(fs.existsSync(process.env.MLI_ACCOUNT_SESSION_FILE), true);
  assert.equal((await account.requireAccount({ paid: true })).id, 'user-1');

  const log = { id: 'call-1', sessionId: 'session-1', provider: { model: 'demo' }, metrics: { cost: 0.02, currency: 'USD', totalTokens: 20 } };
  const first = await account.settleApiUsage(log);
  const second = await account.settleApiUsage(log);
  assert.equal(first.magicValue, 2);
  assert.equal(first.points, undefined);
  assert.equal(second.balance, 8);
  assert.equal(magicValue, 8);
  assert.equal(consumed.size, 1);
  assert.equal(account.publicAccountStatus().user.magicValue, 8);
  assert.equal((await account.updateAccountNickname('新昵称')).user.nickname, '新昵称');
  assert.equal((await account.refreshAccount()).user.nickname, '新昵称');

  await account.createPurchaseOrder('package-test', 'alipay', 'points');
  assert.deepEqual(orders, [{ packageId: 'package-test', payType: 'alipay', wallet: 'magic' }]);

  account.logoutAccount();
  assert.equal(fs.existsSync(process.env.MLI_ACCOUNT_SESSION_FILE), false);
});

test('估算积分只按匹配货币换算并向上取整', () => {
  assert.equal(account.pointsForCost(0.001, 'USD'), 1);
  assert.equal(account.pointsForCost(1, 'CNY'), 0);
});

test('新版魔力值按六位小数计算，新配置优先，旧字段仅作为配置兼容入口', () => {
  account.setAccountConfig({ account: { billing: { magicValuePerCurrencyUnit: 2, pointsPerCurrencyUnit: 100, currency: 'CNY' } } });
  assert.equal(account.magicValueForCost(0.125, 'CNY'), 0.25);
  assert.equal(account.magicValueForCost(0.0000004, 'CNY'), 0.000001);
  assert.equal(account.magicValueForCost(0.125, 'USD'), 0);
  assert.equal(account.publicAccountStatus().billing.magicValuePerCurrencyUnit, 2);
  assert.equal(account.publicAccountStatus().billing.pointsPerCurrencyUnit, undefined);
  account.setAccountConfig({ account: { billing: { magicValuePerCurrencyUnit: 0, pointsPerCurrencyUnit: 100, currency: 'CNY' } } });
  assert.equal(account.magicValueForCost(1, 'CNY'), 0);
});
test('验证码代理串行刷新、保存正确的 Cookie，普通账户请求不覆盖验证码会话', async t => {
  let generation = 0;
  const cookies = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.url === '/api/auth/captcha') {
      cookies.push(req.headers.cookie || '');
      generation++;
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'set-cookie': ['tracking=unrelated; Path=/', 'connect.sid=captcha-session; Path=/; HttpOnly'] });
      return res.end('<svg><text>code-' + generation + '</text></svg>');
    }
    if (req.url === '/api/auth/check-email') {
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'connect.sid=unrelated-session; Path=/' });
      return res.end(JSON.stringify({ success: true, exists: body.email === 'taken@example.com' }));
    }
    if (['/api/auth/verify-captcha', '/api/auth/send-register-code'].includes(req.url)) {
      assert.equal(req.headers.cookie, 'connect.sid=captcha-session');
      return send(200, { success: true });
    }
    send(404, { error: 'missing' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  account.setAccountConfig({ account: { baseUrl: 'http://127.0.0.1:' + server.address().port } });
  const images = await Promise.all([account.getAccountCaptcha(), account.getAccountCaptcha()]);
  assert.match(images[0].svg, /code-1/); assert.match(images[1].svg, /code-2/);
  assert.deepEqual(cookies, ['', 'connect.sid=captcha-session']);
  assert.equal((await account.checkAccountEmail('taken@example.com')).exists, true);
  assert.equal((await account.verifyAccountCaptcha('code-2')).success, true);
  assert.equal((await account.sendRegisterCode('new@example.com')).success, true);
});

test('验证码代理发现后台未下发会话 Cookie 时直接报告配置问题', async t => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end('<svg/>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  account.setAccountConfig({ account: { baseUrl: 'http://127.0.0.1:' + server.address().port } });
  await assert.rejects(account.getAccountCaptcha(), /未建立验证码会话/);
});
