import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { exportClient } from '../scripts/export-client.mjs';
import { ROOT, stageWindowsClient, windowsBuildConfig, bundleCompatibility, executableArchitecture, publishWindowsArtifacts, windowsArtifactVariant } from '../scripts/package-win.mjs';
import { waitFor } from '../scripts/verify-win.mjs';
import { cleanOldRelease } from '../scripts/clean-release.mjs';

const { prepareData, startRuntime: spawnRuntime } = createRequire(import.meta.url)('../electron/runtime.cjs');
const startRuntime = options => spawnRuntime({ ...options, environment: { MLI_ACCOUNT_ENABLED: 'false', MLI_ACCOUNT_APP_SECRET: '', ...options.environment } });

function temporary(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-electron-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('Windows publishing keeps only selected latest installers and preserves unrelated releases', context => {
  const root = temporary(context), release = path.join(root, 'release'), cache = path.join(root, 'cache');
  fs.mkdirSync(release);
  fs.mkdirSync(cache);
  const modern = 'MoliCreation-Modern-Setup-1.0.0-x64.exe';
  const legacy = 'MoliCreation-Legacy-Win7-Setup-1.0.0-ia32.exe';
  const previous = 'MoliCreation-Modern-Setup-0.9.0-x64.exe';
  for (const name of [legacy, previous, 'mli-client-source.zip', 'other.exe']) fs.writeFileSync(path.join(release, name), name);
  fs.writeFileSync(path.join(cache, modern), 'new modern');
  fs.writeFileSync(path.join(cache, `${modern}.blockmap`), 'blockmap');
  assert.equal(windowsArtifactVariant('MoliCreation-Modern-Setup-1.0.0-ia32.exe'), null);
  assert.deepEqual(publishWindowsArtifacts({ root, variants: ['modern'], files: [path.join(cache, modern), path.join(cache, `${modern}.blockmap`)] }), [path.join(release, modern)]);
  assert.equal(fs.readFileSync(path.join(release, modern), 'utf8'), 'new modern');
  assert.ok(!fs.existsSync(path.join(release, previous)));
  for (const name of [legacy, 'mli-client-source.zip', 'other.exe']) assert.equal(fs.readFileSync(path.join(release, name), 'utf8'), name);
  assert.ok(!fs.existsSync(path.join(release, `${modern}.blockmap`)));
  assert.match(fs.readFileSync(path.join(release, 'SHA256SUMS.txt'), 'utf8'), new RegExp(legacy.replaceAll('.', '\\.')));
  assert.throws(() => publishWindowsArtifacts({ root, variants: ['modern', 'legacy'], files: [path.join(cache, modern)] }), /缺少 legacy/);
  assert.equal(fs.readFileSync(path.join(release, modern), 'utf8'), 'new modern');
  fs.writeFileSync(path.join(cache, modern), 'rebuilt');
  publishWindowsArtifacts({ root, variants: ['modern'], files: [path.join(cache, modern)] });
  assert.equal(fs.readFileSync(path.join(release, modern), 'utf8'), 'rebuilt');
});

test('old release cleanup requires both current installers and deletes only marked generated directories', context => {
  const root = temporary(context), release = path.join(root, 'release');
  fs.mkdirSync(release);
  assert.throws(() => cleanOldRelease({ root }), /先生成两套/);
  for (const variant of ['Modern', 'Legacy-Win7']) fs.writeFileSync(path.join(release, `MoliCreation-${variant}-Setup-1.0.0-x64.exe`), 'installer');
  const old = path.join(release, 'windows-modern-x64-1234567890');
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, 'PACKAGE-MANIFEST.json'), JSON.stringify({ scope: 'client-only' }));
  fs.writeFileSync(path.join(release, 'mli-client-source.zip'), 'keep source');
  fs.mkdirSync(path.join(release, 'my-files'));
  assert.deepEqual(cleanOldRelease({ root, dryRun: true }), [old]);
  assert.ok(fs.existsSync(old));
  assert.deepEqual(cleanOldRelease({ root }), [old]);
  assert.ok(!fs.existsSync(old));
  assert.ok(fs.existsSync(path.join(release, 'my-files')));
  assert.equal(fs.readFileSync(path.join(release, 'mli-client-source.zip'), 'utf8'), 'keep source');
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, 'PACKAGE-MANIFEST.json'), JSON.stringify({ scope: 'private' }));
  assert.throws(() => cleanOldRelease({ root }), /不是已确认/);
  assert.ok(fs.existsSync(old));
});

test('desktop initialization uses a writable data directory and never overwrites existing configuration', context => {
  const directory = temporary(context);
  const runtime = path.join(directory, 'runtime');
  fs.mkdirSync(runtime);
  fs.copyFileSync(path.join(ROOT, 'config.example.json'), path.join(runtime, 'config.example.json'));
  const data = path.join(directory, 'data');
  const file = prepareData(runtime, data);
  const initial = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(initial.security.workspaceRoot, path.join(data, 'workspace'));
  assert.equal(initial.account.enabled, false);
  assert.ok(!fs.existsSync(path.join(runtime, 'config.json')));
  initial.activeModelId = 'saved-model';
  fs.writeFileSync(file, JSON.stringify(initial));
  prepareData(runtime, data);
  assert.equal(JSON.parse(fs.readFileSync(file)).activeModelId, 'saved-model');
});

test('Windows staging only contains public runtime files and no private services or development dependencies', context => {
  const directory = temporary(context);
  const source = path.join(directory, 'source');
  exportClient({ output: source });
  fs.writeFileSync(path.join(source, '.env'), 'MLI_ACCOUNT_SERVER_URL=https://public.example.com\nMLI_ACCOUNT_ENABLED=true\nMLI_AGENT_PORT=3000\nMLI_ACCOUNT_APP_SECRET=private-secret\nJWT_SECRET=jwt-secret\nDB_PASSWORD=db-secret\n');
  fs.mkdirSync(path.join(source, 'dist', 'branding'), { recursive: true });
  fs.writeFileSync(path.join(source, 'dist', 'index.html'), '<!doctype html><title>魔力工作台</title>');
  fs.copyFileSync(path.join(ROOT, 'react', 'public', 'branding', 'logo.png'), path.join(source, 'dist', 'branding', 'logo.png'));
  const stage = stageWindowsClient({ root: source, output: path.join(directory, 'package') });
  const record = JSON.parse(fs.readFileSync(path.join(stage.destination, 'PACKAGE-MANIFEST.json')));
  for (const file of record.files) {
    assert.doesNotMatch(file, /(?:^|\/)(?:server|website|node_modules|\.agent|\.agents|workspace|logs)\//);
    assert.doesNotMatch(file, /(?:^|\/)(?:config\.json|account-session\.json|\.env)(?:$|\.)/);
  }
  assert.ok(record.files.includes('client/server.mjs'));
  assert.ok(record.files.includes('client/core/loop.mjs'));
  assert.ok(record.files.includes('client/electron/runtime.cjs'));
  assert.ok(record.files.includes('client/cli/main.cjs'));
  assert.ok(record.files.includes('client/dist/branding/logo.png'));
  assert.ok(record.files.includes('client/licenses/dotenv.txt'));
  assert.ok(record.files.includes('client/LICENSE'));
  assert.equal(fs.readFileSync(path.join(stage.runtimeDirectory, 'LICENSE'), 'utf8'), fs.readFileSync(path.join(source, 'LICENSE'), 'utf8'));
  assert.ok(record.files.includes('app/electron/preload.cjs'));
  const manifest = JSON.parse(fs.readFileSync(path.join(stage.appDirectory, 'package.json')));
  assert.equal(manifest.main, 'electron/main.cjs');
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
  const config = windowsBuildConfig(stage);
  assert.equal(fs.readFileSync(path.join(stage.runtimeDirectory, 'client-defaults.env'), 'utf8'), 'MLI_ACCOUNT_SERVER_URL=https://public.example.com\nMLI_ACCOUNT_ENABLED=true\nMLI_AGENT_PORT=3000\n');
  assert.ok(!fs.existsSync(path.join(stage.runtimeDirectory, '.env')));
  assert.equal(config.productName, '魔力工作台');
  assert.equal(config.nsis.shortcutName, '魔力工作台');
  assert.equal(config.appId, 'com.molichuangzuo.app');
  assert.equal(config.executableName, 'MoliCreation');
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.deepEqual(config.win.target, ['nsis', 'portable']);
  assert.throws(() => stageWindowsClient({ root: source, output: stage.destination }), /必须为空/);
  fs.cpSync(path.join(source, 'dist'), path.join(source, 'dist-legacy'), { recursive: true });
  const legacyStage = stageWindowsClient({ root: source, output: path.join(directory, 'legacy-package'), legacy: true });
  const legacyConfig = windowsBuildConfig(legacyStage);
  assert.equal(fs.readFileSync(path.join(legacyStage.runtimeDirectory, 'client-defaults.env'), 'utf8'), fs.readFileSync(path.join(stage.runtimeDirectory, 'client-defaults.env'), 'utf8'));
  assert.equal(legacyConfig.productName, '魔力工作台（兼容版）');
  assert.equal(legacyConfig.nsis.shortcutName, '魔力工作台（兼容版）');
  assert.equal(legacyConfig.executableName, 'MoliCreationLegacy');
  assert.equal(legacyConfig.electronVersion, '22.3.27');
  assert.equal(legacyConfig.appId, 'com.molichuangzuo.app.legacy');
  assert.notEqual(legacyConfig.appId, config.appId);
  assert.notEqual(legacyConfig.executableName, config.executableName);
  assert.notEqual(legacyConfig.nsis.shortcutName, config.nsis.shortcutName);
  assert.match(legacyConfig.nsis.artifactName, /Legacy-Win7/);
  assert.ok(fs.existsSync(path.join(legacyStage.runtimeDirectory, 'electron', 'compat.cjs')));
});

test('self-contained compatibility bundle supports missing web APIs and streaming HTTP on Node 16', async context => {
  const directory = temporary(context);
  const stage = { appDirectory: path.join(directory, 'app'), runtimeDirectory: path.join(directory, 'client') };
  for (const root of [stage.appDirectory, stage.runtimeDirectory]) fs.mkdirSync(path.join(root, 'electron'), { recursive: true });
  await bundleCompatibility(stage);
  const compatibility = path.join(stage.appDirectory, 'electron', 'compat.cjs');
  const script = [
    'delete globalThis.fetch; delete globalThis.ReadableStream; delete globalThis.structuredClone; delete Array.prototype.findLast;',
    'require(', JSON.stringify(compatibility), ').installCompatibility();',
    "const assert = require('node:assert/strict'); const http = require('node:http');",
    "assert.equal([1, 2, 3].findLast(value => value < 3), 2); assert.equal(typeof ReadableStream, 'function');",
    "const source = { nested: [1], bytes: new Uint8Array([7, 8]) }; source.self = source; const copy = structuredClone(source, { transfer: [source.bytes.buffer] }); assert.equal(copy.self, copy); assert.notEqual(copy.nested, source.nested); assert.equal(copy.bytes[0], 7); assert.equal(source.bytes.byteLength, 0); assert.throws(() => structuredClone(() => {}), { name: 'DataCloneError' });",
    "const server = http.createServer((request, response) => { response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write('data: first\\n'); setTimeout(() => response.end('data: second\\n'), 10); }); server.keepAliveTimeout = 1;",
    "server.listen(0, '127.0.0.1', async () => { try { const response = await fetch('http://127.0.0.1:' + server.address().port, { signal: AbortSignal.timeout(2000) }); assert.equal(response.headers.get('content-type'), 'text/event-stream'); const reader = response.body.getReader(); const decoder = new TextDecoder(); let text = ''; for (;;) { const chunk = await reader.read(); if (chunk.done) break; text += decoder.decode(chunk.value, { stream: true }); } assert.equal(text, 'data: first\\ndata: second\\n'); console.log(JSON.stringify({ node: process.versions.node, arch: process.arch, streaming: 'passed' })); } catch (error) { console.error(error); process.exitCode = 1; } finally { server.close(); } });",
  ].join('');
  const execute = promisify(execFile);
  const modern = await execute(process.execPath, ['-e', script], { windowsHide: true, timeout: 15000 });
  assert.match(modern.stdout, /"streaming":"passed"/);
  const legacyExecutable = path.join(ROOT, 'node_modules', '.cache', 'electron-22.3.27-win32-ia32', 'electron.exe');
  if (fs.existsSync(legacyExecutable)) {
    assert.equal(executableArchitecture(legacyExecutable), 'ia32');
    const legacy = await execute(legacyExecutable, ['-e', script], { windowsHide: true, timeout: 15000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    const result = JSON.parse(legacy.stdout.trim());
    assert.match(result.node, /^16\./);
    assert.equal(result.arch, 'ia32');
    assert.equal(result.streaming, 'passed');
  } else context.diagnostic('未缓存 Electron 22 ia32，旧引擎流式验证请运行 dist:win:legacy 后重试');
});

test('isolated desktop runtime selects a free port, performs approval and persists history without modifying the installation', async context => {
  const directory = temporary(context);
  const dataRoot = path.join(directory, 'data');
  const downloadedPlugin = path.join(dataRoot, 'plugins', 'user-test', 'skills');
  fs.mkdirSync(downloadedPlugin, { recursive: true });
  fs.writeFileSync(path.join(downloadedPlugin, '..', 'plugin.json'), JSON.stringify({ name: 'user-test', version: '1.0.0' }));
  const pluginSource = ['import { getWorkspaceRoot } from ', JSON.stringify('../../core/paths.mjs'), ";\nexport default function setup(ctx) { if (!getWorkspaceRoot().endsWith('workspace')) throw new Error('Plugin loaded a different runtime'); ctx.registerTool({ name: 'user_path', permission: 'L0', parameters: { type: 'object', properties: {} }, run: () => getWorkspaceRoot() }); }\n"].join('');
  fs.writeFileSync(path.join(downloadedPlugin, '..', 'plugin.mjs'), pluginSource);
  fs.writeFileSync(path.join(downloadedPlugin, 'SKILL.md'), '---\nname: user-test\ndescription: Local packaging fixture\n---\nLocal skill.');
  const configPath = prepareData(ROOT, dataRoot);
  const config = JSON.parse(fs.readFileSync(configPath));
  config.server.port = 1;
  fs.writeFileSync(configPath, JSON.stringify(config));
  const runtime = startRuntime({ executable: process.execPath, runtimeRoot: ROOT, dataRoot });
  context.after(() => { if (runtime.child.exitCode === null) runtime.child.kill(); });
  const first = await runtime.ready;
  assert.notEqual(new URL(first.url).port, '1');
  const info = await (await fetch(`${first.url}/api/info`)).json();
  assert.equal(info.provider.protocol, 'mock');
  assert.equal(info.workspace, path.join(dataRoot, 'workspace'));
  assert.ok(info.plugins.plugins.some(plugin => plugin.name === 'user-test'));
  assert.ok(info.plugins.tools.includes('user_path'));
  assert.ok(info.plugins.skills.some(skill => skill.name === 'user-test' && skill.path.startsWith(dataRoot)));
  assert.ok(!fs.existsSync(path.join(ROOT, 'plugins', 'user-test')));
  const response = await fetch(`${first.url}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: '保留会话' }) });
  const session = await response.json();
  const sessionUrl = `${first.url}/api/session/${session.id}`;
  await fetch(`${sessionUrl}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '写一个 hello.txt，用于 Windows 打包验证' }) });
  const pending = await waitFor(async () => (await (await fetch(sessionUrl)).json()).permission);
  assert.equal(pending.tool, 'write_file');
  assert.ok(!fs.existsSync(path.join(info.workspace, 'hello.txt')));
  await fetch(`${sessionUrl}/permission/${pending.reqId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'allow' }) });
  const finished = await waitFor(async () => {
    const snapshot = await (await fetch(sessionUrl)).json();
    return !snapshot.running && snapshot.entries.findLast(entry => entry.type === 'turn_end');
  });
  assert.equal(finished.reason, 'done');
  assert.match(fs.readFileSync(path.join(info.workspace, 'hello.txt'), 'utf8'), /Windows 打包验证/);
  const exited = once(runtime.child, 'exit');
  runtime.child.kill();
  await exited;
  const restarted = startRuntime({ executable: process.execPath, runtimeRoot: ROOT, dataRoot });
  context.after(() => { if (restarted.child.exitCode === null) restarted.child.kill(); });
  const second = await restarted.ready;
  assert.equal((await fetch(`${second.url}/api/session/${session.id}`)).status, 200);
  assert.equal(JSON.parse(fs.readFileSync(configPath)).server.port, 1);
  assert.ok(fs.existsSync(path.join(dataRoot, '.agent', 'workspaces.json')));
  const stopped = once(restarted.child, 'exit');
  restarted.child.kill();
  await stopped;
});

test('failed backend startup is reported instead of opening an unrelated local server', async context => {
  const directory = temporary(context);
  fs.writeFileSync(path.join(directory, 'config.json'), '{invalid');
  const runtime = startRuntime({ executable: process.execPath, runtimeRoot: ROOT, dataRoot: directory });
  await assert.rejects(runtime.ready, /提前退出/);
  assert.match(fs.readFileSync(runtime.logFile, 'utf8'), /SyntaxError/);
});
