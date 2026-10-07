import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import desktopUpdates from '../electron/updater.cjs';
import runtime from '../electron/runtime.cjs';
import { waitFor } from '../scripts/verify-win.mjs';
import http from 'node:http';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

function fixture(options = {}) {
  const handlers = new Map(), sent = [], updater = new EventEmitter(), app = new EventEmitter();
  app.isPackaged = true; app.getVersion = () => '0.2.0'; app.getPath = () => 'C:\\Apps\\MoliCreation\\MoliCreation.exe';
  const webContents = { mainFrame: {}, isDestroyed: () => false, send: (channel, state) => sent.push({ channel, state }) };
  const win = { isDestroyed: () => false, webContents };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  let config;
  const controller = desktopUpdates.registerDesktopUpdater({ app, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, getWindow: () => win,
    baseUrl: 'https://updates.example.com/prefix', beforeInstall: async () => {}, platform: 'win32', arch: 'x64', portable: false,
    factory: value => { config = value; return updater; }, ...options });
  const invoke = channel => handlers.get(`desktop-update-${channel}`)(event);
  return { controller, updater, handlers, event, invoke, sent, config };
}

test('updater isolates Windows variants, preserves URL prefixes, and disables unattended installs', () => {
  const f = fixture({ arch: 'ia32' });
  assert.equal(f.config.url, 'https://updates.example.com/prefix/api/v2/releases/updates/windows-legacy-ia32/');
  assert.equal(f.updater.autoDownload, false); assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.allowDowngrade, false); assert.equal(f.updater.allowPrerelease, false);
  assert.equal(f.updater.disableDifferentialDownload, true);
  assert.throws(() => desktopUpdates.updateFeedUrl('https://user:secret@example.com', 'windows-x64'), /无效/);
  assert.throws(() => f.handlers.get('desktop-update-install')({ sender: {}, senderFrame: {} }), /主窗口/);
  assert.throws(() => f.handlers.get('desktop-update-install')({ ...f.event, senderFrame: {} }), /主窗口/);
  for (const options of [{ portable: true }, { platform: 'darwin' }, { baseUrl: '' }]) {
    const disabled = fixture({ ...options, factory: () => { throw new Error('must not initialize'); } });
    assert.equal(disabled.controller.snapshot().status, 'unsupported');
  }
});

test('development reports the project version, while installed builds preserve their own release version', () => {
  const app = new EventEmitter();app.isPackaged = false;app.getVersion = () => '44.4.5';
  const development = fixture({ app });
  assert.equal(development.controller.snapshot().currentVersion, createRequire(import.meta.url)('../package.json').version);
  assert.notEqual(development.controller.snapshot().currentVersion, '44.4.5');
  assert.equal(fixture().controller.snapshot().currentVersion, '0.2.0');
});

test('development can check and announce updates but cannot download or install over the source runtime', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const app = new EventEmitter(); app.isPackaged = false; app.getVersion = () => '44.4.5';
  const f = fixture({ app, beforeInstall: () => { throw new Error('development must not shut down'); } });
  let checks = 0;
  f.updater.checkForUpdates = async () => { checks++; f.updater.emit('checking-for-update'); f.updater.emit('update-available', { version: '0.3.1', releaseNotes: '开发模式检测' }); };
  f.updater.downloadUpdate = () => { throw new Error('development must not download'); };
  f.updater.quitAndInstall = () => { throw new Error('development must not install'); };
  assert.equal(f.controller.snapshot().status, 'idle');
  assert.equal(f.controller.snapshot().mode, 'development');
  assert.equal(f.controller.snapshot().canInstall, false);
  f.controller.start();
  context.mock.timers.tick(0); await new Promise(setImmediate);
  assert.equal(checks, 1);
  assert.equal(f.controller.snapshot().version, '0.3.1');
  await f.invoke('check'); assert.equal(checks, 2);
  assert.equal((await f.invoke('download')).status, 'available');
  f.updater.emit('update-downloaded', { version: '0.3.1' });
  assert.equal((await f.invoke('install')).status, 'downloaded');
  f.controller.dispose();
});

test('download progress and retry state are delivered to the main window without duplicate downloads', async () => {
  const f = fixture(); let checks = 0, downloads = 0, finish;
  f.updater.checkForUpdates = async () => { checks++; f.updater.emit('checking-for-update'); f.updater.emit('update-available', { version: '0.3.0', releaseNotes: '更新说明' }); };
  f.updater.downloadUpdate = () => { downloads++; return new Promise(resolve => { finish = resolve; }); };
  await f.invoke('check');
  const pending = f.invoke('download');
  await Promise.resolve();
  await f.invoke('download'); await f.invoke('check');
  assert.equal(checks, 1); assert.equal(downloads, 1);
  f.updater.emit('download-progress', { percent: 44.5 });
  assert.equal(f.controller.snapshot().percent, 44.5);
  f.updater.emit('update-downloaded', { version: '0.3.0' }); finish(); await pending;
  assert.equal(f.controller.snapshot().status, 'downloaded');
  await f.invoke('check'); assert.equal(checks, 1);
  assert.ok(f.sent.some(item => item.state.status === 'downloading' && item.state.percent === 44.5));
});

test('installation waits for runtime shutdown, rejects concurrent installation, and remains retryable when busy', async () => {
  let finish, blocked = true, installs = 0;
  const f = fixture({ beforeInstall: () => blocked ? Promise.reject(new Error('任务正在运行')) : new Promise(resolve => { finish = resolve; }) });
  f.updater.quitAndInstall = (...args) => { assert.deepEqual(args, [true, true]); installs++; };
  f.updater.emit('update-downloaded', { version: '0.3.0' });
  await f.invoke('install');
  assert.equal(installs, 0); assert.equal(f.controller.snapshot().status, 'downloaded');
  assert.match(f.controller.snapshot().message, /任务/);
  blocked = false;
  const pending = f.invoke('install'); await f.invoke('install');
  assert.equal(installs, 0);
  finish(); await pending; assert.equal(installs, 1);
});

test('missing feeds and failed checks produce readable states and permit retry', async () => {
  const f = fixture(); let fail = true;
  f.updater.checkForUpdates = async () => { if (fail) throw Object.assign(new Error('404'), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' }); f.updater.emit('update-not-available'); };
  await f.invoke('check'); assert.match(f.controller.snapshot().message, /尚未发布/);
  fail = false; await f.invoke('check'); assert.equal(f.controller.snapshot().status, 'idle');
});

test('startup checks immediately without manual input and repeats every six hours until disposed', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture(); let checks = 0;
  f.updater.checkForUpdates = async () => { checks++; f.updater.emit('update-not-available'); };
  f.controller.start(); f.controller.start();
  assert.equal(checks, 0);
  context.mock.timers.tick(0); await new Promise(setImmediate); assert.equal(checks, 1);
  context.mock.timers.tick(6 * 60 * 60 * 1000); await new Promise(setImmediate); assert.equal(checks, 2);
  f.controller.dispose();
  context.mock.timers.tick(6 * 60 * 60 * 1000); await Promise.resolve(); assert.equal(checks, 2);
});

test('shared runtime refuses an update while a CLI is attached and stops before permitting installation', async context => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-update-runtime-'));
  const runtimeRoot = path.resolve('');
  let desktop, cli;
  context.after(async () => { await cli?.release(); await desktop?.release(); fs.rmSync(dataRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  desktop = await runtime.acquireRuntime({ executable: process.execPath, runtimeRoot, dataRoot, environment: { MLI_ACCOUNT_ENABLED: 'false', MLI_ACCOUNT_APP_SECRET: '' } });
  cli = await runtime.connectRuntime(desktop.url);
  await assert.rejects(desktop.prepareUpdate(), /其他终端/);
  assert.equal((await fetch(`${desktop.url}/api/runtime`)).status, 200);
  await cli.release(); cli = null;
  const post = async (url, body) => (await fetch(`${desktop.url}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const session = await post('/api/session', { title: '更新前任务检查' });
  await post(`/api/session/${session.id}/message`, { text: '写一个 hello.txt，用于更新验证' });
  await waitFor(async () => (await (await fetch(`${desktop.url}/api/session/${session.id}`)).json()).permission);
  await assert.rejects(desktop.prepareUpdate(), /任务或终端命令/);
  await post(`/api/session/${session.id}/abort`, {});
  await waitFor(async () => !(await (await fetch(`${desktop.url}/api/session/${session.id}`)).json()).running);
  await desktop.prepareUpdate();
  const { alive } = createRequire(import.meta.url)('../core/runtime-host.cjs');
  assert.equal(alive(desktop.pid), false);
});

test('real Electron updaters download full installers and reject SHA-512 mismatches on modern and legacy engines', { skip: process.platform !== 'win32' }, async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-real-updater-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const bytes = Buffer.from('MZinstaller-smoke-bytes');
  const hash = crypto.createHash('sha512').update(bytes).digest('base64');
  const server = http.createServer((req, res) => {
    const bad = req.url.startsWith('/bad/');
    if (req.url.split('?')[0].endsWith('/latest.yml')) {
      res.setHeader('content-type', 'text/yaml');
      res.end(JSON.stringify({ version: req.url.startsWith('/development/') ? '0.3.1' : '99.0.0', files: [{ url: 'fixture.exe', sha512: hash, size: bytes.length }], path: 'fixture.exe', sha512: hash, releaseNotes: '真实下载验证' }));
    } else if (req.url.endsWith('/fixture.exe')) {
      res.setHeader('content-length', bytes.length); res.end(bad ? Buffer.from('MZinstaller-wrong-bytes') : bytes);
    } else { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const engines = [path.resolve('node_modules/electron/dist/electron.exe'), path.resolve('node_modules/.cache/electron-22.3.27-win32-ia32/electron.exe')];
  for (const [index, executable] of engines.entries()) {
    if (!fs.existsSync(executable)) { context.diagnostic(`missing optional engine: ${path.basename(path.dirname(executable))}`); continue; }
    const root = path.join(directory, String(index)); fs.mkdirSync(root);
    fs.copyFileSync('test/fixtures/desktop-update-smoke.cjs', path.join(root, 'main.cjs'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: `mli-updater-smoke-${index}`, version: '0.2.0', main: 'main.cjs' }));
    const report = path.join(root, 'result.json');
    const env = { ...process.env, LOCALAPPDATA: root, MLI_UPDATE_SMOKE_ROOT: path.resolve('package.json'), MLI_UPDATE_SMOKE_REPORT: report, MLI_UPDATE_SMOKE_URL: `http://127.0.0.1:${server.address().port}` };
    delete env.ELECTRON_RUN_AS_NODE;
    try { await promisify(execFile)(executable, [root], { windowsHide: true, env, timeout: 25000 }); }
    catch (error) { throw new Error(`Electron updater: ${fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : error.message}`); }
    const result = JSON.parse(fs.readFileSync(report));
    assert.equal(result.valid.status, 'downloaded'); assert.equal(result.corrupt.status, 'error');
    assert.equal(result.development.status, 'available'); assert.equal(result.development.version, '0.3.1');
    assert.equal(result.development.canInstall, false);
    context.diagnostic(`Electron ${result.electron} / Node ${result.node}: real download and checksum passed`);
  }
});
