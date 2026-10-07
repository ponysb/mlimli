import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
function nativeExecutable(binary, platform, arch) {
  let handle;
  try {
    if (!fs.statSync(binary).isFile()) return false;
    handle = fs.openSync(binary, 'r');
    const header = Buffer.alloc(64);
    if (fs.readSync(handle, header, 0, header.length, 0) < header.length) return false;
    if (platform === 'win32') {
      if (header.subarray(0, 2).toString() !== 'MZ') return false;
      const offset = header.readUInt32LE(60);
      const pe = Buffer.alloc(6);
      if (fs.readSync(handle, pe, 0, pe.length, offset) !== pe.length || pe.readUInt32LE(0) !== 0x4550) return false;
      return pe.readUInt16LE(4) === (arch === 'arm64' ? 0xaa64 : 0x8664);
    }
    if (platform === 'linux') return header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    if (platform === 'darwin') return [0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(header.readUInt32BE(0));
    return false;
  } catch { return false; }
  finally { if (handle !== undefined) fs.closeSync(handle); }
}

export function bunExecutable({ projectRoot = root, platform = process.platform, arch = process.arch } = {}) {
  if (!['win32', 'linux', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('当前平台不支持 Bun TUI 构建');
  const filename = platform === 'win32' ? 'bun.exe' : 'bun';
  const bunPackage = path.join(projectRoot, 'node_modules', 'bun');
  const binary = path.join(bunPackage, 'bin', filename);
  // The npm package ships a text placeholder when postinstall was skipped.
  if (nativeExecutable(binary, platform, arch)) return fs.realpathSync(binary);
  try {
    // Resolve from Bun's real package directory so pnpm's optional dependencies work.
    const packageRoot = fs.realpathSync(bunPackage);
    const requireBun = createRequire(path.join(packageRoot, 'package.json'));
    const expectedVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
    const cpu = arch === 'arm64' ? 'aarch64' : 'x64';
    const osName = platform === 'win32' ? 'windows' : platform;
    let names = arch === 'x64' ? ['bun-' + osName + '-' + cpu + '-baseline', 'bun-' + osName + '-' + cpu] : ['bun-' + osName + '-' + cpu];
    if (platform === 'linux' && !process.report?.getReport().header.glibcVersionRuntime) names = names.map(name => name.replace('-baseline', '-musl-baseline') + (name.endsWith('-baseline') ? '' : '-musl'));
    for (const name of names) {
      try {
        const packageName = '@oven/' + name;
        const manifest = JSON.parse(fs.readFileSync(requireBun.resolve(packageName + '/package.json'), 'utf8'));
        if (manifest.version !== expectedVersion) continue;
        const candidate = requireBun.resolve(packageName + '/bin/' + filename);
        if (nativeExecutable(candidate, platform, arch)) return fs.realpathSync(candidate);
      } catch { /* Try the other native package for this CPU. */ }
    }
  } catch { /* Report an actionable error when the package itself is missing. */ }
  throw new Error('Bun 未完成安装或可执行文件无效，请执行 node node_modules/bun/install.js 后重试；安装依赖时需保留 Bun 的平台可选依赖');
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
  const compiler = bunExecutable();
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
  const result = await execute(compiler, [path.join(root, 'scripts', 'compile-tui.ts'), target, binary], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
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
