import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { copyTerminalDependencies } from '../scripts/terminal-package.mjs';
import { runtimeDependencyPackages, verifyInstalledBuildDependencies, verifyRuntimeDependencies } from '../scripts/runtime-dependencies.mjs';
import { bunExecutable } from '../scripts/build-tui.mjs';

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-dependency-links-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const modules = path.join(root, 'node_modules');
  fs.mkdirSync(modules);
  const runtimePackages = ['terminal-kit', '@larksuiteoapi/node-sdk', 'dingtalk-stream', 'pdfjs-dist', '@anthropic-ai/sandbox-runtime', '@agentclientprotocol/sdk', 'dotenv'];
  for (const name of [...runtimePackages, 'zod']) {
    const directory = path.join(modules, name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', dependencies: name === 'terminal-kit' ? { 'linked-package': '1.0.0' } : {}, peerDependencies: name === '@agentclientprotocol/sdk' ? { zod: '^3.0.0' } : {} }));
    fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = {};');
    if (name === 'pdfjs-dist') {
      fs.mkdirSync(path.join(directory, 'legacy', 'build'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'legacy', 'build', 'pdf.mjs'), 'export default {};');
    }
    if (name === '@anthropic-ai/sandbox-runtime') {
      fs.mkdirSync(path.join(directory, 'vendor', 'srt-win', 'x64'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'vendor', 'srt-win', 'x64', 'srt-win.exe'), 'native-helper-fixture');
    }
  }
  const dependency = path.join(root, 'store', 'linked-package');
  fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({ name: 'linked-package', version: '1.0.0', exports: {} }));
  fs.writeFileSync(path.join(dependency, 'data.json'), '{"value":1}');
  fs.symlinkSync(dependency, path.join(modules, 'linked-package'), process.platform === 'win32' ? 'junction' : 'dir');
  fs.mkdirSync(path.join(root, 'core'));
  fs.mkdirSync(path.join(root, 'cli'));
  fs.mkdirSync(path.join(root, 'plugins'));
  fs.writeFileSync(path.join(root, 'server.mjs'), [
    "import '@agentclientprotocol/sdk';",
    "import '@anthropic-ai/sandbox-runtime';",
    "import '@larksuiteoapi/node-sdk';",
    "import 'dingtalk-stream';",
    "import 'dotenv';",
    "import 'pdfjs-dist/legacy/build/pdf.mjs';",
    "import 'terminal-kit';",
  ].join('\n'));
  return { root, dependency, output: path.join(root, 'stage') };
}

test('staging resolves package-manager directory links for packages without a main entry', context => {
  const { root, output } = fixture(context);
  const copied = copyTerminalDependencies(output, root);
  assert.equal(copied['linked-package'], '1.0.0');
  assert.equal(copied['@agentclientprotocol/sdk'], '1.0.0');
  assert.equal(copied.dotenv, '1.0.0');
  assert.equal(copied.zod, '1.0.0');
  assert.equal(fs.readFileSync(path.join(output, 'node_modules', 'linked-package', 'data.json'), 'utf8'), '{"value":1}');
  assert.equal(fs.lstatSync(path.join(output, 'node_modules', 'linked-package')).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(output, 'node_modules', '@anthropic-ai/sandbox-runtime', 'vendor', 'srt-win', 'x64', 'srt-win.exe'), 'utf8'), 'native-helper-fixture');
});

test('copied YAML dependency preserves runtime code in nested doc directories', context => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-yaml-dependency-'));
  context.after(() => fs.rmSync(output, { recursive: true, force: true }));
  copyTerminalDependencies(output, undefined, { packages: ['yaml'] });
  const yaml = createRequire(path.join(output, 'package.json'))('yaml');
  const value = { version: '0.6.0', files: [{ url: 'installer.exe' }] };
  assert.deepEqual(yaml.parse(yaml.stringify(value)), value);
});

test('runtime dependency inventory is derived from shipped source imports', context => {
  const { root, output } = fixture(context);
  assert.deepEqual(runtimeDependencyPackages(root), ['@agentclientprotocol/sdk', '@anthropic-ai/sandbox-runtime', '@larksuiteoapi/node-sdk', 'dingtalk-stream', 'dotenv', 'pdfjs-dist', 'terminal-kit']);
  copyTerminalDependencies(output, root);
  fs.copyFileSync(path.join(root, 'server.mjs'), path.join(output, 'server.mjs'));
  const audit = verifyRuntimeDependencies(output);
  assert.equal(audit.checked, 7);
  fs.rmSync(path.join(output, 'node_modules', 'dotenv'), { recursive: true });
  assert.throws(() => verifyRuntimeDependencies(output), /dotenv.*server\.mjs/s);
});

test('build dependency preflight rejects partial installs and lock drift', context => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-build-dependencies-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { present: '1.0.0', missing: '2.0.0' }, devDependencies: { builder: '3.0.0' } }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ packages: { '': { dependencies: { present: '1.0.0', missing: '2.0.0' }, devDependencies: { builder: '3.0.0' } }, 'node_modules/present': { version: '1.0.0' }, 'node_modules/missing': { version: '2.0.0' }, 'node_modules/builder': { version: '3.0.0' } } }));
  fs.mkdirSync(path.join(root, 'node_modules', 'present'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'present', 'package.json'), JSON.stringify({ name: 'present', version: '1.0.0' }));
  assert.throws(() => verifyInstalledBuildDependencies(root), /missing.*builder/s);
  for (const [name, version] of [['missing', '2.0.0'], ['builder', '3.0.0']]) {
    fs.mkdirSync(path.join(root, 'node_modules', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
  }
  assert.deepEqual(verifyInstalledBuildDependencies(root), { checked: 3 });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  manifest.dependencies.present = '1.1.0';
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  assert.throws(() => verifyInstalledBuildDependencies(root), /package\.json.*package-lock\.json/s);
});

test('staging continues to reject links inside a dependency package', context => {
  const { root, dependency, output } = fixture(context);
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(dependency, 'unexpected'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => copyTerminalDependencies(output, root), /符号链接/);
});

function bunFixture(context) {
  const { root } = fixture(context);
  const store = path.join(root, 'store', 'bun-1.3.14', 'node_modules');
  const bun = path.join(store, 'bun');
  fs.mkdirSync(path.join(bun, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(bun, 'package.json'), JSON.stringify({ name: 'bun', version: '1.3.14' }));
  fs.writeFileSync(path.join(bun, 'bin', 'bun.exe'), "echo Bun postinstall was not run");
  fs.symlinkSync(bun, path.join(root, 'node_modules', 'bun'), process.platform === 'win32' ? 'junction' : 'dir');
  function native(name, { version = '1.3.14', valid = true, machine = 0x8664 } = {}) {
    const directory = path.join(store, '@oven', name);
    fs.mkdirSync(path.join(directory, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: '@oven/' + name, version }));
    const binary = path.join(directory, 'bin', 'bun.exe');
    const data = Buffer.alloc(128);
    if (valid) { data.write('MZ'); data.writeUInt32LE(64, 60); data.writeUInt32LE(0x4550, 64); data.writeUInt16LE(machine, 68); }
    fs.writeFileSync(binary, data);
    return binary;
  }
  return { root, bun, native };
}

test('Bun resolution skips the postinstall text placeholder and resolves pnpm native dependencies', context => {
  const { root, native } = bunFixture(context);
  const expected = native('bun-windows-x64-baseline');
  native('bun-windows-x64');
  assert.equal(bunExecutable({ projectRoot: root, platform: 'win32', arch: 'x64' }), fs.realpathSync(expected));
});

test('Bun resolution accepts a valid installed executable and rejects wrong-version or corrupt native packages', context => {
  const { root, bun, native } = bunFixture(context);
  native('bun-windows-x64-baseline', { version: '1.2.0' });
  native('bun-windows-x64', { valid: false });
  assert.throws(() => bunExecutable({ projectRoot: root, platform: 'win32', arch: 'x64' }), /node node_modules\/bun\/install.js/);
  const valid = native('bun-windows-x64');
  fs.copyFileSync(valid, path.join(bun, 'bin', 'bun.exe'));
  assert.equal(bunExecutable({ projectRoot: root, platform: 'win32', arch: 'x64' }), fs.realpathSync(path.join(bun, 'bin', 'bun.exe')));
});

test('Bun resolution rejects a Windows executable compiled for another CPU', context => {
  const { root, native } = bunFixture(context);
  native('bun-windows-x64-baseline', { machine: 0xaa64 });
  native('bun-windows-x64', { machine: 0xaa64 });
  assert.throws(() => bunExecutable({ projectRoot: root, platform: 'win32', arch: 'x64' }), /可执行文件无效/);
});
