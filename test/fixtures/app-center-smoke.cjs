const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createRequire } = require('node:module');
const electron = require('electron');
const { app, BrowserWindow, session, ipcMain, webContents } = electron;
const rootRequire = createRequire(process.env.MLI_APP_SMOKE_ROOT);
rootRequire('./electron/compat.cjs').installCompatibility();
const runtime = rootRequire('./electron/runtime.cjs');
const { createAppBrowser, registerAppBrowser } = rootRequire('./electron/app-center.cjs');
const report = process.env.MLI_APP_SMOKE_REPORT, directory = path.dirname(report), dataRoot = path.join(directory, 'data');
app.setPath('userData', dataRoot);
let instance, controller, win, catalogServer;
const editorBundle = rootRequire('esbuild').buildSync({
  stdin: { contents: `import {EditorView} from '@codemirror/view'; import {EditorState} from '@codemirror/state'; import {history, undo} from '@codemirror/commands';
    window.editor = new EditorView({state: EditorState.create({doc: '原始编辑器内容', extensions: [history()]}), parent: document.querySelector('#editor')});
    window.undoEditor = () => undo(window.editor);
    window.editor.contentDOM.setAttribute('aria-label', '代码编辑器');`, resolveDir: path.dirname(process.env.MLI_APP_SMOKE_ROOT) },
  bundle: true, write: false, platform: 'browser', format: 'iife',
}).outputFiles[0].text;
const controlledInputBundle = rootRequire('esbuild').buildSync({
  stdin: { contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    function ControlledInput() { const [value, setValue] = useState(''); window.readControlledValue = () => value; return React.createElement('input', {id:'controlled-input', 'aria-label':'React 受控输入', value, onChange:event => setValue(event.target.value)}); }
    createRoot(document.querySelector('#react-root')).render(React.createElement(ControlledInput));`, resolveDir: path.dirname(process.env.MLI_APP_SMOKE_ROOT) },
  bundle: true, write: false, platform: 'browser', format: 'iife',
}).outputFiles[0].text;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => finish(new Error('应用台真实浏览器测试超时')), 45000);
async function finish(error, result) {
  clearTimeout(deadline);
  controller?.destroy();
  if (instance?.child.exitCode === null) { const done = new Promise(resolve => instance.child.once('exit', resolve)); instance.child.kill(); await done; }
  if (catalogServer) await new Promise(resolve => catalogServer.close(resolve));
  fs.writeFileSync(report, JSON.stringify(error ? { error: error.stack } : result));
  app.exit(error ? 1 : 0);
}
app.whenReady().then(async () => {
  catalogServer = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, data: { items: [
    { id: 'github', name: 'GitHub', url: 'https://github.com', description: '代码与协作' },
    { id: 'notion', name: 'Notion', url: 'https://www.notion.so', description: '笔记与知识库' },
    { id: 'linear', name: 'Linear', url: 'https://linear.app', description: '项目与任务' }
  ] } })); });
  await new Promise(resolve => catalogServer.listen(0, '127.0.0.1', resolve));
  instance = runtime.startRuntime({ executable: process.env.MLI_APP_SMOKE_NODE, legacy: false, runtimeRoot: path.dirname(process.env.MLI_APP_SMOKE_ROOT), dataRoot, environment: { MLI_ACCOUNT_ENABLED: 'true', MLI_ACCOUNT_SERVER_URL: `http://127.0.0.1:${catalogServer.address().port}`, MLI_ACCOUNT_APP_SECRET: '' } });
  const { url } = await instance.ready;
  const api = async (route, body) => { const response = await fetch(url + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data; };
  const record = (await api('/api/app-center/apps', { name: '测试应用', url: 'https://example.com/home' })).app;
  const appSession = session.fromPartition('persist:mli-app-' + record.id);
  await new Promise((resolve, reject) => appSession.protocol.interceptBufferProtocol('https', (request, callback) => {
    appSession.cookies.get({ url: 'https://example.com' }).then(cookies => {
      const logged = cookies.some(c => c.name === 'fixture_session');
      const url = new URL(request.url);
      let html;
      if (url.pathname === '/login') html = `<html><body><h1>测试平台登录</h1><input type="password" id="password" value="DO_NOT_RETURN"><button id="login" onclick="document.cookie='fixture_session=yes; Max-Age=86400; Secure; SameSite=Lax; Path=/'; location.href='/home'">登录</button></body></html>`;
      else if (!logged) html = `<html><body><script>location.href='/login'</script></body></html>`;
      else html = `<html><body><h1>测试平台 · 已登录</h1><label>任务文字<input id="note" placeholder="任务文字"></label><input type="password" value="DO_NOT_RETURN"><button id="submit" onclick="document.querySelector('#result').innerText=document.querySelector('#note').value">提交任务</button><p id="result">等待操作</p><textarea aria-label="多行文字"></textarea><div id="react-root"></div><input aria-label="只读文字" readonly value="保持原样"><div id="editor" style="width:700px;min-height:120px;border:1px solid"></div><script>${editorBundle}</script><script>${controlledInputBundle}</script><script>window.__mliAppRefs=new Map([['forged', document.querySelector('input[type=password]')]])</script></body></html>`;
      callback({ data: Buffer.from(html), mimeType: 'text/html', statusCode: 200 });
    }).catch(() => callback({ error: -2 }));
  }, error => error ? reject(error) : resolve()));
  win = new BrowserWindow({ show: false, width: 1440, height: 920, webPreferences: { offscreen: Boolean(process.env.MLI_APP_CENTER_SCREENSHOT), backgroundThrottling: false, preload: path.join(path.dirname(process.env.MLI_APP_SMOKE_ROOT), 'electron', 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  controller = createAppBrowser({ electron, getWindow: () => win, serverUrl: url, dataRoot, testAllowLocal: true });
  registerAppBrowser({ ipcMain, controller, getWindow: () => win, serverUrl: url }); controller.start();
  await win.loadURL(url);
  const evaluate = source => win.webContents.executeJavaScript(source, true);
  async function until(check, message) { const end = Date.now() + 12000; while (Date.now() < end) { if (await check()) return; await delay(60); } throw new Error(message + '\n' + JSON.stringify(webContents.getAllWebContents().map(wc => ({ url: wc.getURL(), type: wc.getType() }))) + '\n' + await evaluate('document.body.innerText')); }
  await until(() => evaluate("document.body.innerText.includes('工作台')"), '工作台未渲染');
  await evaluate(`Array.from(document.querySelectorAll('.main-nav button')).find(el=>el.innerText==='应用台').click()`);
  await until(() => evaluate("Boolean(document.querySelector('.app-center-page'))"), '应用台未进入');
  await until(() => evaluate("document.querySelectorAll('.app-center-grid .app-center-card').length === 4"), '平台和自建应用未显示在卡片网格');
  await evaluate("Array.from(document.querySelectorAll('.app-center-tabs button')).find(el=>el.innerText.includes('平台应用')).click()");
  assert.equal(await evaluate("document.querySelectorAll('.app-center-grid .app-center-card').length"), 3);
  await evaluate("Array.from(document.querySelectorAll('.app-center-tabs button')).find(el=>el.innerText.includes('我的应用')).click()");
  assert.equal(await evaluate("document.querySelectorAll('.app-center-grid .app-center-card').length"), 1);
  await evaluate("Array.from(document.querySelectorAll('.app-center-tabs button')).find(el=>el.innerText.includes('全部应用')).click()");
  if (process.env.MLI_APP_CENTER_SCREENSHOT) { await delay(400); fs.writeFileSync(process.env.MLI_APP_CENTER_SCREENSHOT, (await win.webContents.capturePage()).toPNG()); }
  await evaluate("document.querySelector('.app-center-add-card').click()");
  await until(() => evaluate("Boolean(document.querySelector('.app-center-dialog'))"), '网址添加表单未显示');
  await evaluate("(() => { const input = document.querySelector('.app-center-dialog input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'example.com/home'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await evaluate("document.querySelector('.app-center-dialog button[type=submit]').click()");
  await until(() => evaluate("Boolean(document.querySelector('.app-center-home')) && !document.querySelector('.app-center-dialog')"), '仅输入网址不能添加并打开应用');
  await evaluate("document.querySelector('.app-center-home').click()");
  await until(() => evaluate("Boolean(document.querySelector('.app-center-grid'))"), '不能返回应用卡片');
  await until(async () => (await api('/api/app-center')).browserConnected, '浏览器桥接未连接');
  const task = await api('/api/session', { title: '应用台流程测试' });
  const tool = (name, args) => api(`/api/session/${task.id}/dev-tool`, { tool: name, args });
  let resumed = false;
  const pending = tool('app_open', { app_id: record.id }).then(result => { resumed = true; return result; });
  await until(async () => (await api('/api/app-center')).pending.length === 1, '没有暂停等待登录');
  assert.equal(resumed, false);
  const remote = () => webContents.getAllWebContents().find(wc => wc.getURL().startsWith('https://example.com'));
  await until(async () => remote() && (await remote().executeJavaScript('location.pathname')) === '/login', '登录页未打开');
  assert.equal(await remote().executeJavaScript('typeof process'), 'undefined');
  assert.equal(await remote().executeJavaScript('typeof window.desktop'), 'undefined');
  await remote().executeJavaScript("document.querySelector('#login').click()", true);
  await until(async () => remote() && (await remote().executeJavaScript('location.pathname')) === '/home', '模拟用户登录失败');
  await controller.authorize(record.id);
  const opened = await pending; assert.equal(opened.ok, true); assert.equal(JSON.parse(opened.result.content).status, 'authorized');
  // Full access must operate an authorized app without a blanket saved rule.
  await api(`/api/session/${task.id}/mode`, { mode: 'auto-all' });
  const snapshot = JSON.parse((await tool('app_snapshot', { app_id: record.id })).result.content);
  assert.ok(!JSON.stringify(snapshot).includes('DO_NOT_RETURN'));
  assert.ok(!snapshot.elements.some(el => el.type === 'password'));
  const input = snapshot.elements.find(el => el.label === '任务文字'); assert.ok(input);
  await tool('app_action', { app_id: record.id, action: 'click', ref: input.ref });
  await tool('app_action', { app_id: record.id, action: 'type', ref: input.ref, text: 'Agent 登录后继续完成' });
  const refreshed = JSON.parse((await tool('app_snapshot', { app_id: record.id })).result.content);
  const button = refreshed.elements.find(el => el.label === '提交任务');
  await tool('app_action', { app_id: record.id, action: 'click', ref: button.ref });
  const completed = JSON.parse((await tool('app_snapshot', { app_id: record.id })).result.content);
  assert.match(completed.text, /Agent 登录后继续完成/);
  const controlledInput = completed.elements.find(el => el.label === 'React 受控输入'); assert.ok(controlledInput);
  await tool('app_action', { app_id: record.id, action: 'type', ref: controlledInput.ref, text: '受控输入已更新' });
  assert.equal(await remote().executeJavaScript('window.readControlledValue()'), '受控输入已更新', 'React 受控表单状态必须同步更新');
  const multiline = '# 新标题\n\n中文段落与 emoji 🐎\nconst value = 1;';
  const textarea = completed.elements.find(el => el.label === '多行文字');
  await tool('app_action', { app_id: record.id, action: 'type', ref: textarea.ref, text: multiline });
  assert.equal(await remote().executeJavaScript("document.querySelector('textarea').value"), multiline);
  const editor = completed.elements.find(el => el.label === '代码编辑器'); assert.ok(editor);
  await tool('app_action', { app_id: record.id, action: 'click', ref: editor.ref });
  await tool('app_action', { app_id: record.id, action: 'type', ref: editor.ref, text: multiline });
  assert.equal(await remote().executeJavaScript('window.editor.state.doc.toString()'), multiline, '必须更新真实 CodeMirror 状态，不能仅改 DOM');
  await tool('app_action', { app_id: record.id, action: 'type', ref: editor.ref, text: '替换全文\n第二行' });
  assert.equal(await remote().executeJavaScript('window.editor.state.doc.toString()'), '替换全文\n第二行');
  await tool('app_action', { app_id: record.id, action: 'type', ref: editor.ref, text: '' });
  assert.equal(await remote().executeJavaScript('window.editor.state.doc.toString()'), '');
  assert.equal(await remote().executeJavaScript('window.undoEditor()'), true, '编辑器撤销历史必须保留');
  assert.notEqual(await remote().executeJavaScript('window.editor.state.doc.toString()'), '');
  await tool('app_action', { app_id: record.id, action: 'type', ref: textarea.ref, text: '' });
  assert.equal(await remote().executeJavaScript("document.querySelector('textarea').value"), '');
  await assert.rejects(tool('app_action', { app_id: record.id, action: 'type', ref: completed.elements.find(el => el.label === '只读文字').ref, text: '不得写入' }), /只读/);
  await tool('app_snapshot', { app_id: record.id });
  await assert.rejects(tool('app_action', { app_id: record.id, action: 'type', ref: textarea.ref, text: '过期引用' }), /元素引用已失效/);
  const sensitive = JSON.parse((await tool('app_snapshot', { app_id: record.id })).result.content).elements.find(el => el.label === '任务文字');
  await remote().executeJavaScript("document.querySelector('#note').type='password'");
  await assert.rejects(tool('app_action', { app_id: record.id, action: 'type', ref: sensitive.ref, text: '不能写密码' }), /敏感字段/);
  let denied = false;
  try { await tool('app_action', { app_id: record.id, action: 'navigate', url: 'https://127.0.0.1/work' }); } catch { denied = true; }
  assert.equal(denied, true);
  await appSession.cookies.flushStore(); await appSession.flushStorageData();
  controller.destroy(); controller = createAppBrowser({ electron, getWindow: () => win, serverUrl: url, dataRoot, testAllowLocal: true }); controller.start();
  controller.bounds({ x: 280, y: 160, width: 1000, height: 650 });
  const coldNavigation = JSON.parse((await tool('app_action', { app_id: record.id, action: 'navigate', url: 'https://example.com/repository/settings' })).result.content);
  assert.equal(coldNavigation.url, 'https://example.com/repository/settings', '重建浏览器后应直接导航到目标地址，不能先校验空白页');
  assert.match(await remote().executeJavaScript('document.body.innerText'), /已登录/);
  assert.equal(JSON.parse((await tool('app_open', { app_id: record.id })).result.content).status, 'authorized');
  assert.equal((await api('/api/app-center')).pending.length, 0, '复用已登录应用不应重新等待登录授权');
  await remote().executeJavaScript("window.open('/oauth-popup', '_blank'); true", true);
  await until(() => BrowserWindow.getAllWindows().some(candidate => candidate !== win), '人工 OAuth 弹窗未打开');
  const popup = BrowserWindow.getAllWindows().find(candidate => candidate !== win);
  await until(() => !popup.webContents.isLoading(), 'OAuth 弹窗未加载');
  await popup.webContents.executeJavaScript("window.onbeforeunload = () => false; true", true);
  await api(`/api/app-center/apps/${record.id}/revoke`, {}); await controller.clear(record.id);
  assert.equal(popup.isDestroyed(), true, '清除登录必须关闭 OAuth 弹窗');
  assert.equal((await appSession.cookies.get({ url: 'https://example.com' })).length, 0);
  await assert.rejects(tool('app_action', { app_id: record.id, action: 'scroll', delta_y: 100 }), /尚未确认|撤销/);
  await finish(null, { electron: process.versions.electron, loginWait: true, resumed: true, isolation: true, snapshot: true, action: true, controlledInput: true, multilineEditor: true, actionableErrors: true, persistence: true, revoked: true });
}).catch(error => finish(error));
