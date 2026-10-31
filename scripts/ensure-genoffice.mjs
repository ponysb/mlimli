import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { probeSheetsNative } from './genoffice-native.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { inspectGenOfficePackage, assertGenOfficePackage } = createRequire(import.meta.url)('../electron/genoffice-package.cjs');

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd, stdio: 'inherit', windowsHide: true,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    env: { ...env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败（${result.status ?? 'unknown'}）`);
}

function buildCurrentPlatform(directory, root) {
  const source = path.join(root, 'vendor/genoffice');
  if (!fs.existsSync(path.join(source, 'package.json')) || !fs.existsSync(path.join(source, 'package-lock.json'))) {
    throw new Error('缺少 vendor/genoffice 源码。请按 docs/GENOFFICE.md 恢复固定提交后重试；当前没有已发布的 MLI 编辑器组件下载源。');
  }
  // Copied node_modules can contain another OS's Rollup/esbuild binaries.
  const vite = path.join(source, 'node_modules/vite/bin/vite.js');
  const dependenciesReady = fs.existsSync(vite) && spawnSync(process.execPath, [vite, '--version'], { cwd: source, stdio: 'ignore', windowsHide: true }).status === 0;
  if (!dependenciesReady) {
    console.log('正在为当前平台安装 GenOffice npm 依赖（仅 vendor/genoffice）...');
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts'], source);
  }
  console.log(`未找到 GenOffice ${process.platform}-${process.arch} 缓存，正在本机构建...`);
  run(process.execPath, ['scripts/build-genoffice.mjs'], root, { ...process.env, GENOFFICE_OUTPUT: directory });
}

export function ensureGenOffice({ root = projectRoot, platform = process.platform, arch = process.arch, build = buildCurrentPlatform, probe = probeSheetsNative, log = console.log } = {}) {
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64', 'ia32'].includes(arch)) throw new Error('不支持的 GenOffice 平台/架构');
  const active = path.join(root, 'resources/genoffice');
  const cacheRoot = path.join(root, '.cache/genoffice');
  const cache = path.join(cacheRoot, `${platform}-${arch}`);
  const options = { platform, arch, requireManifest: true };
  const current = directory => {
    try { assertGenOfficePackage(directory, options); probe(directory); return true; }
    catch { return false; }
  };
  fs.mkdirSync(cacheRoot, { recursive: true });
  // Outside build outputs so a failed build cannot erase the lock.
  const lock = path.join(cacheRoot, '.prepare-lock');
  if (fs.existsSync(lock)) {
    const owner = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    if (Number.isSafeInteger(owner) && owner > 0) {
      try { process.kill(owner, 0); alive = true; } catch (error) { alive = error.code !== 'ESRCH'; }
    }
    if (alive) throw new Error(`另一个 GenOffice 准备进程正在运行（PID ${owner}），请等待其完成后重试`);
    fs.rmSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  let staging;
  let previous;
  try {
    if (current(active)) { log(`GenOffice ${platform}-${arch} 组件包及原生引擎正常。`); return active; }
    const old = inspectGenOfficePackage(active, { requireManifest: true });
    const oldPlatform = old.manifest?.platform;
    const oldArch = old.manifest?.arch;
    if (['win32', 'darwin', 'linux'].includes(oldPlatform) && ['x64', 'arm64', 'ia32'].includes(oldArch) && (oldPlatform !== platform || oldArch !== arch)) {
      const saved = path.join(cacheRoot, `${oldPlatform}-${oldArch}`);
      if (Object.values(inspectGenOfficePackage(active, { platform: oldPlatform, arch: oldArch, requireManifest: true }).status).every(Boolean)) {
        // The active package may have been explicitly rebuilt since caching it.
        staging = fs.mkdtempSync(path.join(cacheRoot, '.save-'));
        fs.cpSync(active, staging, { recursive: true });
        assertGenOfficePackage(staging, { platform: oldPlatform, arch: oldArch });
        const backup = `${saved}.previous-${process.pid}`;
        if (fs.existsSync(backup)) throw new Error(`上次缓存备份仍存在，请检查 ${backup}`);
        const hadCache = fs.existsSync(saved);
        if (hadCache) fs.renameSync(saved, backup);
        try { fs.renameSync(staging, saved); }
        catch (error) { if (hadCache) fs.renameSync(backup, saved); throw error; }
        staging = undefined;
        if (hadCache) fs.rmSync(backup, { recursive: true, force: true });
        log(`已缓存 GenOffice ${oldPlatform}-${oldArch} 组件。`);
      }
    }
    if (!current(cache)) {
      staging = fs.mkdtempSync(path.join(cacheRoot, '.build-'));
      build(staging, root);
      assertGenOfficePackage(staging, options);
      probe(staging);
      fs.rmSync(cache, { recursive: true, force: true });
      fs.renameSync(staging, cache);
      staging = undefined;
    }
    fs.mkdirSync(path.dirname(active), { recursive: true });
    staging = fs.mkdtempSync(path.join(path.dirname(active), '.genoffice-activate-'));
    fs.cpSync(cache, staging, { recursive: true });
    assertGenOfficePackage(staging, options);
    probe(staging);
    if (fs.existsSync(active)) {
      previous = path.join(path.dirname(active), `.genoffice-previous-${process.pid}`);
      if (fs.existsSync(previous)) throw new Error(`上次切换备份仍存在，请检查 ${previous}`);
      fs.renameSync(active, previous);
    }
    try { fs.renameSync(staging, active); }
    catch (error) { if (previous) fs.renameSync(previous, active); throw error; }
    staging = undefined;
    if (previous) fs.rmSync(previous, { recursive: true, force: true });
    log(`GenOffice ${platform}-${arch} 组件包已就绪。`);
    return active;
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    fs.rmSync(lock, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { ensureGenOffice(); }
  catch (error) { console.error(`GenOffice 自动准备失败：${error.message}`); process.exitCode = 1; }
}
