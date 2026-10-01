import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function cleanOldRelease({ root = ROOT, dryRun = false } = {}) {
  const release = path.join(path.resolve(root), 'release');
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(release));
  if (relative !== 'release' || fs.lstatSync(release).isSymbolicLink()) throw new Error('拒绝清理项目外或链接发布目录');
  const entries = fs.readdirSync(release, { withFileTypes: true });
  for (const variant of ['Modern', 'Legacy-Win7']) {
    if (!entries.some(entry => entry.isFile() && entry.name.startsWith(`MoliCreation-${variant}-Setup-`) && entry.name.endsWith('.exe'))) throw new Error('请先生成两套最新安装包，再清理旧产物');
  }
  function noLinks(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`拒绝清理含链接的目录：${directory}`);
      if (entry.isDirectory()) noLinks(path.join(directory, entry.name));
    }
  }
  const targets = [];
  for (const entry of entries) {
    let marker;
    if (/^windows-(?:(?:legacy-ia32|modern-x64)-)?\d+$/.test(entry.name)) marker = 'PACKAGE-MANIFEST.json';
    if (['client-source', 'client-source-final', 'client-source-verified'].includes(entry.name)) marker = 'EXPORT-MANIFEST.json';
    const target = path.join(release, entry.name);
    if (marker) {
      if (!entry.isDirectory() || JSON.parse(fs.readFileSync(path.join(target, marker), 'utf8')).scope !== 'client-only') throw new Error(`不是已确认的客户端产物：${entry.name}`);
    } else if (entry.name === 'ui-terminal-preview') {
      if (!entry.isDirectory()) throw new Error('预览路径不是目录');
      const config = JSON.parse(fs.readFileSync(path.join(target, 'config.json'), 'utf8'));
      if (config.account?.enabled !== false || !config.providers?.length || config.providers.some(provider => provider.protocol !== 'mock') || path.resolve(config.security?.workspaceRoot || '') !== path.join(target, 'workspace')) throw new Error('预览目录不是隔离 mock 测试数据，保留不删');
    } else if (entry.name !== 'verify-terminal-ui.mjs' || !entry.isFile()) continue;
    if (fs.lstatSync(target).isSymbolicLink() || path.dirname(path.resolve(target)) !== release) throw new Error('清理路径不安全');
    if (entry.isDirectory()) noLinks(target);
    targets.push(target);
  }
  if (!dryRun) for (const target of targets) fs.rmSync(target, { recursive: true, force: true });
  return targets;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(argument => argument !== '--dry-run')) throw new Error('用法：node scripts/clean-release.mjs [--dry-run]');
    const dryRun = process.argv.includes('--dry-run');
    const targets = cleanOldRelease({ dryRun });
    for (const target of targets) console.log(`${dryRun ? '待清理' : '已清理'}：${target}`);
    console.log(`共 ${targets.length} 项；当前安装包、源码 ZIP 和其他文件保留。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
