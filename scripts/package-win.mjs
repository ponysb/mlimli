import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { planClientExport } from './export-client.mjs';
import clientEnvironment from '../core/client-env.cjs';
import { copyTerminalDependencies, installNodeRuntime } from './terminal-package.mjs';
import { buildTui } from './build-tui.mjs';
const { updateFeedUrl } = createRequire(import.meta.url)('../electron/updater.cjs');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function windowsArtifactVariant(name) {
  const match = /^MoliCreation-(Modern|Legacy-Win7)-(Setup|Portable)-[\w.+-]+-(x64|ia32)\.exe$/.exec(name);
  if (!match || (match[1] === 'Modern' ? match[3] !== 'x64' : match[3] !== 'ia32')) return null;
  return match[1] === 'Modern' ? 'modern' : 'legacy';
}

export function publishWindowsArtifacts({ root = ROOT, files, variants }) {
  const directory = path.join(path.resolve(root), 'release');
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('发布目录不能是符号链接');
  fs.mkdirSync(directory, { recursive: true });
  const selected = files.filter(file => variants.includes(windowsArtifactVariant(path.basename(file))));
  for (const variant of variants) {
    if (!selected.some(file => windowsArtifactVariant(path.basename(file)) === variant && path.basename(file).includes('-Setup-'))) throw new Error(`缺少 ${variant} 安装包，保留已有发布文件`);
  }
  const published = new Set(selected.map(file => path.basename(file)));
  for (const file of selected) {
    const target = path.join(directory, path.basename(file));
    if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw new Error('安装包目标必须是普通文件');
    const temporary = path.join(directory, `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
    try { fs.copyFileSync(file, temporary); fs.renameSync(temporary, target); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && variants.includes(windowsArtifactVariant(entry.name)) && !published.has(entry.name)) fs.unlinkSync(path.join(directory, entry.name));
  }
  const artifacts = fs.readdirSync(directory).filter(windowsArtifactVariant).sort();
  const checksums = artifacts.map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')}  ${name}`);
  fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  return [...published].map(name => path.join(directory, name));
}

export function stageWindowsClient({ root = ROOT, output, legacy = false } = {}) {
  const destination = path.resolve(output || path.join(root, 'release', `windows-${legacy ? 'legacy-ia32' : 'modern-x64'}-${Date.now()}`));
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) throw new Error('打包目录必须为空，不会覆盖已有发布包');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const plan = planClientExport(root);
  const publicEnvironment = clientEnvironment.publicClientEnvironment(root);
  const appDirectory = path.join(destination, 'stage', 'app');
  const runtimeDirectory = path.join(destination, 'stage', 'client');
  const records = [];
  function write(directory, relative, data) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data, { flag: 'wx' });
    records.push(`${directory === appDirectory ? 'app' : 'client'}/${relative.replaceAll('\\', '/')}`);
  }
  for (const entry of plan.entries) {
    if (entry.path.startsWith('electron/')) write(appDirectory, entry.path, entry.data);
    else if (['server.mjs', 'config.example.json', 'LICENSE', 'scripts/setup-windows-sandbox.mjs', 'scripts/build-sandbox-image.mjs', 'scripts/sandbox/Dockerfile', 'docs/SANDBOX.md', 'docs/APP-CENTER.md'].includes(entry.path) || /^(core|plugins|cli)\//.test(entry.path)) write(runtimeDirectory, entry.path, entry.data);
  }
  for (const name of ['user-data.cjs', 'runtime-host.cjs', 'app-center-policy.cjs']) write(appDirectory, `core/${name}`, fs.readFileSync(path.join(root, 'core', name)));
  write(runtimeDirectory, 'electron/compat.cjs', plan.entries.find(entry => entry.path === 'electron/compat.cjs').data);
  write(runtimeDirectory, 'electron/runtime.cjs', plan.entries.find(entry => entry.path === 'electron/runtime.cjs').data);
  write(runtimeDirectory, 'client-defaults.env', Buffer.from(publicEnvironment));
  function copyAssets(directory, relative = 'dist') {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('前端构建目录不能包含符号链接');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      const target = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error('前端构建目录不能包含符号链接');
      if (entry.isDirectory()) copyAssets(source, target);
      else if (entry.isFile()) write(runtimeDirectory, target, fs.readFileSync(source));
    }
  }
  const frontend = legacy ? 'dist-legacy' : 'dist';
  if (!fs.existsSync(path.join(root, frontend, 'index.html'))) throw new Error(`请先执行 npm run ${legacy ? 'build:web:legacy' : 'build:web'}`);
  copyAssets(path.join(root, frontend));
  const appManifest = { name: legacy ? `${manifest.name}-legacy` : manifest.name, version: manifest.version, description: manifest.description, main: 'electron/main.cjs', license: manifest.license, private: true };
  write(appDirectory, 'package.json', JSON.stringify(appManifest, null, 2));
  write(runtimeDirectory, 'package.json', JSON.stringify({ name: 'mli-agent-runtime', version: manifest.version, private: true, type: 'module' }, null, 2));
  const terminalDependencies = copyTerminalDependencies(runtimeDirectory);
  for (const dependency of ['core-js', 'undici', '@fastify/busboy', 'dotenv']) {
    write(runtimeDirectory, `licenses/${dependency.replace('/', '-')}.txt`, fs.readFileSync(path.join(ROOT, 'node_modules', dependency, 'LICENSE')));
  }
  fs.writeFileSync(path.join(destination, 'PACKAGE-MANIFEST.json'), JSON.stringify({ scope: 'client-only', variant: legacy ? 'legacy-ia32' : 'modern-x64', version: manifest.version, terminalDependencies, files: records, warnings: plan.warnings }, null, 2));
  const updateServerUrl = publicEnvironment.match(/^MLI_ACCOUNT_SERVER_URL=(.+)$/m)?.[1] || '';
  return { destination, appDirectory, runtimeDirectory, manifest, legacy, updateServerUrl };
}

export async function bundleCompatibility(stage) {
  const { build } = await import('esbuild');
  const result = await build({ entryPoints: [path.join(ROOT, 'electron', 'compat.cjs')], bundle: true, write: false, platform: 'node', target: 'node16', format: 'cjs', legalComments: 'eof' });
  for (const directory of [stage.appDirectory, stage.runtimeDirectory]) fs.writeFileSync(path.join(directory, 'electron', 'compat.cjs'), result.outputFiles[0].contents);
  const environment = await build({ entryPoints: [path.join(ROOT, 'core', 'client-env.cjs')], bundle: true, write: false, platform: 'node', target: 'node16', format: 'cjs', legalComments: 'eof' });
  for (const directory of [stage.appDirectory, stage.runtimeDirectory]) {
    fs.mkdirSync(path.join(directory, 'core'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'core', 'client-env.cjs'), environment.outputFiles[0].contents);
  }
  const updater = await build({ entryPoints: [path.join(ROOT, 'electron', 'updater.cjs')], bundle: true, write: false, platform: 'node', target: 'node16', format: 'cjs', external: ['electron'], legalComments: 'eof' });
  fs.writeFileSync(path.join(stage.appDirectory, 'electron', 'updater.cjs'), updater.outputFiles[0].contents);
}

export function executableArchitecture(file) {
  const executable = fs.readFileSync(file);
  if (executable.length < 64 || executable.toString('ascii', 0, 2) !== 'MZ') throw new Error('不是有效的 Windows 可执行文件');
  const header = executable.readUInt32LE(0x3c);
  if (header + 6 > executable.length || executable.toString('ascii', header, header + 4) !== 'PE\0\0') throw new Error('无效的 PE 文件头');
  const machine = executable.readUInt16LE(header + 4);
  if (machine === 0x14c) return 'ia32';
  if (machine === 0x8664) return 'x64';
  throw new Error(`不支持的 Windows 架构：${machine}`);
}

export async function ensureElectronDistribution(legacy) {
  if (!legacy) {
    await promisify(execFile)(process.execPath, [path.join(ROOT, 'node_modules', 'electron', 'install.js')], { cwd: ROOT, windowsHide: true });
    return path.join(ROOT, 'node_modules', 'electron', 'dist');
  }
  const legacyRequire = createRequire(path.join(ROOT, 'node_modules', 'electron-legacy', 'package.json'));
  const version = legacyRequire('./package.json').version;
  const directory = path.join(ROOT, 'node_modules', '.cache', `electron-${version}-win32-ia32`);
  const executable = path.join(directory, 'electron.exe');
  if (!fs.existsSync(executable)) {
    console.log(`下载 Windows 32 位兼容运行时 Electron ${version}（校验官方 SHA-256）`);
    const archive = await legacyRequire('@electron/get').downloadArtifact({ version, platform: 'win32', arch: 'ia32', artifactName: 'electron', checksums: legacyRequire('./checksums.json') });
    fs.mkdirSync(directory, { recursive: true });
    await legacyRequire('extract-zip')(archive, { dir: directory });
  }
  if (executableArchitecture(executable) !== 'ia32') throw new Error('旧系统运行时必须是 32 位，拒绝使用错误架构');
  return directory;
}

export function windowsBuildConfig(stage, electronDist = path.join(ROOT, 'node_modules', 'electron', 'dist')) {
  const legacy = stage.legacy;
  return {
    appId: legacy ? 'com.molichuangzuo.app.legacy' : 'com.molichuangzuo.app',
    productName: legacy ? '魔力工作台（兼容版）' : '魔力工作台',
    executableName: legacy ? 'MoliCreationLegacy' : 'MoliCreation',
    directories: { app: stage.appDirectory, output: path.join(stage.destination, 'artifacts') },
    files: ['package.json', 'electron/**/*', 'core/**/*'],
    extraResources: [{ from: stage.runtimeDirectory, to: 'client', filter: ['**/*'] }, ...(fs.existsSync(path.join(stage.destination, 'stage', 'node')) ? [{ from: path.join(stage.destination, 'stage', 'node'), to: 'node', filter: ['**/*'] }] : [])],
    extraFiles: [{ from: path.join(stage.runtimeDirectory, 'cli', 'launchers', 'mli.cmd'), to: 'mli.cmd' }],
    asar: true,
    npmRebuild: false,
    // Explicit publishing configuration also makes builder embed app-update.yml.
    // An unconfigured client keeps updates disabled; no requests go to this fallback.
    publish: { provider: 'generic', url: updateFeedUrl(stage.updateServerUrl || 'https://updates.invalid', legacy ? 'windows-legacy-ia32' : 'windows-x64') },
    electronVersion: legacy ? stage.manifest.devDependencies['electron-legacy'].split('@').at(-1) : stage.manifest.devDependencies.electron,
    electronDist,
    win: { icon: path.join(ROOT, 'electron', 'assets', 'icon.png'), target: ['nsis', 'portable'] },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: true,
      packElevateHelper: true,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: legacy ? '魔力工作台（兼容版）' : '魔力工作台',
      deleteAppDataOnUninstall: false,
      include: path.join(ROOT, 'electron', 'terminal-path.nsh'),
      artifactName: `MoliCreation-${legacy ? 'Legacy-Win7' : 'Modern'}-Setup-\${version}-\${arch}.\${ext}`,
    },
    portable: { artifactName: `MoliCreation-${legacy ? 'Legacy-Win7' : 'Modern'}-Portable-\${version}-\${arch}.\${ext}` },
  };
}

async function main() {
  if (process.platform !== 'win32') throw new Error('此打包命令需要在 Windows 上运行');
  const args = process.argv.slice(2);
  if (args.some(argument => !['--dir', '--legacy', '--modern', '--all', '--portable'].includes(argument))) throw new Error('用法：node scripts/package-win.mjs [--modern | --legacy | --all] [--portable] [--dir]');
  if (['--modern', '--legacy', '--all'].filter(argument => args.includes(argument)).length > 1) throw new Error('版本参数不能同时使用');
  const variants = args.includes('--legacy') ? ['legacy'] : args.includes('--modern') || (args.includes('--dir') && !args.includes('--all')) ? ['modern'] : ['modern', 'legacy'];
  const cache = path.join(ROOT, 'node_modules', '.cache', 'mli-windows-packaging');
  fs.mkdirSync(cache, { recursive: true });
  const relativeCache = path.relative(fs.realpathSync(ROOT), fs.realpathSync(cache));
  if (relativeCache.startsWith('..') || path.isAbsolute(relativeCache)) throw new Error('构建缓存必须位于当前项目内');
  const working = fs.mkdtempSync(path.join(cache, 'build-'));
  let completed = false;
  try {
    const { build: buildFrontend } = await import('vite');
    const { build, Platform, Arch } = await import('electron-builder');
    const files = [];
    for (const variant of variants) {
      const legacy = variant === 'legacy';
      await buildFrontend({ configFile: path.join(ROOT, 'vite.config.js'), root: path.join(ROOT, 'react'), mode: legacy ? 'legacy' : 'production' });
      const electronDist = await ensureElectronDistribution(legacy);
      const stage = stageWindowsClient({ legacy, output: path.join(working, variant) });
      await bundleCompatibility(stage);
      if (!legacy) await buildTui({ platform: 'win32', arch: 'x64', output: path.join(stage.runtimeDirectory, 'cli', 'bin') });
      if (!legacy) await installNodeRuntime(path.join(stage.destination, 'stage', 'node'), { platform: 'win32', arch: 'x64' });
      const targets = args.includes('--dir') ? ['dir'] : args.includes('--portable') ? ['nsis', 'portable'] : ['nsis'];
      const config = windowsBuildConfig(stage, electronDist);
      config.win.target = targets;
      files.push(...await build({ projectDir: stage.appDirectory, targets: Platform.WINDOWS.createTarget(targets, legacy ? Arch.ia32 : Arch.x64), config, publish: 'never' }));
      if (args.includes('--dir')) {
        console.log(`调试解包目录：${path.join(stage.destination, 'artifacts')}`);
      } else {
        const executable = path.join(stage.destination, 'artifacts', legacy ? 'win-ia32-unpacked' : 'win-unpacked', legacy ? 'MoliCreationLegacy.exe' : 'MoliCreation.exe');
        const verification = await promisify(execFile)(process.execPath, [path.join(ROOT, 'scripts', 'verify-win.mjs'), executable], { cwd: ROOT, windowsHide: true, timeout: 90000 });
        console.log(verification.stdout.trim());
      }
    }
    if (!args.includes('--dir')) {
      for (const file of publishWindowsArtifacts({ files, variants })) console.log(`安装包：${file}`);
      console.log(`校验文件：${path.join(ROOT, 'release', 'SHA256SUMS.txt')}`);
      completed = true;
    }
  } finally {
    if (completed) {
      const relative = path.relative(cache, working);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || fs.lstatSync(working).isSymbolicLink()) throw new Error('拒绝清理异常构建目录');
      fs.rmSync(working, { recursive: true, force: true });
    } else console.log(`构建或调试缓存保留在：${working}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
