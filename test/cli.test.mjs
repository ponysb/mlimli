import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import launcher from '../electron/runtime.cjs';
import userData from '../core/user-data.cjs';
import { parseOptions, loopbackUrl } from '../cli/options.mjs';
import { safeText, snapshotText, modelLabel, sessionOverview } from '../cli/tui.mjs';
import { RuntimeClient } from '../cli/client.mjs';
import { ROOT, stageTerminalClient } from '../scripts/terminal-package.mjs';
import { macBuildConfig } from '../scripts/package-mac.mjs';
import kit from 'terminal-kit';
import { PassThrough, Writable } from 'node:stream';
import { TuiView, runTui } from '../cli/tui.mjs';
import { installPasteHandler } from '../cli/paste.mjs';
import { uiRequest, resolveUiRequest, cancelUiRequests, executeTool } from '../core/plugins.mjs';
import { onEvent } from '../core/events.mjs';

const run = promisify(execFile);
function temporary(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-cli-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  return directory;
}

test('desktop and terminal CommonJS entry points pass syntax checks', async () => {
  for (const file of ['electron/main.cjs', 'electron/runtime.cjs', 'cli/main.cjs', 'core/bootstrap.cjs', 'core/runtime-host.cjs', 'core/user-data.cjs']) await run(process.execPath, ['--check', path.join(ROOT, file)]);
});

test('terminal defaults match desktop directories and CLI validates arguments', () => {
  assert.equal(userData.userDataRoot({ platform: 'win32', env: { APPDATA: 'C:/Data' }, home: '/home/test' }), path.join('C:/Data', 'MoliCreation'));
  assert.equal(userData.userDataRoot({ platform: 'darwin', env: {}, home: '/home/test' }), path.join('/home/test', 'Library', 'Application Support', 'MoliCreation'));
  assert.equal(userData.userDataRoot({ platform: 'linux', env: { XDG_CONFIG_HOME: '/xdg' }, home: '/home/test' }), path.join('/xdg', 'MoliCreation'));
  assert.equal(parseOptions(['exec', '--auto', '--json', '--cwd', 'project', 'hello'], ROOT).cwd, path.join(ROOT, 'project'));
  assert.equal(parseOptions(['--resume']).resume, true);
  assert.throws(() => parseOptions(['--cwd']), /requires a value/);
  assert.throws(() => parseOptions(['--unknown']), /Unknown option/);
  assert.throws(() => loopbackUrl('http://example.com'), /loopback/);
  assert.throws(() => loopbackUrl('http://127.0.0.1:3000/path'), /loopback/);
});

test('terminal strips escape injection and preserves Chinese and code blocks', () => {
  assert.equal(safeText('\x1b[2J中文\n```js\nconst a = 1\n```\x1b]52;c;secret\x07'), '中文\n```js\nconst a = 1\n```');
  assert.match(snapshotText({ entries: [{ type: 'message', role: 'user', content: 'hello' }, { type: 'message', role: 'assistant', text: 'world' }] }), /You\nhello\n\nMLI\nworld/);
});

test('new session overview shows the named model and public state without credentials', () => {
  const info = {
    activeModelId: 'model-id', models: [{ id: 'model-id', name: '测试模型', model: 'api-model-id' }],
    provider: { model: 'api-model-id', providerName: '测试服务商', apiKey: 'secret-key' },
    account: { authenticated: true, user: { email: 'test@example.com' }, token: 'secret-token' },
  };
  assert.equal(modelLabel(info), '测试模型');
  const overview = sessionOverview(info, { title: '新会话', mode: 'default' }, 'C:\\Projects');
  assert.match(overview, /魔力工作台/);
  assert.match(overview, /测试模型/);
  assert.match(overview, /test@example.com/);
  assert.match(overview, /人工审批/);
  assert.doesNotMatch(overview, /secret-key|secret-token/);
  assert.equal(modelLabel({}), '未配置模型');
});

test('bracketed paste preserves fragmented UTF-8 and never forwards pasted commands as keys', () => {
  const keys = [], pastes = [];
  const term = { onStdin: value => keys.push(value.toString()), raw() {}, stdin: { removeListener() {} } };
  const remove = installPasteHandler(term, text => pastes.push(text));
  const payload = Buffer.from('\x1b[200~中文\n/exit\x1b[201~');
  for (const byte of payload) term.onStdin(Buffer.from([byte]));
  assert.deepEqual(pastes, ['中文\n/exit']);
  assert.deepEqual(keys, []);
  term.onStdin(Buffer.from('x'));
  term.onStdin(Buffer.from('\r'));
  assert.deepEqual(keys, ['x', '\r']);
  term.onStdin(Buffer.from('first\nsecond'));
  assert.deepEqual(pastes, ['中文\n/exit', 'first\nsecond']);
  remove();
});

test('plugin questions resolve synchronously, enforce session ownership and cancel', async () => {
  const session = { id: 'terminal-ui-request' };
  const unsubscribe = onEvent(event => {
    if (event.type !== 'ui_request' || event.sessionId !== session.id) return;
    assert.equal(resolveUiRequest(event.request.reqId, 'wrong', 'other-session'), false);
    resolveUiRequest(event.request.reqId, 'accepted', session.id);
  });
  try { assert.equal(await uiRequest(session, 'input', { text: 'value' }), 'accepted'); }
  finally { unsubscribe(); }
  const pending = uiRequest(session, 'confirm', { text: 'confirm' });
  cancelUiRequests(session.id);
  assert.equal(await pending, false);
  const abort = new AbortController();
  const tool = executeTool({ name: 'never-finishes', run: () => new Promise(() => {}) }, {}, { session, signal: abort.signal });
  abort.abort();
  await assert.rejects(tool, /任务已停止/);
});

test('TUI renders Chinese, multiline input and approval menus across terminal sizes', async context => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  output.isTTY = true;
  output.columns = 80;
  output.rows = 24;
  const term = kit.createTerminal({ stdin: input, stdout: output, stderr: output, generic: 'xterm-256color', isTTY: true, processSigwinch: false });
  const sent = [];
  const view = new TuiView({ term, onSend: text => sent.push(text), onStop() {}, onExit() {} });
  context.after(() => { view.close(); input.destroy(); output.destroy(); });
  view.setOverview('魔力工作台\n\n新会话\n模型    测试模型');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.match(view.document.inputDst.dumpChars(), /魔\s*力\s*工\s*作\s*台/);
  assert.equal(view.content, '');
  input.write(Buffer.from('\x1b[<0;10;10M'));
  assert.equal(view.document.focusElement, view.transcript);
  input.write(Buffer.from('你好'));
  assert.equal(view.document.focusElement, view.editor);
  input.write(Buffer.from('\r'));
  assert.deepEqual(sent, ['你好']);
  input.write(Buffer.from(`\x1b[<0;1;${view.label.outputY + 1}M`));
  assert.equal(view.document.focusElement, view.editor);
  input.write(Buffer.from('\t'));
  input.write(Buffer.from('\r'));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(sent, ['你好', '/new']);
  assert.equal(view.document.focusElement, view.editor);
  sent.length = 0;
  view.setContent('MLI\n中文任务\n```js\nconst a = 1\n```');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.match(view.document.inputDst.dumpChars(), /中\s*文\s*任\s*务/);
  view.editor.setContent('first\nsecond');
  view.editor.userActions.send();
  assert.deepEqual(sent, ['first\nsecond']);
  view.editor.setContent('保留草稿');
  const approval = view.choose('执行审批', [{ label: '拒绝', value: 'deny' }, { label: '允许一次', value: 'allow' }]);
  assert.match(view.document.inputDst.dumpChars(), /执\s*行\s*审\s*批/);
  view.menuWidget.emit('submit', 1);
  assert.equal(await approval, 'allow');
  assert.equal(view.editor.getValue(), '保留草稿');
  view.setStatus('运行中', true);
  assert.match(view.label.content, /排队/);
  term.width = 35;
  term.height = 12;
  view.layout();
  assert.equal(view.document.inputDst.width, 35);
  assert.equal(view.document.inputDst.height, 12);
  assert.equal(view.editor.getValue(), '保留草稿');
  const password = view.ask('密码', { secret: true });
  view.editor.setContent('secret-key');
  view.document.draw();
  assert.ok(!view.document.inputDst.dumpChars().includes('secret-key'));
  view.editor.userActions.send();
  assert.equal(await password, 'secret-key');
  term.width = 12;
  term.height = 8;
  view.layout();
  assert.ok(view.transcript.outputY + view.transcript.outputHeight <= view.label.outputY);
  assert.ok(view.label.outputY < view.editor.outputY);
});

test('managed clients reuse one runtime and one released lease preserves other clients', async context => {
  const directory = temporary(context), dataRoot = path.join(directory, 'data'), cwd = path.join(directory, 'project');
  fs.mkdirSync(cwd);
  const options = { executable: process.execPath, runtimeRoot: ROOT, dataRoot, environment: { MLI_ACCOUNT_ENABLED: 'false', MLI_AGENT_WORKSPACE: cwd } };
  const first = await launcher.acquireRuntime(options);
  const second = await launcher.acquireRuntime(options);
  context.after(async () => { await first.release(); await second.release(); });
  assert.equal(first.pid, second.pid);
  assert.equal(first.url, second.url);
  await first.release();
  assert.equal((await fetch(`${second.url}/api/runtime`)).status, 200);
  const client = new RuntimeClient(second.url);
  await client.useWorkspace(cwd);
  const session = await client.request('/api/session', { title: 'shared' });
  assert.equal((await client.request(`/api/session/${session.id}`)).id, session.id);
  await second.release();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && fs.existsSync(path.join(dataRoot, 'runtime.json'))) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(!fs.existsSync(path.join(dataRoot, 'runtime.json')));
  assert.ok(!fs.existsSync(path.join(cwd, '.agent', 'runtime-lock.json')));
});

test('TUI runs a real mock file task through its approval menu', async context => {
  const directory = temporary(context), cwd = path.join(directory, 'project'), dataRoot = path.join(directory, 'data');
  fs.mkdirSync(cwd);
  const runtime = await launcher.acquireRuntime({ executable: process.execPath, runtimeRoot: ROOT, dataRoot, environment: { MLI_ACCOUNT_ENABLED: 'false', MLI_AGENT_WORKSPACE: cwd } });
  const client = new RuntimeClient(runtime.url);
  await client.useWorkspace(cwd);
  const input = new PassThrough();
  input.setRawMode = () => {};
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  output.isTTY = true;
  output.columns = 80;
  output.rows = 24;
  const term = kit.createTerminal({ stdin: input, stdout: output, stderr: output, generic: 'xterm-256color', isTTY: true, processSigwinch: false });
  const abort = new AbortController();
  let view;
  const tui = runTui(client, { cwd }, { term, signal: abort.signal, onReady: result => { view = result; } });
  async function waitFor(check) {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) { const result = check(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 25)); }
    throw new Error(`TUI task timed out: ${view?.status}\n${view?.content}`);
  }
  try {
    await waitFor(() => view && view.status.includes('就绪'));
    await waitFor(() => view.document.inputDst.dumpChars().includes('魔'));
    assert.match(view.emptyContent, /魔力工作台/);
    input.write(Buffer.from('写一个 hello.txt'));
    input.write(Buffer.from('\r'));
    await waitFor(() => view.form?.label === '执行审批');
    assert.ok(!fs.existsSync(path.join(cwd, 'hello.txt')));
    view.menuWidget.emit('submit', 1);
    await waitFor(() => fs.existsSync(path.join(cwd, 'hello.txt')) && view.status.includes('就绪'));
    assert.match(fs.readFileSync(path.join(cwd, 'hello.txt'), 'utf8'), /hello/);
    view.onExit();
    assert.equal(await tui, 0);
  } finally { abort.abort(); await tui; await runtime.release(); input.destroy(); output.destroy(); }
});

test('exec requires explicit write authorization and emits JSON events', async context => {
  const directory = temporary(context), dataRoot = path.join(directory, 'data'), cwd = path.join(directory, 'project');
  fs.mkdirSync(cwd);
  const env = { ...process.env, MLI_ACCOUNT_ENABLED: 'false', MLI_ACCOUNT_APP_SECRET: '' };
  const args = [path.join(ROOT, 'cli', 'main.cjs'), '--data-dir', dataRoot, '--cwd', cwd, 'exec'];
  await assert.rejects(run(process.execPath, [...args, '写一个 hello.txt'], { env, timeout: 15000 }), error => error.code === 2 && /requires user input/.test(error.stderr));
  assert.ok(!fs.existsSync(path.join(cwd, 'hello.txt')));
  const { stdout } = await run(process.execPath, [...args, '--auto', '--json', '写一个 hello.txt'], { env, timeout: 15000 });
  const events = stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.ok(events.some(event => event.type === 'tool_call'));
  assert.equal(events.findLast(event => event.type === 'turn_end').reason, 'done');
  assert.ok(fs.existsSync(path.join(cwd, 'hello.txt')));
});

test('Linux staging excludes desktop resources and includes terminal dependencies', context => {
  const directory = temporary(context);
  const stage = stageTerminalClient({ output: path.join(directory, 'linux'), platform: 'linux', arch: 'arm64' });
  assert.ok(fs.existsSync(path.join(stage.client, 'cli', 'main.cjs')));
  assert.ok(fs.existsSync(path.join(stage.client, 'node_modules', 'terminal-kit', 'lib', 'termconfig', 'linux.js')));
  assert.ok(!fs.existsSync(path.join(stage.client, 'plugins', 'desktop')));
  for (const name of ['main.cjs', 'preload.cjs']) assert.ok(!fs.existsSync(path.join(stage.client, 'electron', name)));
  for (const name of ['dist', 'server', 'config.json', '.agent']) assert.ok(!fs.existsSync(path.join(stage.client, name)));
  const config = macBuildConfig({ appDirectory: '/app', runtimeDirectory: '/client', destination: '/stage', manifest: { devDependencies: { electron: '44.4.5' } } }, 'arm64');
  assert.deepEqual(config.mac.target, ['pkg']);
  assert.equal(config.pkg.installLocation, '/Applications');
});
