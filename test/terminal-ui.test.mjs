import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { applyTerminalEvent, createTerminalSession, terminalPrompt } from '../react/src/terminal-session.mjs';
import { waitFor } from '../scripts/verify-win.mjs';

const { startRuntime } = createRequire(import.meta.url)('../electron/runtime.cjs');
const root = path.resolve(import.meta.dirname, '..');

test('terminal prompts match the actual shell and strip control characters from paths', () => {
  assert.equal(terminalPrompt('C:\\Projects\\workspace'), 'C:\\Projects\\workspace> ');
  assert.equal(terminalPrompt('\\\\server\\workspace'), '\\\\server\\workspace> ');
  assert.equal(terminalPrompt('/tmp/workspace'), '/tmp/workspace $ ');
  assert.equal(terminalPrompt('C:\\workspace\x1b\n'), 'C:\\workspace> ');
});

test('terminal preserves earlier commands and replays events arriving before the run response', () => {
  const previous = { lines: [{ stream: 'stdout', text: 'previous output\n' }] };
  const result = { terminalId: 'new', command: 'echo hello', cwd: 'C:\\workspace' };
  const current = createTerminalSession(previous, result, [
    { type: 'terminal_started', terminalId: 'new' },
    { type: 'terminal_output', terminalId: 'other', text: 'wrong task' },
    { type: 'terminal_output', terminalId: 'new', stream: 'stdout', text: 'hello\n' },
    { type: 'terminal_exit', terminalId: 'new', code: 0 },
  ]);
  assert.equal(current.status, 'exited');
  assert.equal(current.lines[0], previous.lines[0]);
  assert.equal(current.lines[1].text, 'C:\\workspace> echo hello\r\n');
  assert.equal(current.lines[2].text, 'hello\n');
  assert.equal(current.lines.length, 3);
});

test('nonzero exits are failures, interrupts are stopped, and repeated exits do not duplicate output', () => {
  const initial = createTerminalSession(null, { terminalId: 'run', command: 'node missing.js', cwd: '/tmp' });
  const event = { type: 'terminal_exit', terminalId: 'run', code: 1 };
  const failed = applyTerminalEvent(initial, event);
  assert.equal(failed.status, 'exited');
  assert.equal(failed.lines.at(-1).stream, 'stderr');
  assert.match(failed.lines.at(-1).text, /1/);
  assert.equal(applyTerminalEvent(failed, event), failed);
  const stopped = applyTerminalEvent(initial, { ...event, signal: 'SIGINT' });
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.lines.at(-1).stream, 'status');
});

test('file explorer header only applies centered icon-button styling to its tools', () => {
  const css = fs.readFileSync(path.join(root, 'react/src/style.css'), 'utf8');
  assert.match(css, /\.explorer-root\s*\{[^}]*text-align:\s*left/);
  assert.match(css, /\.file-explorer-head > div button\s*\{[^}]*place-items:\s*center/);
  assert.doesNotMatch(css, /\.file-explorer-head button\s*\{/);
});

test('default workspace is created automatically and terminal commands run there with ANSI output intact', async context => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-terminal-'));
  const runtime = startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: directory });
  context.after(async () => {
    if (runtime.child.exitCode === null) { const exited = once(runtime.child, 'exit'); runtime.child.kill(); await exited; }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const { url } = await runtime.ready;
  const info = await (await fetch(`${url}/api/info`)).json();
  assert.equal(info.workspace, path.join(directory, 'workspace'));
  assert.ok(fs.statSync(info.workspace).isDirectory());
  const command = 'echo terminal-test';
  const response = await fetch(`${url}/api/terminal/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.cwd, info.workspace);
  const finished = await waitFor(async () => {
    const snapshot = await (await fetch(`${url}/api/terminal/${result.terminalId}`)).json();
    return snapshot.status === 'exited' ? snapshot : null;
  });
  assert.match(finished.output.map(line => line.text).join(''), /terminal-test/);
  const ansiCommand = 'node -e "process.stdout.write(String.fromCharCode(27)+\'[32mANSI_OK\'+String.fromCharCode(27)+\'[0m\')"';
  const ansi = await (await fetch(`${url}/api/terminal/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: ansiCommand }) })).json();
  const colored = await waitFor(async () => {
    const snapshot = await (await fetch(`${url}/api/terminal/${ansi.terminalId}`)).json();
    return snapshot.status === 'exited' ? snapshot : null;
  });
  assert.match(colored.output.map(line => line.text).join(''), /\x1b\[32mANSI_OK\x1b\[0m/);
  const waiting = await (await fetch(`${url}/api/terminal/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'node -e "console.log(\'TERMINAL_CHILD_PID=\'+process.pid);setInterval(()=>{},1000)"' }) })).json();
  let processId;
  try {
    processId = await waitFor(async () => {
      const snapshot = await (await fetch(`${url}/api/terminal/${waiting.terminalId}`)).json();
      const match = snapshot.output?.map(line => line.text).join('').match(/TERMINAL_CHILD_PID=(\d+)/);
      return match ? Number(match[1]) : null;
    });
    assert.doesNotThrow(() => process.kill(processId, 0));
    await fetch(`${url}/api/terminal/${waiting.terminalId}/stop`, { method: 'POST' });
    await waitFor(() => { try { process.kill(processId, 0); return false; } catch { return true; } });
  } finally {
    await fetch(`${url}/api/terminal/${waiting.terminalId}/stop`, { method: 'POST' });
    if (processId) { try { process.kill(processId); } catch {} }
  }
});
