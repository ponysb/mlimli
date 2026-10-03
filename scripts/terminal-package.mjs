import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { planClientExport } from './export-client.mjs';
import clientEnvironment from '../core/client-env.cjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
const NODE_VERSION = '22.22.0';

function copyTree(source, target) {
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`发布文件不能是符号链接：${source}`);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'test', 'tests', 'doc', 'docs', 'sample', 'samples', 'example', 'examples', 'benchmark'].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`发布文件不能是符号链接：${entry.name}`);
    if (entry.isDirectory()) copyTree(path.join(source, entry.name), path.join(target, entry.name));
    else if (entry.isFile()) fs.copyFileSync(path.join(source, entry.name), path.join(target, entry.name));
  }
}

export function copyTerminalDependencies(destination, root = ROOT) {
  const copied = new Map();
  function visit(name, from) {
    const require = createRequire(path.join(from, 'package.json'));
    let directory;
    try { directory = path.dirname(require.resolve(name)); } catch { /* 某些仅供内部引用的包没有 exports 主入口 */ }
    let manifest;
    while (directory && directory !== path.dirname(directory)) {
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        if (manifest.name === name) break;
      } catch {}
      directory = path.dirname(directory);
    }
    if (manifest?.name !== name) {
      let probe = path.resolve(from);
      while (probe !== path.dirname(probe)) {
        const candidate = path.join(probe, 'node_modules', ...name.split('/'));
        try {
          manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf8'));
          if (manifest.name === name) { directory = candidate; break; }
        } catch {}
        probe = path.dirname(probe);
      }
    }
    if (manifest?.name !== name) throw new Error(`无法定位终端依赖 ${name}`);
    // pnpm may expose a package without a main entry through a directory link.
    directory = fs.realpathSync(directory);
    if (copied.has(name)) {
      if (copied.get(name) !== manifest.version) throw new Error(`终端依赖版本冲突：${name}`);
      return;
    }
    copied.set(name, manifest.version);
    copyTree(directory, path.join(destination, 'node_modules', name));
    for (const dependency of Object.keys(manifest.dependencies || {})) visit(dependency, directory);
  }
  visit('terminal-kit', root);
  // 渠道适配器通过动态 import 加载，运行时打包也必须携带官方 SDK。
  visit('@larksuiteoapi/node-sdk', root);
  visit('dingtalk-stream', root);
  visit('pdfjs-dist', root);
  return Object.fromEntries(copied);
}

export async function ensureNodeDistribution({ platform, arch, version = NODE_VERSION, cache = path.join(ROOT, 'node_modules', '.cache', 'mli-node') }) {
  if (!['win32', 'darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch) || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('不支持的 Node 运行时平台、架构或版本');
  const osName = platform === 'win32' ? 'win' : platform;
  const base = `node-v${version}-${osName}-${arch}`;
  const extension = platform === 'win32' ? 'zip' : 'tar.gz';
  const archiveName = `${base}.${extension}`;
  const directory = path.join(cache, base);
  const executable = path.join(directory, platform === 'win32' ? 'node.exe' : 'bin/node');
  if (fs.existsSync(executable) && fs.existsSync(path.join(directory, 'LICENSE'))) return { directory, executable, version };
  fs.mkdirSync(cache, { recursive: true });
  const origin = `https://nodejs.org/dist/v${version}`;
  const sumsResponse = await fetch(`${origin}/SHASUMS256.txt`);
  if (!sumsResponse.ok) throw new Error(`无法下载 Node 校验文件 HTTP ${sumsResponse.status}`);
  const sums = await sumsResponse.text();
  const expected = sums.split('\n').map(line => line.trim().split(/\s+/)).find(parts => parts[1] === archiveName)?.[0];
  if (!expected) throw new Error(`Node 官方校验文件缺少 ${archiveName}`);
  const response = await fetch(`${origin}/${archiveName}`);
  if (!response.ok) throw new Error(`无法下载 Node 运行时 HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('Node 运行时 SHA-256 校验失败');
  const temporary = fs.mkdtempSync(path.join(cache, 'download-'));
  const file = path.join(temporary, archiveName);
  fs.writeFileSync(file, archive);
  if (platform === 'win32') {
    const { default: extract } = await import('extract-zip');
    await extract(file, { dir: temporary });
  } else await execute('tar', ['-xzf', file, '-C', temporary]);
  const extracted = path.join(temporary, base);
  if (!fs.existsSync(path.join(extracted, platform === 'win32' ? 'node.exe' : 'bin/node'))) throw new Error('Node 官方归档缺少可执行文件');
  try { fs.renameSync(extracted, directory); }
  catch (error) { if (!fs.existsSync(executable)) throw error; }
  fs.rmSync(temporary, { recursive: true, force: true });
  return { directory, executable, version };
}

export async function installNodeRuntime(destination, options) {
  const distribution = await ensureNodeDistribution(options);
  fs.mkdirSync(destination, { recursive: true });
  const executable = path.join(destination, options.platform === 'win32' ? 'node.exe' : 'node');
  fs.copyFileSync(distribution.executable, executable);
  if (process.platform !== 'win32') fs.chmodSync(executable, 0o755);
  fs.copyFileSync(path.join(distribution.directory, 'LICENSE'), path.join(destination, 'NODE-LICENSE.txt'));
  return executable;
}

export function stageTerminalClient({ root = ROOT, output, platform = 'linux', arch = 'x64' }) {
  if (!output) throw new Error('终端打包必须指定输出目录');
  const destination = path.resolve(output);
  if (fs.existsSync(destination) && fs.readdirSync(destination).length) throw new Error('打包目录必须为空');
  const client = path.join(destination, 'client');
  const plan = planClientExport(root);
  for (const entry of plan.entries) {
    if (!(entry.path === 'server.mjs' || entry.path === 'config.example.json' || entry.path === 'LICENSE' || /^(core|cli|plugins)\//.test(entry.path) || entry.path === 'electron/compat.cjs' || entry.path === 'electron/runtime.cjs')) continue;
    if (platform !== 'win32' && entry.path.startsWith('plugins/desktop/')) continue;
    const target = path.join(client, entry.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data, { flag: 'wx' });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(client, 'package.json'), JSON.stringify({ name: 'mli-agent-terminal', version: manifest.version, private: true, type: 'module' }, null, 2));
  fs.writeFileSync(path.join(client, 'client-defaults.env'), clientEnvironment.publicClientEnvironment(root));
  const dependencies = copyTerminalDependencies(client);
  fs.mkdirSync(path.join(destination, 'bin'), { recursive: true });
  fs.copyFileSync(path.join(root, 'cli', 'launchers', 'mli'), path.join(destination, 'bin', 'mli'));
  fs.copyFileSync(path.join(root, 'cli', 'launchers', 'install.sh'), path.join(destination, 'install.sh'));
  if (process.platform !== 'win32') {
    fs.chmodSync(path.join(destination, 'bin', 'mli'), 0o755);
    fs.chmodSync(path.join(destination, 'install.sh'), 0o755);
  }
  fs.writeFileSync(path.join(destination, 'PACKAGE-MANIFEST.json'), JSON.stringify({ scope: 'terminal-only', platform, arch, version: manifest.version, dependencies }, null, 2));
  return { destination, client, manifest, platform, arch };
}
