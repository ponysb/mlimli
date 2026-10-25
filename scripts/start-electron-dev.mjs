import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const assets = path.join(root, 'electron', 'assets');
const PRODUCT_NAME = '魔力工作台';
const DEV_BUNDLE_ID = 'com.molichuangzuo.app.dev';
// Bump when the branding steps change so cached copies are rebuilt.
const BRANDING_REVISION = '2';

function fingerprint(...parts) {
  const hash = crypto.createHash('sha256').update(BRANDING_REVISION);
  for (const part of parts) hash.update(part);
  return hash.digest('hex').slice(0, 12);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args[0]} 失败：${(result.stderr || result.error?.message || '').trim()}`);
}

// Electron.app's Info.plist decides the Dock icon, menu bar name and LaunchServices identity,
// so a runtime dock.setIcon alone can never cover launch time or pinned Dock items.
export function macDevelopmentApp(electronExecutable, { icon = path.join(assets, 'icon-mac.icns'), cache = path.join(root, 'node_modules', '.cache', 'mli-electron-dev') } = {}) {
  const sourceApp = path.resolve(electronExecutable, '..', '..', '..');
  const version = fs.readFileSync(path.join(path.dirname(sourceApp), 'version'), 'utf8').trim();
  const key = `darwin-${version}-${fingerprint(version, fs.readFileSync(icon))}`;
  const bundleName = `${PRODUCT_NAME}开发版.app`;
  const targetApp = path.join(cache, key, bundleName);
  const executable = path.join(targetApp, 'Contents', 'MacOS', path.basename(electronExecutable));
  if (fs.existsSync(path.join(cache, key, '.ready'))) return executable;

  fs.mkdirSync(cache, { recursive: true });
  const staging = fs.mkdtempSync(path.join(cache, '.staging-'));
  try {
    const stagedApp = path.join(staging, bundleName);
    try { run('cp', ['-Rc', sourceApp, stagedApp]); }
    catch { fs.rmSync(stagedApp, { recursive: true, force: true }); run('ditto', [sourceApp, stagedApp]); }
    const contents = path.join(stagedApp, 'Contents');
    const plist = path.join(contents, 'Info.plist');
    fs.copyFileSync(icon, path.join(contents, 'Resources', 'mli.icns'));
    for (const [field, value] of [['CFBundleName', PRODUCT_NAME], ['CFBundleDisplayName', PRODUCT_NAME], ['CFBundleIdentifier', DEV_BUNDLE_ID], ['CFBundleIconFile', 'mli.icns']]) {
      run('plutil', ['-replace', field, '-string', value, plist]);
    }
    spawnSync('plutil', ['-remove', 'CFBundleIconName', plist], { stdio: 'ignore' });
    // Editing Info.plist breaks Electron's signature seal; an ad-hoc signature keeps arm64 launches valid.
    run('codesign', ['--force', '--deep', '--sign', '-', stagedApp]);
    fs.writeFileSync(path.join(staging, '.ready'), `${version}\n`);
    try { fs.renameSync(staging, path.join(cache, key)); }
    catch (error) { if (!fs.existsSync(path.join(cache, key, '.ready'))) throw error; }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  for (const entry of fs.readdirSync(cache)) {
    if (entry.startsWith('darwin-') && entry !== key) fs.rmSync(path.join(cache, entry), { recursive: true, force: true });
  }
  return executable;
}

export function loadResedit() {
  // resedit ships with electron-builder; resolve through it so npm, yarn and pnpm layouts all work.
  const builder = createRequire(require.resolve('electron-builder/package.json'));
  const builderLib = createRequire(builder.resolve('app-builder-lib/package.json'));
  return builderLib('resedit');
}

export function brandWindowsExecutable(source, target, icon) {
  const { NtExecutable, NtExecutableResource, Resource, Data } = loadResedit();
  const executable = NtExecutable.from(fs.readFileSync(source), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const icons = Data.IconFile.from(fs.readFileSync(icon)).icons.map(item => item.data);
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  if (!groups.length) throw new Error('Electron 可执行文件中没有图标资源');
  for (const group of groups) Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons);
  const [versionInfo = Resource.VersionInfo.createEmpty()] = Resource.VersionInfo.fromEntries(resources.entries);
  const [language = { lang: 0x0409, codepage: 1200 }] = versionInfo.getAllLanguagesForStringValues();
  versionInfo.setStringValues(language, {
    ProductName: PRODUCT_NAME,
    FileDescription: `${PRODUCT_NAME}开发版`,
    InternalName: 'MoliCreationDev',
    OriginalFilename: path.basename(target),
  });
  versionInfo.outputToResourceEntries(resources.entries);
  resources.outputResource(executable);
  const staging = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(staging, Buffer.from(executable.generate()));
  fs.renameSync(staging, target);
}

// Explorer caches icons per file path, so every icon/Electron change gets a new executable name.
export function windowsDevelopmentExecutable(electronExecutable, icon = path.join(assets, 'icon.ico')) {
  const source = path.resolve(electronExecutable);
  const directory = path.dirname(source);
  const version = fs.readFileSync(path.join(directory, 'version'), 'utf8').trim();
  const name = `MoliCreationDev-${fingerprint(version, String(fs.statSync(source).size), fs.readFileSync(icon))}.exe`;
  const target = path.join(directory, name);
  if (!fs.existsSync(target)) brandWindowsExecutable(source, target, icon);
  for (const entry of fs.readdirSync(directory)) {
    if (/^MoliCreationDev.*\.exe$/i.test(entry) && entry !== name) {
      try { fs.rmSync(path.join(directory, entry), { force: true }); } catch {}
    }
  }
  return target;
}

export function developmentExecutable(electronExecutable = require('electron')) {
  if (process.platform === 'darwin') return macDevelopmentApp(electronExecutable);
  if (process.platform === 'win32') return windowsDevelopmentExecutable(electronExecutable);
  return electronExecutable;
}

function main() {
  let executable;
  try { executable = developmentExecutable(); }
  catch (error) {
    console.warn(`[electron-dev] 品牌化开发运行时失败，回退到默认 Electron：${error.message}`);
    executable = require('electron');
  }
  const child = spawn(executable, ['electron/main.cjs', '--mli-development', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: false,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
