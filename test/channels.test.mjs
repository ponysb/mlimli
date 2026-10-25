import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-channel-'));
process.env.MLI_AGENT_CHANNEL_DATA = temp;
const channels = await import('../core/channels.mjs');
const { emit } = await import('../core/events.mjs');
const { authorize, resolveRequest } = await import('../core/permissions.mjs');

test('渠道配置、去重和白名单在 Agent 运行前生效', async () => {
  let runs = 0;
  channels.setChannelRunner({ run: async ({ onSession }) => { runs++; onSession(`s-${runs}`); return { sessionId: `s-${runs}`, workspaceId: 'w1' }; } });
  const item = channels.upsertChannel({ type: 'feishu', name: '测试飞书', enabled: true, credentials: { appId: 'app', appSecret: 'secret' }, allowUsers: ['u1'] });
  assert.equal(item.credentials.appSecret.length > 0, true);
  const denied = await channels.handleIncoming(item.id, { id: 'm-denied', senderId: 'u2', chatId: 'c1', text: 'hi' });
  assert.equal(denied.reason, 'not_allowed'); assert.equal(runs, 0);
  const accepted = await channels.handleIncoming(item.id, { id: 'm1', senderId: 'u1', chatId: 'c1', text: 'hi' });
  assert.equal(accepted.accepted, true); assert.equal(runs, 1);
  const duplicate = await channels.handleIncoming(item.id, { id: 'm1', senderId: 'u1', chatId: 'c1', text: 'hi' });
  assert.equal(duplicate.reason, 'duplicate'); assert.equal(runs, 1);
});

test('渠道适配器连接和断开不暴露凭据', async () => {
  let connected = 0; let disconnected = 0; const sent = [];
  channels.registerChannelAdapter({ type: 'feishu', name: '测试适配器', async connect() { connected++; return {}; }, async disconnect() { disconnected++; }, async send(_state, _target, text) { sent.push(text); } });
  const item = channels.listChannels().find((value) => value.type === 'feishu');
  await channels.connectChannel(item.id); assert.equal(connected, 1);
  assert.equal(channels.listChannels().find((value) => value.id === item.id).credentials.appSecret, 'sec****et');
  await channels.disconnectChannel(item.id); assert.equal(disconnected, 1);
});

test('权限请求按会话绑定回传到原消息渠道', async () => {
  const item = channels.listChannels().find((value) => value.type === 'feishu');
  await channels.connectChannel(item.id);
  channels.setChannelRunner({ run: async ({ onSession }) => { onSession('permission-session'); emit('permission_request', { sessionId: 'permission-session', request: { reqId: 'req-1', summary: '写入文件' } }); return { sessionId: 'permission-session' }; } });
  await channels.handleIncoming(item.id, { id: 'permission-message', senderId: 'u1', chatId: 'c1', text: 'run', replyTarget: { chatId: 'c1' } });
  assert.ok(channels.channelEvents().some((event) => event.type === 'permission_requested'));
  await channels.disconnectChannel(item.id);
});

test('渠道会清理控制字符并记录发送成功事件', async () => {
  const sent = [];
  channels.registerChannelAdapter({ type: 'dingtalk', name: '测试钉钉', async connect() { return {}; }, async disconnect() {}, async send(_state, _target, text) { sent.push(text); } });
  const item = channels.upsertChannel({ type: 'dingtalk', name: '测试钉钉', enabled: true, credentials: { clientId: 'id', clientSecret: 'secret' }, allowUsers: ['u1'] });
  channels.setChannelRunner({ run: async ({ onSession, message }) => { assert.equal(message.text, 'hi'); onSession('ding-session'); return { sessionId: 'ding-session' }; } });
  const result = await channels.handleIncoming(item.id, { id: 'ding-1', senderId: 'u1', chatId: 'c1', text: ' hi\u0000 ' });
  assert.equal(result.accepted, true);
  await channels.connectChannel(item.id);
  assert.equal(await channels.send(item.id, { chatId: 'c1' }, 'ok'), true);
  assert.deepEqual(sent, ['ok']);
  assert.ok(channels.channelEvents().some(event => event.type === 'message_sent'));
});

test('没有会话绑定的渠道用户不能审批其他会话请求', async () => {
  const item = channels.listChannels().find(value => value.type === 'dingtalk');
  let reqId;
  const { onEvent } = await import('../core/events.mjs');
  const unsub = onEvent(event => { if (event.type === 'permission_request') reqId = event.request.reqId; });
  const approval = authorize({ tool: { name: 'channel-test', permission: 'L3' }, session: { id: 'other-session', mode: 'default' }, args: {}, allowRemember: false });
  try {
    assert.ok(reqId);
    const result = await channels.handleIncoming(item.id, { id: 'bad-approval', senderId: 'u1', chatId: 'other-chat', text: `/allow ${reqId}` });
    assert.equal(result.resolved, false);
  } finally { resolveRequest(reqId, 'deny', 'other-session'); unsub(); await approval; }
});

test('断开进行中的连接会清理延迟返回的适配器', async () => {
  let resolve;
  let disconnected = 0;
  channels.registerChannelAdapter({ type: 'feishu', async connect() { return new Promise(done => { resolve = done; }); }, async disconnect() { disconnected++; } });
  const item = channels.upsertChannel({ type: 'feishu', enabled: true });
  const connecting = channels.connectChannel(item.id);
  await new Promise(done => setImmediate(done));
  await assert.rejects(channels.connectChannel(item.id), /正在进行/);
  await channels.disconnectChannel(item.id);
  resolve({});
  await assert.rejects(connecting, /取消/);
  assert.equal(disconnected, 1);
  assert.equal(channels.getChannel(item.id).status, 'disconnected');
});

test('长回复分段后保留完整 Unicode 内容且发送失败可观测', async () => {
  const sent = [];
  channels.registerChannelAdapter({ type: 'dingtalk', async connect() { return {}; }, async disconnect() {}, async send(_state, _target, text) { sent.push(text); } });
  const item = channels.listChannels().find(value => value.type === 'dingtalk');
  await channels.connectChannel(item.id);
  const text = '中文😀'.repeat(2500);
  assert.equal(await channels.send(item.id, {}, text), true);
  assert.equal(sent.join(''), text);
  assert.ok(sent.every(part => Buffer.byteLength(part) <= 6000));
  channels.registerChannelAdapter({ type: 'dingtalk', async connect() { return {}; }, async send() { throw new Error('expired'); } });
  assert.equal(await channels.send(item.id, {}, 'failed'), false);
  assert.equal(channels.channelEvents()[0].type, 'send_error');
});

test('运行失败仍保留已创建的渠道会话映射', async () => {
  const item = channels.listChannels().find(value => value.type === 'dingtalk');
  channels.setChannelRunner({ run: async ({ onSession }) => { onSession('failed-session'); throw new Error('task failed'); } });
  await assert.rejects(channels.handleIncoming(item.id, { id: 'failed-task', senderId: 'u1', chatId: 'c1', text: 'run' }), /task failed/);
  assert.equal(channels.getChannelMapping(item.id, `${item.id}:c1:u1`).sessionId, 'failed-session');
});
