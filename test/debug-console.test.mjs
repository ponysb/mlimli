import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import debug from '../electron/debug-console.cjs';

test('控制台打开独立窗口、同步手动关闭状态，拒绝非主窗口请求', () => {
  const handlers = new Map(), target = new EventEmitter(), sent = [];
  let opened = false, destroyed = false;
  target.mainFrame = {};
  target.isDestroyed = () => destroyed;
  target.isDevToolsOpened = () => opened;
  target.send = (channel, payload) => sent.push({ channel, payload });
  target.openDevTools = options => { assert.deepEqual(options, { mode: 'detach', activate: true }); opened = true; target.emit('devtools-opened'); };
  target.closeDevTools = () => { opened = false; target.emit('devtools-closed'); };
  debug.registerDebugConsole({ handle: (name, callback) => handlers.set(name, callback) }, () => ({ isDestroyed: () => destroyed, webContents: target }));
  debug.observeDebugConsole(target);
  const event = { sender: target, senderFrame: target.mainFrame };
  assert.deepEqual(handlers.get('debug-console-status')(event), { open: false });
  assert.deepEqual(handlers.get('set-debug-console')(event, true), { open: true });
  target.closeDevTools();
  assert.deepEqual(sent, [{ channel: 'debug-console-changed', payload: { open: true } }, { channel: 'debug-console-changed', payload: { open: false } }]);
  assert.deepEqual(handlers.get('set-debug-console')(event, false), { open: false });
  assert.throws(() => handlers.get('set-debug-console')(event, 'true'), /参数无效/);
  assert.throws(() => handlers.get('set-debug-console')({ sender: {}, senderFrame: {} }, true), /主窗口/);
  assert.throws(() => handlers.get('set-debug-console')({ sender: target, senderFrame: {} }, true), /主窗口/);
  destroyed = true;
  assert.throws(() => handlers.get('debug-console-status')(event), /窗口已关闭/);
});
