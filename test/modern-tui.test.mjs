import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySession, hydrate, reduceEvent } from '../cli/modern/state.mjs';
import { TuiController } from '../cli/modern/controller.mjs';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('modern TUI hydration retains thinking and tools without duplicate assistant or tool messages', () => {
  const state = hydrate({ id: 's', eventSeq: 8, running: true, entries: [
    { id: 1, type: 'message', role: 'user', content: 'task', turnId: 't' },
    { type: 'step_start', turnId: 't', step: 0 },
    { id: 2, type: 'message', role: 'assistant', text: 'reply', turnId: 't', step: 0 },
    { type: 'tool_start', callId: 'c', turnId: 't', name: 'bash', args: { command: 'echo hi' } },
    { type: 'message', role: 'tool', toolCallId: 'c', content: 'hi' },
    { type: 'tool_end', callId: 'c', name: 'bash', content: 'hi', status: 'ok' },
    { type: 'step_end', turnId: 't', step: 0, text: 'reply', thinking: 'reason', status: 'ok' },
    { type: 'step_start', turnId: 't', step: 1 },
  ], activeStep: { turnId: 't', step: 1, text: 'live', thinking: 'live reason' } });
  assert.equal(state.parts.filter(item => item.kind === 'tool').length, 1);
  assert.equal(state.parts.find(item => item.id === 'step:t:0').thinking, 'reason');
  assert.equal(state.parts.find(item => item.id === 'step:t:1').text, 'live');
  assert.equal(reduceEvent(state, { type: 'text_delta', sessionId: 's', turnId: 't', step: 1, text: 'duplicate', seq: 8 }), state);
  const updated = reduceEvent(state, { type: 'text_delta', sessionId: 's', turnId: 't', step: 1, text: ' delta', seq: 9 });
  assert.equal(updated.parts.find(item => item.id === 'step:t:1').text, 'live delta');
});

test('events received while fetching a snapshot are merged only past its watermark', async context => {
  const fetched = deferred();
  const controller = new TuiController({ request: () => fetched.promise });
  context.after(() => controller.close());
  const restoring = controller.restore('s');
  controller.event({ type: 'text_delta', sessionId: 's', turnId: 't', step: 0, seq: 10, text: 'already captured' });
  controller.event({ type: 'text_delta', sessionId: 's', turnId: 't', step: 0, seq: 11, text: ' after' });
  fetched.resolve({ id: 's', eventSeq: 10, entries: [], activeStep: { turnId: 't', step: 0, text: 'snapshot', thinking: '' }, running: true });
  await restoring;
  assert.equal(controller.session.parts[0].text, 'snapshot after');
});

test('stale hydration cannot replace a newer session', async context => {
  const a = deferred(), b = deferred();
  const controller = new TuiController({ request: url => url.endsWith('/a') ? a.promise : b.promise });
  context.after(() => controller.close());
  const first = controller.restore('a');
  const second = controller.restore('b');
  b.resolve({ id: 'b', title: 'B', entries: [] });
  await second;
  a.resolve({ id: 'a', title: 'A', entries: [] });
  await first;
  assert.equal(controller.session.id, 'b');
});

test('double submission creates one session and preserves a draft typed during submission', async context => {
  const created = deferred();
  const calls = [];
  const controller = new TuiController({ async request(url, body) {
    calls.push({ url, body });
    if (url === '/api/session') return created.promise;
    if (url === '/api/session/s') return { id: 's', entries: [], running: false };
    return {};
  } });
  context.after(() => controller.close());
  controller.connected = true;
  controller.saveDraft('first');
  const sending = controller.send();
  assert.equal(await controller.send(), false);
  controller.saveDraft('next draft', 4);
  await assert.rejects(controller.command('/new'), /正在提交/);
  await assert.rejects(controller.palette(), /正在提交/);
  created.resolve({ id: 's', title: 'first' });
  assert.equal(await sending, true);
  assert.equal(calls.filter(item => item.url === '/api/session').length, 1);
  assert.equal(calls.find(item => item.url.endsWith('/message')).body.text, 'first');
  assert.equal(controller.draft, 'next draft');
  assert.equal(controller.cursor, 4);
});

test('failed submission retains the input for retry and completion events do not leave a running state', async context => {
  const controller = new TuiController({ request: async () => { throw new Error('offline'); } });
  context.after(() => controller.close());
  controller.session = emptySession('s');
  controller.connected = true;
  controller.saveDraft('retry me');
  assert.equal(await controller.send(), false);
  assert.equal(controller.draft, 'retry me');
  assert.equal(controller.busy, false);
  controller.event({ type: 'message_start', sessionId: 's', turnId: 't', step: 0, seq: 1 });
  controller.event({ type: 'turn_end', sessionId: 's', turnId: 't', reason: 'error', error: 'failed', seq: 2 });
  assert.equal(controller.session.running, false);
  assert.equal(controller.session.parts[0].status, 'error');
});
