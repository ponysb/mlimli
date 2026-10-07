// Run with: node node_modules/electron/cli.js test/fixtures/computer-use-browser-smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { app, BrowserWindow } = require('electron');
const runtime = require('../../electron/runtime.cjs');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-computer-use-browser-'));
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
  const info = await (await fetch(`${url}/api/info`)).json();
  const plugin = info.plugins.plugins.find(item => item.name === 'computer-use');
  assert.ok(plugin); assert.equal(plugin.displayName, 'computer use');
  assert.equal(plugin.tools.length, 7);
  assert.ok(!info.plugins.plugins.some(item => item.name === 'desktop'));
  const created = await (await fetch(`${url}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  assert.equal((await (await fetch(`${url}/api/session/${created.id}`)).json()).desktopEnabled, false);
  const enabled = await fetch(`${url}/api/session/${created.id}/desktop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"enabled":true}' });
  assert.equal(enabled.ok, true);
  assert.equal((await (await fetch(`${url}/api/session/${created.id}`)).json()).desktopEnabled, true);
  win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const evaluate = source => win.webContents.executeJavaScript(source, true);
  const waitFor = async condition => {
    const until = Date.now() + 15000;
    while (Date.now() < until) { if (await evaluate(condition)) return; await delay(100); }
    throw new Error(`Timed out: ${condition}\n${await evaluate('document.body.innerText')}`);
  };
  const screenshot = async name => {
    await delay(300);
    fs.writeFileSync(path.join(root, 'logs', name), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  };
  await win.loadURL(url);
  await waitFor("Boolean(document.querySelector('textarea')) && !document.querySelector('textarea').disabled");
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    win.setSize(width, height);
    if (width < 800) await evaluate("if (!document.querySelector('.app-shell').classList.contains('sidebar-collapsed')) document.querySelector('.mobile-nav-toggle').click()");
    await evaluate("(() => { const input = document.querySelector('textarea'); input.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '@computer'); input.setSelectionRange(9, 9); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await waitFor("Array.from(document.querySelectorAll('.capability-option b')).some(item => item.textContent === 'computer use')");
    const fits = await evaluate("(() => { const r = document.querySelector('.capability-popover').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()");
    assert.equal(fits, true);
    await screenshot(`computer-use-menu-${label}.png`);
    await evaluate("Array.from(document.querySelectorAll('.capability-option')).find(item => item.querySelector('b')?.textContent === 'computer use').click()");
    await waitFor("Array.from(document.querySelectorAll('.composer-reference')).some(item => item.textContent === 'computer use')");
    await evaluate("document.querySelector('.composer-reference button').click()");
    await waitFor("!document.querySelector('.composer-reference')");
  }
  console.log('Computer use UI passed: loaded tool catalog, session desktop switch, menu search, reference selection, desktop/mobile layout.');
  await cleanup(0);
}).catch(async error => { console.error(error); await cleanup(1); });
