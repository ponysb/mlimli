import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveOfficeFile } = require('../electron/genoffice.cjs');
const { resolveGenOfficeRoot, inspectGenOfficePackage, assertGenOfficePackage } = require('../electron/genoffice-package.cjs');

test('Office editing resolves only supported workspace files and rejects escaped symlinks', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-office-path-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const workspace = path.join(dir, 'workspace'); fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(workspace, 'report.DOCX'), 'fixture');
  fs.writeFileSync(path.join(dir, 'outside.pdf'), 'fixture');
  fs.writeFileSync(path.join(workspace, 'script.js'), 'fixture');
  fs.mkdirSync(path.join(workspace, '.agent')); fs.writeFileSync(path.join(workspace, '.agent/private.pdf'), 'fixture');
  assert.equal(resolveOfficeFile(workspace, 'report.DOCX'), fs.realpathSync(path.join(workspace, 'report.DOCX')));
  for (const candidate of ['../outside.pdf', path.join(dir, 'outside.pdf'), '.agent/private.pdf', 'script.js', 'bad\0.pdf']) assert.throws(() => resolveOfficeFile(workspace, candidate));
  if (process.platform !== 'win32') { fs.symlinkSync(path.join(dir, 'outside.pdf'), path.join(workspace, 'link.pdf')); assert.throws(() => resolveOfficeFile(workspace, 'link.pdf'), /超出/); }
});

test('GenOffice component packages are platform-specific and report exact missing files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-office-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, data = 'fixture') => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };
  for (const file of ['main/runtime.cjs', 'main/docs.cjs', 'main/sheets.cjs', 'main/slides.cjs', 'main/pdf.cjs', 'wasm/pdfium.wasm', 'wasm/hb-subset.wasm']) write(file);
  for (const type of ['docs', 'sheets', 'slides', 'pdf']) {
    write(`${type}/renderer/index.html`);
    write(`${type}/preload/index.js`);
  }
  write('BUILD.json', JSON.stringify({ format: 1, platform: 'win32', arch: 'x64', modules: ['docs', 'sheets', 'slides', 'pdf'], nativeFiles: ['sheets/native/xlsx-sidecar.exe'] }));
  let report = inspectGenOfficePackage(root, { platform: 'win32', arch: 'x64', electronMajor: 44, requireManifest: true });
  assert.equal(report.status.docs, true);
  assert.equal(report.status.sheets, false);
  assert.match(report.details.sheets.reasons.join('\n'), /xlsx-sidecar\.exe/);
  write('sheets/native/xlsx-sidecar.exe');
  report = assertGenOfficePackage(root, { platform: 'win32', arch: 'x64', electronMajor: 44 });
  assert.deepEqual(report.status, { docs: true, sheets: true, slides: true, pdf: true });
  assert.throws(() => assertGenOfficePackage(root, { platform: 'darwin', arch: 'arm64', electronMajor: 44 }), /组件平台为 win32-x64/);
  assert.throws(() => assertGenOfficePackage(root, { platform: 'win32', arch: 'x64', electronMajor: 22 }), /Electron 22/);
});

test('GenOffice development resources do not depend on Electron app.isPackaged', () => {
  const electronDirectory = path.join('C:', 'workspace', 'electron');
  const resourcesPath = path.join('C:', 'runtime', 'resources');
  assert.equal(resolveGenOfficeRoot({ developmentMode: true, electronDirectory, resourcesPath }), path.resolve(electronDirectory, '../resources/genoffice'));
  assert.equal(resolveGenOfficeRoot({ developmentMode: false, electronDirectory, resourcesPath }), path.resolve(resourcesPath, 'genoffice'));
});

const { EventEmitter } = require('node:events');
const { saveOfficeEntry } = require('../electron/genoffice.cjs');
function saveFixture(type) {
  const ipc = new EventEmitter();
  const contents = new EventEmitter();
  contents.mainFrame = {};
  contents.isDestroyed = () => false;
  contents.sent = [];
  contents.send = channel => contents.sent.push(channel);
  return { ipc, contents, entry: { type, view: { webContents: contents } } };
}

test('Office save awaits the correct renderer and deduplicates concurrent requests for every format', async () => {
  for (const type of ['docs', 'sheets', 'slides', 'pdf']) {
    const { ipc, contents, entry } = saveFixture(type);
    const prefix = type === 'sheets' ? 'workbook' : type;
    const channel = `${prefix}:close-save-result`;
    const pending = saveOfficeEntry(entry, ipc);
    assert.equal(saveOfficeEntry(entry, ipc), pending);
    assert.deepEqual(contents.sent, [`${prefix}:close-save-request`]);
    ipc.emit(channel, { sender: {}, senderFrame: contents.mainFrame }, true);
    ipc.emit(channel, { sender: contents, senderFrame: {} }, true);
    assert.equal(ipc.listenerCount(channel), 1);
    ipc.emit(channel, { sender: contents, senderFrame: contents.mainFrame }, true);
    assert.equal(await pending, true);
    assert.equal(ipc.listenerCount(channel), 0);
    assert.equal(contents.listenerCount('destroyed'), 0);
  }
});

test('Office save reports failure, allows retry and cleans up if the editor closes', async () => {
  const { ipc, contents, entry } = saveFixture('docs');
  const failed = saveOfficeEntry(entry, ipc);
  ipc.emit('docs:close-save-result', { sender: contents, senderFrame: contents.mainFrame }, false);
  assert.equal(await failed, false);
  const retry = saveOfficeEntry(entry, ipc);
  contents.emit('destroyed');
  await assert.rejects(retry, /保存期间编辑器已关闭/);
  assert.equal(ipc.listenerCount('docs:close-save-result'), 0);
  await assert.rejects(saveOfficeEntry(undefined, ipc), /编辑器已关闭/);
});
