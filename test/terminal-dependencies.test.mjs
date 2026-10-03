import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { copyTerminalDependencies } from '../scripts/terminal-package.mjs';

function fixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-dependency-links-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const modules = path.join(root, 'node_modules');
  fs.mkdirSync(modules);
  for (const name of ['terminal-kit', '@larksuiteoapi/node-sdk', 'dingtalk-stream', 'pdfjs-dist']) {
    const directory = path.join(modules, name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', dependencies: name === 'terminal-kit' ? { 'linked-package': '1.0.0' } : {} }));
    fs.writeFileSync(path.join(directory, 'index.js'), 'module.exports = {};');
  }
  const dependency = path.join(root, 'store', 'linked-package');
  fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({ name: 'linked-package', version: '1.0.0', exports: {} }));
  fs.writeFileSync(path.join(dependency, 'data.json'), '{"value":1}');
  fs.symlinkSync(dependency, path.join(modules, 'linked-package'), process.platform === 'win32' ? 'junction' : 'dir');
  return { root, dependency, output: path.join(root, 'stage') };
}

test('staging resolves package-manager directory links for packages without a main entry', context => {
  const { root, output } = fixture(context);
  const copied = copyTerminalDependencies(output, root);
  assert.equal(copied['linked-package'], '1.0.0');
  assert.equal(fs.readFileSync(path.join(output, 'node_modules', 'linked-package', 'data.json'), 'utf8'), '{"value":1}');
  assert.equal(fs.lstatSync(path.join(output, 'node_modules', 'linked-package')).isSymbolicLink(), false);
});

test('staging continues to reject links inside a dependency package', context => {
  const { root, dependency, output } = fixture(context);
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(dependency, 'unexpected'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => copyTerminalDependencies(output, root), /符号链接/);
});
