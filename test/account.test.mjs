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
