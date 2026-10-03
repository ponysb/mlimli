import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LspManager, formatDiagnostics, nodePackageCommand } from '../core/lsp.mjs';

const fakeServer = String.raw`
let buffer = Buffer.alloc(0);
function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }), 'utf8');
  process.stdout.write(Buffer.concat([Buffer.from('Content-Length: ' + body.length + '\r\n\r\n'), body]));
}
function handle(message) {
  if (message.method === 'initialize') {
    send({ id: message.id, result: { capabilities: { textDocumentSync: 1 } } });
    return;
  }
  if (message.method === 'textDocument/didOpen' || message.method === 'textDocument/didChange') {
    send({ method: 'textDocument/publishDiagnostics', params: { uri: message.params.textDocument.uri, diagnostics: [{ severity: 1, message: 'fake error', range: { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } } }] } });
    return;
  }
  if (message.method === 'textDocument/hover') {
    send({ id: message.id, result: { contents: 'fake hover' } });
    return;
  }
  if (message.id !== undefined) send({ id: message.id, result: [] });
}
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const split = buffer.indexOf(Buffer.from('\r\n\r\n'));
    if (split < 0) break;
    const headers = buffer.subarray(0, split).toString('ascii');
    const match = headers.match(/content-length:\s*(\d+)/i);
    if (!match) { buffer = buffer.subarray(split + 4); continue; }
    const length = Number(match[1]);
    if (buffer.length < split + 4 + length) break;
    const body = buffer.subarray(split + 4, split + 4 + length).toString('utf8');
    buffer = buffer.subarray(split + 4 + length);
    handle(JSON.parse(body));
  }
});
`;

test('LSP manager starts a server, synchronizes a document, and returns diagnostics', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-'));
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-data-'));
  const file = path.join(root, 'sample.fake');
  fs.writeFileSync(file, 'hello\n', 'utf8');
  const manager = new LspManager({ workspaceRoot: () => root, dataRoot });
  manager.register({
    id: 'fake',
    name: 'Fake',
    extensions: ['.fake'],
    root: () => root,
    resolve: () => ({ command: process.execPath, args: ['-e', fakeServer], cwd: root }),
  });
  try {
    const touched = await manager.touch(file);
    assert.equal(touched.available, true);
    assert.equal(touched.server, 'fake');
    assert.equal(touched.diagnostics[0].message, 'fake error');
    const hover = await manager.query({ operation: 'hover', filePath: file, line: 1, character: 1 });
    assert.equal(hover.contents, 'fake hover');
    const relative = await manager.query({ operation: 'hover', filePath: 'sample.fake', line: 1, character: 1 });
    assert.equal(relative.contents, 'fake hover');
    assert.equal(manager.status()[0].status, 'connected');
  } finally {
    manager.dispose();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    fs.rmSync(dataRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('LSP manager keeps queries inside the workspace and formats diagnostics', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-boundary-'));
  const manager = new LspManager({ workspaceRoot: () => root, dataRoot: root });
  try {
    await assert.rejects(manager.query({ operation: 'hover', filePath: path.join(root, '..', 'outside.fake'), line: 1, character: 1 }), /工作区/);
    const output = formatDiagnostics('sample.ts', [{ severity: 1, message: 'Type mismatch', range: { start: { line: 2, character: 4 } } }]);
    assert.match(output, /ERROR \[3:5\] Type mismatch/);
    assert.match(output, /<diagnostics file="sample.ts">/);
  } finally {
    manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('LSP manager replaces a server connection after its process exits', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-restart-'));
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-restart-data-'));
  const file = path.join(root, 'sample.fake');
  fs.writeFileSync(file, 'hello\n', 'utf8');
  const manager = new LspManager({ workspaceRoot: () => root, dataRoot });
  manager.register({
    id: 'fake-restart',
    name: 'Fake Restart',
    extensions: ['.fake'],
    root: () => root,
    resolve: () => ({ command: process.execPath, args: ['-e', fakeServer], cwd: root }),
  });
  try {
    const first = await manager.touch(file);
    const firstClient = manager.clients.get(`${root.toLowerCase()}::fake-restart`) || [...manager.clients.values()][0];
    assert.equal(first.available, true);
    firstClient.child.kill();
    for (let index = 0; index < 20 && !firstClient.closed; index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(firstClient.closed, true);
    const second = await manager.touch(file);
    const secondClient = [...manager.clients.values()][0];
    assert.equal(second.available, true);
    assert.notEqual(secondClient, firstClient);
  } finally {
    manager.dispose();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    fs.rmSync(dataRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});

test('LSP manager cancels an in-progress language server installation on dispose', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-install-'));
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-install-data-'));
  const file = path.join(root, 'sample.fake');
  fs.writeFileSync(file, 'hello\n', 'utf8');
  const manager = new LspManager({ workspaceRoot: () => root, dataRoot });
  let started;
  const installationStarted = new Promise((resolve) => { started = resolve; });
  let aborted = false;
  manager.register({
    id: 'fake-install',
    name: 'Fake Install',
    extensions: ['.fake'],
    root: () => root,
    resolve: () => undefined,
    install: ({ signal }) => new Promise((resolve, reject) => {
      started();
      signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      }, { once: true });
    }),
  });
  try {
    const resultPromise = manager.touch(file, { askInstall: async () => true });
    await installationStarted;
    manager.dispose();
    const result = await resultPromise;
    assert.equal(result.available, false);
    assert.equal(aborted, true);
  } finally {
    manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test('automatic installation prompts are shared across roots and a refusal survives restart', async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-consent-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = path.join(root, 'a.fake'), second = path.join(root, 'nested', 'b.fake');
  fs.mkdirSync(path.dirname(second)); fs.writeFileSync(first, 'a'); fs.writeFileSync(second, 'b');
  const definition = { id: 'consent', extensions: ['.fake'], root: ({ file }) => path.dirname(file), resolve: () => undefined, install: () => { throw new Error('must not install'); } };
  let prompts = 0, resolves = 0, release;
  const manager = new LspManager({ workspaceRoot: () => root, dataRoot: root });
  manager.register({ ...definition, resolve: () => { resolves++; return undefined; } });
  const askInstall = () => { prompts++; return new Promise(resolve => { release = resolve; }); };
  const touches = [manager.touch(first, { askInstall }), manager.touch(first, { askInstall }), manager.touch(second, { askInstall })];
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  release(false);
  await Promise.all(touches);
  assert.equal(prompts, 1);
  const resolvedBefore = resolves;
  await manager.touch(second, { askInstall });
  assert.equal(resolves, resolvedBefore);
  assert.equal(manager.status()[0].status, 'disabled');
  manager.dispose();
  const restored = new LspManager({ workspaceRoot: () => root, dataRoot: root });
  restored.register(definition);
  await restored.touch(first, { askInstall: () => { prompts++; return false; } });
  assert.equal(prompts, 1);
  await assert.rejects(restored.query({ filePath: first, operation: 'hover', askInstall: () => { prompts++; return false; } }), /没有可用/);
  assert.equal(prompts, 2);
  restored.dispose();
});

test('failed installation does not repeat on writes and an explicit query can retry', async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-lsp-retry-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  const file = path.join(root, 'sample.fake'); fs.writeFileSync(file, 'a');
  let attempts = 0, prompts = 0, installed = false;
  const manager = new LspManager({ workspaceRoot: () => root, dataRoot: root });
  context.after(() => manager.dispose());
  manager.register({ id: 'retry', extensions: ['.fake'], resolve: () => installed ? { command: process.execPath, args: ['-e', fakeServer] } : undefined, install: () => { attempts++; if (attempts === 1) throw new Error('install failed'); installed = true; } });
  const askInstall = async () => { prompts++; return true; };
  assert.equal((await manager.touch(file, { askInstall })).available, false);
  assert.equal((await manager.touch(file, { askInstall })).available, false);
  assert.equal(prompts, 1); assert.equal(attempts, 1);
  const result = await manager.query({ filePath: file, operation: 'hover', askInstall });
  assert.equal(result.contents, 'fake hover'); assert.equal(attempts, 2);
  manager.dispose(); await new Promise(resolve => setTimeout(resolve, 100));
});

test('package launchers execute their JavaScript entry directly including paths with spaces', async context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli lsp command '));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'node_modules', 'fixture-lsp'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ bin: { 'fixture-langserver': 'server.js' } }));
  fs.writeFileSync(path.join(directory, 'server.js'), 'console.log("ready")');
  const command = nodePackageCommand('fixture-lsp', 'fixture-langserver', { cacheDir: root });
  assert.equal(command.command, process.execPath);
  assert.deepEqual(command.args, [path.join(directory, 'server.js')]);
  const output = await promisify(execFile)(command.command, command.args, { env: { ...process.env, ...command.env }, windowsHide: true });
  assert.equal(output.stdout.trim(), 'ready');
});
