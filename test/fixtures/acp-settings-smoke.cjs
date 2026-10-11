const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const runtime = require('../../electron/runtime.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-acp-ui-'));
app.setPath('userData', path.join(directory, 'electron'));
let instance;
app.whenReady().then(async () => {
  instance = runtime.startRuntime({ executable: process.execPath, runtimeRoot: path.resolve(__dirname, '../..'), dataRoot: path.join(directory, 'data'), environment: { MLI_ACCOUNT_ENABLED: 'false' } });
  const { url } = await instance.ready;
  const window = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadURL(url);
  const evaluate = source => window.webContents.executeJavaScript(source, true);
  const wait = async source => {
    for (let attempt = 0; attempt < 150; attempt++) { if (await evaluate(source)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error('UI timeout: ' + source);
  };
  await wait("document.body.innerText.includes('工作台')");
  await evaluate("window.dispatchEvent(new CustomEvent('mli:open-settings', { detail: { tab: 'acp' } }))");
  await wait("Boolean(document.querySelector('.acp-settings'))");
  await wait("!document.body.innerText.includes('正在加载配置')");
  await evaluate("Array.from(document.querySelectorAll('.acp-settings button')).find(el => el.innerText.includes('添加 Agent')).click()");
  await wait("Boolean(document.querySelector('.acp-form'))");
  await evaluate(`(() => { const fields = document.querySelectorAll('.acp-form input:not([type=checkbox])'); const values = ['ui-agent', 'UI Agent', '/test/agent', '5000']; fields.forEach((field, index) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, values[index]); field.dispatchEvent(new Event('input', { bubbles: true })); }); })()`);
  await evaluate("document.querySelector('.acp-form button[type=submit]').click()");
  await wait("document.body.innerText.includes('已保存，后续新任务立即生效')");
  assert.equal(await evaluate("document.querySelectorAll('.acp-list button').length"), 1);
  if (process.env.MLI_ACP_SCREENSHOT) fs.writeFileSync(process.env.MLI_ACP_SCREENSHOT, (await window.webContents.capturePage()).toPNG());
  await evaluate("Array.from(document.querySelectorAll('.acp-form button')).find(el => el.innerText === '删除').click()");
  await evaluate("Array.from(document.querySelectorAll('.acp-delete button')).find(el => el.innerText === '确认删除').click()");
  await wait("document.body.innerText.includes('Agent 已删除')");
  process.stdout.write('ACP settings UI smoke passed\n');
  app.exit(0);
}).catch(error => { process.stderr.write(error.stack + '\n'); app.exit(1); });
app.on('will-quit', () => { instance?.child.kill(); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
