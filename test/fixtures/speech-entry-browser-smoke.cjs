// Run with: node node_modules/electron/cli.js test/fixtures/speech-entry-browser-smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { app, BrowserWindow } = require('electron');
const runtime = require('../../electron/runtime.cjs');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-speech-entry-'));
app.setPath('userData', path.join(directory, 'electron'));
let instance, win;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function cleanup(code) {
  win?.destroy();
  if (instance?.child.exitCode === null) { const exited = once(instance.child, 'exit'); instance.child.kill(); await exited; }
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  app.exit(code);
}
app.whenReady().then(async () => {
  instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory });
  const { url } = await instance.ready;
  win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const evaluate = async source => {
    try { return await win.webContents.executeJavaScript(source, true); }
    catch (error) { console.error('Renderer script:', source); throw error; }
  };
  const waitFor = async condition => {
    const until = Date.now() + 15000;
    while (Date.now() < until) { if (await evaluate(condition)) return; await delay(100); }
    throw new Error(`Timed out: ${condition}\n${await evaluate('document.body.innerText')}`);
  };
  await win.loadURL(url);
  await waitFor("Boolean(document.querySelector('.voice-button')) && !document.querySelector('.voice-button').disabled");
  await evaluate(`(() => {
    const original = window.fetch;
    window.__speechEntry = { media: 0, sessions: 0 };
    window.fetch = async (url, options = {}) => {
      if (url === '/api/speech/sessions' && options.method === 'POST') window.__speechEntry.sessions++;
      return original(url, options);
    };
    navigator.mediaDevices.getUserMedia = async () => { window.__speechEntry.media++; throw new Error('Unexpected microphone request'); };
    navigator.mediaDevices.getDisplayMedia = async () => { window.__speechEntry.media++; throw new Error('Unexpected screen request'); };
    dispatchEvent(new Event('speech-settings-changed'));
  })()`);
  await delay(200);
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  const bounds = () => evaluate("(() => { const r = document.querySelector('.voice-button').getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()");
  const settings = async () => {
    await waitFor("Array.from(document.querySelectorAll('[role=tab]')).some(tab => tab.textContent === '语音与声纹' && tab.getAttribute('aria-selected') === 'true') && document.querySelectorAll('.speech-model-card').length > 0");
    assert.equal(await evaluate("Boolean(document.querySelector('#meeting-dialog'))"), false);
    assert.equal(await evaluate("document.body.innerText.includes('请先到设置下载语音模型')"), false);
    assert.deepEqual(await evaluate('window.__speechEntry'), { media: 0, sessions: 0 });
  };
  const back = async () => {
    await evaluate("document.querySelector('.main-nav button').click()");
    await waitFor("Boolean(document.querySelector('.voice-button')) && !document.querySelector('.voice-button').disabled");
  };
  for (const duration of [80, 600]) {
    const point = await bounds();
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    await delay(duration);
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
    await settings(); await back();
  }
  await evaluate("document.querySelector('.voice-button').click()");
  await settings(); await back();
  await evaluate("window.__speechButton = document.querySelector('.voice-button'); window.__speechButton.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))");
  await evaluate("window.__speechButton.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }))");
  await settings(); await back();
  win.setSize(390, 844);
  await evaluate("if (!document.querySelector('.app-shell').classList.contains('sidebar-collapsed')) document.querySelector('.mobile-nav-toggle').click()");
  await delay(300);
  await evaluate("document.querySelector('.voice-button').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, pointerType: 'touch', bubbles: true }))");
  await settings();
  await delay(300);
  fs.writeFileSync(path.join(root, 'logs', 'speech-entry-settings-mobile.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  assert.equal(fs.existsSync(path.join(root, 'benchmarks')), false);
  console.log('Speech entry passed: missing model click, hold, keyboard and touch open voice model settings without media access or speech sessions; startup creates no benchmarks directory.');
  await cleanup(0);
}).catch(async error => { console.error(error); await cleanup(1); });
