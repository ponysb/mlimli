import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import setup from '../plugins/computer-use/plugin.mjs';
import { setWorkspaceRoot } from '../core/paths.mjs';
import { expandComposerReferences } from '../core/composer-references.mjs';
import { authorize } from '../core/permissions.mjs';

test('computer use keeps old references compatible and requires desktop permission', async () => {
  const prompt = expandComposerReferences('@plugin("desktop")', { plugins: [{ name: 'computer-use', tools: ['screenshot'] }] });
  assert.match(prompt, /computer-use/); assert.doesNotMatch(prompt, /未加载/);
  const result = await authorize({ session: { id: 'test', desktopEnabled: false, mode: 'auto-all' }, tool: { name: 'screenshot', permission: 'L3', capability: 'desktop' }, args: {} });
  assert.equal(result.ok, false); assert.equal(result.decision, 'blocked');
});

// Set MLI_TEST_COMPUTER_USE=1 to run against an interactive Windows desktop.
test('Windows computer use captures, finds and reads a window, types Chinese, sends keys and clicks', { skip: process.platform !== 'win32' || process.env.MLI_TEST_COMPUTER_USE !== '1', timeout: 60000 }, async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-computer-use-'));
  const stateFile = path.join(directory, 'state.json');
  const title = `MLI Computer Use Test ${crypto.randomUUID()}`;
  const tools = new Map(), commands = new Map();
  setWorkspaceRoot(directory);
  await setup({ registerTool: tool => tools.set(tool.name, tool), registerCommand: (name, command) => commands.set(name, command), log() {} });
  assert.ok(commands.has('/computer-use')); assert.ok(commands.has('/desktop'));
  const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(import.meta.dirname, 'fixtures', 'computer-use-window.ps1'), '-Title', title, '-StateFile', stateFile], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
  context.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const state = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8').replace(/^\uFEFF/, '')); } catch { return {}; } };
  const waitFor = async condition => {
    const until = Date.now() + 10000;
    while (Date.now() < until) { if (condition()) return; if (child.exitCode !== null) throw new Error(errors || 'Test window exited'); await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Test window did not reach expected state: ${JSON.stringify(state())}; ${errors}`);
  };
  const run = (name, args = {}) => tools.get(name).run(args, {});
  const screenshot = async () => {
    const result = await run('screenshot');
    const bytes = Buffer.from(result.image.split(',')[1], 'base64');
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 && bytes.length > 10000);
  };
  await waitFor(() => fs.existsSync(stateFile));
  await new Promise(resolve => setTimeout(resolve, 750));
  const windows = (await run('list_windows')).content;
  assert.ok(windows.includes(title), windows);
  assert.match((await run('focus_window', { pid: child.pid })).content, /OK/);
  const initial = (await run('read_screen')).content;
  assert.match(initial, /Computer Use Text/); assert.match(initial, /Computer Use Verify/);
  await screenshot();
  const expected = '中文输入 +^%~(){}[]';
  await run('key_tap', { key: '^a' });
  await run('type_text', { text: expected });
  await waitFor(() => state().text === expected);
  await screenshot();
  await run('key_tap', { key: '{END}!' });
  await waitFor(() => state().text === expected + '!');
  const controls = (await run('read_screen')).content;
  const button = /\[\w+\] Computer Use Verify @(-?\d+),(-?\d+)/.exec(controls);
  assert.ok(button, controls);
  await screenshot();
  await run('mouse_click', { x: Number(button[1]) + 10, y: Number(button[2]) + 10 });
  await waitFor(() => state().clicked === true);
  await screenshot();
  assert.match((await run('read_screen')).content, /Clicked/);
});
