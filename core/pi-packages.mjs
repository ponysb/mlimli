import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { DATA_ROOT } from './paths.mjs';

const root = path.join(DATA_ROOT, 'pi-packages');
let managing = false;
export async function withPluginManagement(fn) {
  if (managing) throw new Error('插件管理操作正在进行');
  managing = true;
  try { return await fn(); } finally { managing = false; }
}
function runNpm(args, cwd) {
  return new Promise((resolve, reject) => {
    const launch = async () => {
      const { nodePackageCommand } = await import('./lsp.mjs');
      const npm = nodePackageCommand('npm', 'npm', { roots: [path.dirname(process.execPath)] });
      if (!npm) throw new Error('未找到可运行的 npm，请安装 Node.js 后重试');
      return spawn(npm.command, [...npm.args, ...args], { cwd, windowsHide: true, env: { ...process.env, ...npm.env }, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    };
    launch().then(child => {
      let diagnostics = '';
      const drain = chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-4000); };
      child.stdout.on('data', drain); child.stderr.on('data', drain);
      const timer = setTimeout(() => child.kill(), 120000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`pi 包依赖安装失败（${code}）：${diagnostics}`)); });
    }, reject);
  });
}
export function listPiPackages() {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter(name => !name.startsWith('.')).flatMap(id => {
    try { return [{ id, ...JSON.parse(fs.readFileSync(path.join(root, id, 'mli-pi.json'), 'utf8')) }]; } catch { return []; }
  });
}
export async function installPiPackage(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('需要 npm:包名@版本 或本地 pi 包目录');
  fs.mkdirSync(root, { recursive: true });
  const temp = fs.mkdtempSync(path.join(root, '.install-'));
  try {
    let packageRoot;
    if (source.startsWith('npm:')) {
      const spec = source.slice(4);
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@[^\s/]+)?$/i.test(spec)) throw new Error('无效 npm pi 包来源');
      fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ private: true, name: 'mli-pi-install', version: '1.0.0' }));
      await runNpm(['install', '--ignore-scripts', '--omit=dev', '--legacy-peer-deps', '--no-audit', '--no-fund', '--save-exact', '--', spec], temp);
      const installed = JSON.parse(fs.readFileSync(path.join(temp, 'package.json'), 'utf8'));
      const name = Object.keys(installed.dependencies || {})[0];
      if (!name) throw new Error('npm 未安装 pi 包');
      packageRoot = path.join(temp, 'node_modules', name);
    } else {
      if (/^[a-z]+:/i.test(source) && !path.isAbsolute(source)) throw new Error('目前支持 npm:包名@版本 与本地目录；Git 包请先检出固定版本后安装目录');
      const local = fs.realpathSync(path.resolve(source));
      if (!fs.statSync(local).isDirectory()) throw new Error('pi 本地来源必须是目录');
      packageRoot = path.join(temp, 'package');
      fs.cpSync(local, packageRoot, { recursive: true, filter: file => !['node_modules', '.git'].includes(path.basename(file)) });
      const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
      if (Object.keys(manifest.dependencies || {}).length) await runNpm(['install', '--ignore-scripts', '--omit=dev', '--legacy-peer-deps', '--no-audit', '--no-fund'], packageRoot);
    }
    const { discoverPiPackage } = await import('./pi-adapter.mjs');
    const { manifest } = discoverPiPackage(packageRoot);
    if (typeof manifest.name !== 'string' || !manifest.name) throw new Error('pi 包缺少 package.json name');
    const id = crypto.createHash('sha256').update(manifest.name).digest('hex').slice(0, 20);
    const record = { name: manifest.name, version: manifest.version || '0.0.0', source, packageRoot: path.relative(temp, packageRoot), installedAt: new Date().toISOString(), status: 'pending', adapterVersion: 1 };
    fs.writeFileSync(path.join(temp, 'mli-pi.json'), JSON.stringify(record, null, 2));
    const target = path.join(root, id), backup = path.join(root, `.backup-${id}-${crypto.randomUUID()}`);
    const existed = fs.existsSync(target);
    if (existed) fs.renameSync(target, backup);
    try { fs.renameSync(temp, target); }
    catch (error) { if (existed) fs.renameSync(backup, target); throw error; }
    if (existed) fs.rmSync(backup, { recursive: true, force: true });
    return { id, ...record };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
export function removePiPackage(id) {
  if (!/^[a-f0-9]{20}$/.test(id)) throw new Error('无效 pi 包 ID');
  fs.rmSync(path.join(root, id), { recursive: true, force: true });
}
