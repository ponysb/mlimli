import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT, windowsBuildConfig } from '../scripts/package-win.mjs';
import { macBuildConfig } from '../scripts/package-mac.mjs';
import { loadResedit, macDevelopmentApp, windowsDevelopmentExecutable } from '../scripts/start-electron-dev.mjs';

const assets = path.join(ROOT, 'electron', 'assets');
const md5 = data => crypto.createHash('md5').update(Buffer.from(data)).digest('hex');

function temporary(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-icons-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function executableIcons(file) {
  const { NtExecutable, NtExecutableResource, Resource } = loadResedit();
  const resources = NtExecutableResource.from(NtExecutable.from(fs.readFileSync(file), { ignoreCert: true }));
  const icons = Resource.IconGroupEntry.fromEntries(resources.entries)
    .flatMap(group => group.icons.map(icon => md5(resources.entries.find(entry => entry.type === 3 && entry.id === icon.iconID).bin)));
  const [versionInfo] = Resource.VersionInfo.fromEntries(resources.entries);
  return { icons, strings: versionInfo.getStringValues(versionInfo.getAllLanguagesForStringValues()[0]) };
}

test('icon assets carry every size the platforms need', () => {
  const { Data } = loadResedit();
  const sizes = Data.IconFile.from(fs.readFileSync(path.join(assets, 'icon.ico'))).icons.map(icon => icon.width || 256);
  for (const size of [16, 32, 48, 256]) assert.ok(sizes.includes(size), `icon.ico 缺少 ${size}px`);
  assert.equal(fs.readFileSync(path.join(assets, 'icon-mac.icns')).subarray(0, 4).toString(), 'icns');
  assert.equal(fs.readFileSync(path.join(assets, 'icon-mac.png')).readUInt32BE(16), 1024);
});

test('packaged Windows and macOS builds point at the project icons', context => {
  const directory = temporary(context);
  const stage = { appDirectory: directory, runtimeDirectory: directory, destination: directory, manifest: { devDependencies: { electron: '44.4.5' } } };
  assert.equal(windowsBuildConfig(stage).win.icon, path.join(assets, 'icon.ico'));
  assert.equal(macBuildConfig(stage, 'arm64').mac.icon, path.join(assets, 'icon-mac.icns'));
});

test('Windows development executable embeds the project icon under a cache-busting name', context => {
  const directory = temporary(context);
  const { NtExecutable, NtExecutableResource, Resource, Data } = loadResedit();
  const projectIcon = Data.IconFile.from(fs.readFileSync(path.join(assets, 'icon.ico')));
  const fixture = NtExecutable.createEmpty();
  const resources = NtExecutableResource.from(fixture);
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, projectIcon.icons.slice(0, 1).map(icon => icon.data));
  const versionInfo = Resource.VersionInfo.createEmpty();
  versionInfo.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'Electron' });
  versionInfo.outputToResourceEntries(resources.entries);
  resources.outputResource(fixture);
  const electron = path.join(directory, 'electron.exe');
  fs.writeFileSync(electron, Buffer.from(fixture.generate()));
  fs.writeFileSync(path.join(directory, 'version'), '44.4.5');
  fs.writeFileSync(path.join(directory, 'MoliCreationDev.exe'), 'stale');

  const branded = windowsDevelopmentExecutable(electron);
  assert.match(path.basename(branded), /^MoliCreationDev-[0-9a-f]{12}\.exe$/);
  const { icons, strings } = executableIcons(branded);
  assert.deepEqual(icons.sort(), projectIcon.icons.map(icon => md5(icon.data.bin)).sort());
  assert.equal(strings.ProductName, '魔力工作台');
  assert.equal(strings.OriginalFilename, path.basename(branded));
  assert.ok(!fs.existsSync(path.join(directory, 'MoliCreationDev.exe')), '旧开发 exe 应被清理');

  const modified = fs.statSync(branded).mtimeMs;
  assert.equal(windowsDevelopmentExecutable(electron), branded);
  assert.equal(fs.statSync(branded).mtimeMs, modified, '图标未变化时不应重写');
  fs.writeFileSync(path.join(directory, 'version'), '44.4.6');
  const rebuilt = windowsDevelopmentExecutable(electron);
  assert.notEqual(rebuilt, branded, 'Electron 升级后应生成新文件名');
  assert.ok(!fs.existsSync(branded));
});

test('macOS development bundle has the project icon, name and its own identity', { skip: process.platform !== 'darwin' }, context => {
  const electron = createRequire(import.meta.url)('electron');
  if (!fs.existsSync(electron)) return context.skip('Electron 运行时未下载');
  const cache = temporary(context);
  const executable = macDevelopmentApp(electron, { cache });
  const app = path.resolve(executable, '..', '..', '..');
  const plist = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' }));
  assert.equal(plist.CFBundleName, '魔力工作台');
  assert.equal(plist.CFBundleDisplayName, '魔力工作台');
  assert.equal(plist.CFBundleIdentifier, 'com.molichuangzuo.app.dev');
  assert.ok(fs.readFileSync(path.join(app, 'Contents', 'Resources', plist.CFBundleIconFile)).equals(fs.readFileSync(path.join(assets, 'icon-mac.icns'))));
  execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  assert.equal(macDevelopmentApp(electron, { cache }), executable);
});
