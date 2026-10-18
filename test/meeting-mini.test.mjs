import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import mini from '../electron/meeting-mini.cjs';

class FakeWindow extends EventEmitter {
  constructor(options = {}) {
    super(); this.options = options; this.visible = false; this.destroyed = false; this.minimized = false; this.bounds = { x: 10, y: 10, width: options.width || 100, height: options.height || 100 };
    this.webContents = new EventEmitter(); this.webContents.sent = []; this.webContents.send = (...args) => this.webContents.sent.push(args); this.webContents.isDestroyed = () => false; this.webContents.isLoading = () => false; this.webContents.setWindowOpenHandler = () => {};
  }
  isDestroyed() { return this.destroyed; } isMinimized() { return this.minimized; } isVisible() { return this.visible; }
  showInactive() { this.visible = true; } hide() { this.visible = false; } show() { this.visible = true; } focus() {} restore() { this.minimized = false; this.emit('restore'); }
  setBounds(bounds) { this.bounds = bounds; } getBounds() { return this.bounds; } setMenuBarVisibility() {} setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} loadFile(file) { this.file = file; }
  destroy() { this.destroyed = true; this.visible = false; this.emit('closed'); }
}

function fixture() {
  const handlers = new Map(), listeners = new Map(), windows = [];
  class BrowserWindow extends FakeWindow { constructor(options) { super(options); windows.push(this); } }
  const main = new FakeWindow();
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler), on: (name, handler) => listeners.set(name, handler) };
  const controller = mini.createMeetingMiniController({ BrowserWindow, screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } }) }, ipcMain, preload: 'preload.cjs', page: 'meeting-mini.html', getMainWindow: () => main, getServerUrl: () => 'http://127.0.0.1:4567' });
  controller.observe(main);
  return { controller, handlers, listeners, windows, main, event: { sender: main.webContents, senderFrame: { url: 'http://127.0.0.1:4567/task' } } };
}

test('meeting mini appears only while a meeting is active and the main window is minimized', () => {
  const value = fixture();
  value.listeners.get('meeting-recording-state')(value.event, { active: true, phase: 'recording', elapsed: 17, transcript: '  当前 发言  ', speaking: true });
  assert.equal(value.windows.length, 0);
  value.main.minimized = true; value.main.emit('minimize');
  assert.equal(value.windows.length, 1); assert.equal(value.windows[0].visible, true);
  assert.deepEqual(value.controller.getState(), { active: true, phase: 'recording', elapsed: 17, transcript: '当前 发言', speaking: true, expanded: false });
  assert.deepEqual(value.windows[0].bounds, { x: 916, y: 16, width: 268, height: 76 });
  value.main.minimized = false; value.main.emit('restore');
  assert.equal(value.windows[0].visible, false);
});

test('meeting mini actions resize, restore and request recording finish', async () => {
  const value = fixture(); value.main.minimized = true;
  value.listeners.get('meeting-recording-state')(value.event, { active: true, phase: 'recording' });
  const miniWindow = value.windows[0], event = { sender: miniWindow.webContents };
  await value.handlers.get('meeting-mini-action')(event, 'expand');
  assert.deepEqual(miniWindow.bounds, { x: 800, y: 16, width: 384, height: 500 });
  await value.handlers.get('meeting-mini-action')(event, 'finish');
  assert.ok(value.main.webContents.sent.some(([name]) => name === 'meeting-mini-finish-requested'));
  assert.equal(value.controller.getState().phase, 'stopping');
  await value.handlers.get('meeting-mini-action')(event, 'restore');
  assert.equal(value.main.minimized, false); assert.equal(miniWindow.visible, false);
});

test('meeting mini rejects state updates from foreign renderer origins', () => {
  const value = fixture(); value.main.minimized = true;
  value.listeners.get('meeting-recording-state')({ sender: value.main.webContents, senderFrame: { url: 'https://evil.example' } }, { active: true, phase: 'recording' });
  assert.equal(value.windows.length, 0);
  assert.equal(mini.cleanState({ active: true, phase: 'unknown' }).active, false);
});
