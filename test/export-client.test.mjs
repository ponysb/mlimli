import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CLIENT_FILES, CLIENT_TREES, exportClient, planClientExport } from '../scripts/export-client.mjs';
import { normalizeProtocol } from '../core/providers.mjs';
import { setConfig, providerInfo, chat } from '../core/llm.mjs';
import { setWorkspaceRoot } from '../core/paths.mjs';

const actualRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = fs.readFileSync(path.join(actualRoot, 'config.example.json'), 'utf8');

function temporary(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-client-export-'));
  context.after(() => {
    if (!path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'mli-client-export-'))) throw new Error('临时目录边界错误');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function fixture(context) {
  const temporaryRoot = temporary(context);
  const root = path.join(temporaryRoot, 'source');
  fs.mkdirSync(root);
  for (const relativePath of CLIENT_FILES) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'fixture\n');
  }
  for (const relativePath of CLIENT_TREES) fs.mkdirSync(path.join(root, relativePath), { recursive: true });
  fs.writeFileSync(path.join(root, 'config.example.json'), example);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture', scripts: { start: 'node server.mjs', test: 'node --test test/*.mjs',
      website: 'npm --prefix server start', 'start:backend': 'npm --prefix server start', 'build:plugins': 'node scripts/build-plugin-packages.mjs' },
  }));
  return { root, output: path.join(temporaryRoot, 'public'), temporaryRoot };
}

function write(root, relativePath, value) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

test('客户端发布清单包含完整本地运行代码，不含后台、官网或私有运行数据', () => {
  const plan = planClientExport(actualRoot);
  const paths = new Set(plan.entries.map(entry => entry.path));
  for (const required of ['README.md', 'README.en.md', 'server.mjs', 'core/loop.mjs', 'react/src/main.jsx', 'electron/main.cjs',
    'plugins/office/lib/ooxml.mjs', 'plugins/computer-use/plugin.mjs', 'plugins/ffmpeg/plugin.mjs', 'config.example.json',
    'docs/CLIENT-QUALITY.md', 'docs/MEMORY.md', 'docs/SUBAGENTS.md', 'docs/SCHEDULES.md',
    'test/memory.test.mjs', 'test/subagents.test.mjs', 'test/task-quality.test.mjs', 'test/fixtures/document-evidence.mjs']) {
    assert.ok(paths.has(required), required);
  }
  for (const relativePath of paths) {
    assert.ok(!relativePath.startsWith('server/'), relativePath);
    assert.ok(!relativePath.startsWith('website/'), relativePath);
    assert.ok(!relativePath.startsWith('.agent/'), relativePath);
    assert.ok(!relativePath.includes('/node_modules/'), relativePath);
    assert.notEqual(relativePath, 'config.json');
    assert.notEqual(relativePath, '.env');
  }
  assert.equal(paths.has('docs/OPEN-SOURCE.md'), false, '内部发布说明不进入公开客户端');
  for (const excluded of ['docs/QUALITY.md', 'docs/AGENT-RUNTIME-UPGRADE.md', 'test/benchmark-grader.test.mjs',
    'test/website.test.mjs', 'test/integration/windows-update-install.test.mjs', 'plugins/google-drive/OWNERS']) {
    assert.equal(paths.has(excluded), false, excluded);
  }
  for (const entry of plan.entries.filter(item => /^(?:README(?:\.en)?\.md|docs\/.*\.md)$/.test(item.path))) {
    for (const match of entry.data.toString('utf8').matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1];
      if (/^(?:[a-z]+:|#|\/)/i.test(link)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), link.split('#')[0]));
      assert.ok(paths.has(target), `公开文档链接缺失：${entry.path} → ${target}`);
    }
  }
  const clientPackage = JSON.parse(plan.entries.find(entry => entry.path === 'package.json').data);
  assert.equal(clientPackage.scripts.website, undefined);
  assert.equal(clientPackage.scripts['start:backend'], undefined);
  assert.equal(clientPackage.scripts['build:plugins'], undefined);
  assert.equal(clientPackage.scripts.start, 'node server.mjs');
  assert.equal(clientPackage.private, true);
  for (const entry of plan.entries.filter(item => /\.(?:mjs|cjs|jsx|js)$/.test(item.path))) {
    const imports = entry.path.startsWith('test/')
      ? /^import\s+(?:[^;\n]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm
      : /(?:from\s+|import\s+|require\()['"](\.[^'"]+)['"]/g;
    for (const match of entry.data.toString('utf8').matchAll(imports)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), match[1]));
      assert.ok(paths.has(target), `发布包缺少本地依赖：${entry.path} → ${target}`);
    }
  }
});

test('安全配置保留 mock 协议，不要求官方账户且不包含模型 Key 或个人路径', () => {
  const config = JSON.parse(example);
  assert.equal(config.account.enabled, false);
  assert.equal(config.security.workspaceRoot, './workspace');
  assert.equal(normalizeProtocol('mock'), 'mock');
  for (const provider of config.providers) { assert.equal(provider.apiKey, ''); assert.equal(provider.apiKeyEnv ?? '', ''); }
  setConfig(config);
  assert.equal(providerInfo().protocol, 'mock');
});

test('首次运行 mock 模型可完整结束流式请求，记录日志且不访问任何模型服务', async context => {
  const directory = temporary(context);
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; setWorkspaceRoot(actualRoot); });
  globalThis.fetch = async () => { throw new Error('mock 不得访问网络'); };
  setWorkspaceRoot(directory);
  setConfig(JSON.parse(example));
  const events = [];
  for await (const event of chat({ messages: [{ role: 'user', content: '你好' }], system: '', sessionId: 'mock-onboarding' })) events.push(event);
  assert.match(events.filter(event => event.type === 'text_delta').map(event => event.text).join(''), /mock/);
  assert.ok(events.some(event => event.type === 'done'));
  assert.equal(events.some(event => event.type === 'error'), false);
});

test('导出过滤运行数据并为实际发布内容生成匹配的 SHA-256 清单', context => {
  const { root, output } = fixture(context);
  for (const relativePath of ['server/private.js', 'website/index.html', 'config.json', '.env',
    '.agent/sessions/test.json', 'core/.env', 'core/cache.pem', 'react/node_modules/secret.js', 'plugins/office/logs/call.log',
    'core/.cache/secret.txt', 'core/__pycache__/secret.pyc', 'core/config.json.bak', 'core/session.tmp',
    'plugins/google-drive/OWNERS', 'electron/Partitions/private.txt', 'core/voice-profiles.json']) {
    write(root, relativePath, 'private-only-marker');
  }
  write(root, 'core/runtime.mjs', "export const name = 'client';\n");
  const result = exportClient({ sourceRoot: root, output });
  assert.ok(fs.existsSync(path.join(output, 'core/runtime.mjs')));
  for (const file of result.manifest.files) {
    const data = fs.readFileSync(path.join(output, file.path));
    assert.equal(data.length, file.bytes);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), file.sha256);
    assert.ok(!data.includes(Buffer.from('private-only-marker')), file.path);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'EXPORT-MANIFEST.json'))), result.manifest);
  assert.equal(fs.existsSync(path.join(output, 'server')), false);
  assert.equal(fs.existsSync(path.join(output, 'website')), false);
  assert.equal(fs.readFileSync(path.join(output, '.env.example'), 'utf8').includes('APP_SECRET'), false);
});

test('导出预检不写文件，非空目标与源码目录均拒绝覆盖', context => {
  const { root, output } = fixture(context);
  exportClient({ sourceRoot: root, output, dryRun: true });
  assert.equal(fs.existsSync(output), false);
  fs.mkdirSync(output);
  write(output, 'keep.txt', 'keep');
  assert.throws(() => exportClient({ sourceRoot: root, output }), /非空/);
  assert.equal(fs.readFileSync(path.join(output, 'keep.txt'), 'utf8'), 'keep');
  assert.throws(() => exportClient({ sourceRoot: root, output: root }), /源项目/);
  assert.throws(() => exportClient({ sourceRoot: root, output: path.join(root, 'core/out') }), /release/);
});

test('已知 Key 或私钥出现在白名单文件中时拒绝导出且不打印密钥值', context => {
  const { root, output } = fixture(context);
  const key = 'sk-' + 'x'.repeat(32);
  write(root, 'core/credentials.mjs', key);
  assert.throws(() => exportClient({ sourceRoot: root, output }), error => error.message.includes('core/credentials.mjs') && !error.message.includes(key));
  assert.equal(fs.existsSync(output), false);
  write(root, 'core/credentials.mjs', '-----BEGIN ' + 'PRIVATE KEY-----');
  assert.throws(() => exportClient({ sourceRoot: root, output }), /疑似包含凭据/);
});

test('白名单目录里的符号链接不会将目录外私有文件带入发布包', context => {
  const { root, output, temporaryRoot } = fixture(context);
  const external = path.join(temporaryRoot, 'external');
  fs.mkdirSync(external);
  write(external, 'private.txt', 'private-data');
  try { fs.symlinkSync(external, path.join(root, 'core/external'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { context.skip('当前环境没有创建符号链接的权限'); return; } throw error; }
  assert.throws(() => exportClient({ sourceRoot: root, output }), /符号链接/);
  assert.equal(fs.existsSync(output), false);
});
