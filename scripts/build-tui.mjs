import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
export function bunExecutable() {
  const binary = path.join(root, 'node_modules', 'bun', 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun');
  if (!fs.existsSync(binary)) throw new Error('Bun 未安装，请执行 node node_modules/bun/install.js');
  return binary;
}

async function nativePackage(platform, arch) {
  const name = `@opentui/core-${platform}-${arch}`;
  const file = { win32: 'opentui.dll', linux: 'libopentui.so', darwin: 'libopentui.dylib' }[platform];
  const installed = path.join(root, 'node_modules', name, file);
  if (fs.existsSync(installed)) return installed;
  const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', '@opentui', 'core', 'package.json'))).version;
  const cache = path.join(root, 'node_modules', '.cache', 'mli-tui-native', version, `${platform}-${arch}`);
  if (fs.existsSync(path.join(cache, 'package', file))) return path.join(cache, 'package', file);
  const metadata = await fetch(`https://registry.npmjs.org/${name}/${version}`).then(response => {
    if (!response.ok) throw new Error(`Native package HTTP ${response.status}`);
    return response.json();
  });
  const response = await fetch(metadata.dist.tarball);
  if (!response.ok) throw new Error(`Native archive HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const [algorithm, expected] = metadata.dist.integrity.split('-');
  if (crypto.createHash(algorithm).update(data).digest('base64') !== expected) throw new Error('OpenTUI native integrity mismatch');
  fs.mkdirSync(cache, { recursive: true });
  const archive = path.join(cache, 'native.tgz');
  fs.writeFileSync(archive, data);
  await execute('tar', ['-xzf', archive, '-C', cache]);
  if (!fs.existsSync(path.join(cache, 'package', file))) throw new Error('OpenTUI native archive incomplete');
  return path.join(cache, 'package', file);
}

export async function buildTui({ platform = process.platform, arch = process.arch, output } = {}) {
  if (!['win32', 'linux', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported modern TUI target');
  const directory = path.resolve(output || path.join(root, 'node_modules', '.cache', 'mli-tui', `${platform}-${arch}`));
  fs.mkdirSync(directory, { recursive: true });
  const native = await nativePackage(platform, arch);
  const { getNodeAssets } = await import('@opentui/core/node-assets');
  const assets = path.join(directory, 'assets');
  for (const asset of getNodeAssets({ platform: process.platform, arch: process.arch })) {
    if (asset.key.startsWith(`@opentui/core-${process.platform}-`)) continue;
    const target = path.join(assets, asset.key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(asset.source, target);
  }
  const nativeTarget = path.join(assets, `@opentui/core-${platform}-${arch}`, path.basename(native));
  fs.mkdirSync(path.dirname(nativeTarget), { recursive: true });
  fs.copyFileSync(native, nativeTarget);
  const binary = path.join(directory, platform === 'win32' ? 'mli-tui.exe' : 'mli-tui');
  const target = `bun-${platform === 'win32' ? 'windows' : platform}-${arch}${arch === 'x64' ? '-baseline' : ''}`;
  const result = await execute(bunExecutable(), [path.join(root, 'scripts', 'compile-tui.ts'), target, binary], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (process.platform !== 'win32') fs.chmodSync(binary, 0o755);
  const licenses = path.join(directory, 'licenses');
  fs.mkdirSync(licenses, { recursive: true });
  for (const name of ['@opentui/core', '@opentui/solid', 'solid-js', 'bun', 'marked', 'diff', 'web-tree-sitter']) {
    const source = path.join(root, 'node_modules', name);
    const license = fs.readdirSync(source).find(file => /^licen[cs]e/i.test(file));
    if (license && fs.statSync(path.join(source, license)).isFile()) fs.copyFileSync(path.join(source, license), path.join(licenses, `${name.replaceAll('/', '-')}.txt`));
  }
  if (platform === 'darwin' && process.platform === 'darwin') await execute('codesign', ['--force', '--sign', '-', binary]);
  return binary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform') options.platform = args[++i];
    else if (args[i] === '--arch') options.arch = args[++i];
    else if (args[i] === '--output') options.output = args[++i];
    else throw new Error('Usage: build:tui [--platform win32|linux|darwin] [--arch x64|arm64] [--output DIR]');
  }
  buildTui(options).then(binary => console.log(binary)).catch(error => { console.error(error); process.exitCode = 1; });
}
