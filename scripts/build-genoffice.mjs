import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { assertNativeTarget, ensureWindowsUnwind, probeSheetsNative } from './genoffice-native.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'vendor/genoffice');
const output = path.resolve(process.env.GENOFFICE_OUTPUT || path.join(root, 'resources/genoffice'));
const editors = ['docs', 'sheets', 'slides', 'pdf'];
const buildLock = path.join(output, '.build-lock');
const existingLibunwind = process.platform === 'win32'
  ? (() => {
      const file = path.join(output, 'sheets/native/libunwind.dll');
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    })()
  : null;
if (fs.existsSync(buildLock)) {
  const owner = Number(fs.readFileSync(buildLock, 'utf8'));
  let alive = false;
  if (Number.isSafeInteger(owner) && owner > 0) {
    try { process.kill(owner, 0); alive = true; } catch (error) { alive = error.code !== 'ESRCH'; }
  }
  if (alive) throw new Error('另一个 GenOffice 构建正在运行');
  fs.rmSync(buildLock);
}
const selected = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
if (selected.some(editor => !editors.includes(editor))) throw new Error('支持 docs / sheets / slides / pdf');
if (!fs.existsSync(path.join(source, 'package.json'))) throw new Error('缺少 vendor/genoffice 源码，参见 docs/GENOFFICE.md');
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' }, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 执行失败：${result.status}`);
}
function assertSheetsDependencyVersions() {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'apps/sheets/package.json'), 'utf8'));
  const versions = new Set(Object.entries(manifest.dependencies).filter(([name]) => name.startsWith('@univerjs/')).map(([, version]) => version));
  if (versions.size !== 1 || ![...versions][0].match(/^\d+\.\d+\.\d+$/)) throw new Error(`Sheets 的 @univerjs 依赖必须锁定为同一个精确版本，当前为：${[...versions].join(', ')}`);
}
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(buildLock, `${process.pid}`);
process.on('exit', () => { fs.rmSync(buildLock, { force: true }); });
const assetPlugin = {
  name: 'genoffice-assets',
  setup(b) {
    b.onLoad({ filter: /apps\/pdf\/src\/main\/wasm-path\.ts$/ }, () => ({ contents: `const path = require('node:path'); export const pdfiumWasmPath = () => path.join(__dirname, '../wasm/pdfium.wasm'); export const hbSubsetWasmPath = () => path.join(__dirname, '../wasm/hb-subset.wasm');`, loader: 'js' }));
    b.onResolve({ filter: /\?(raw|asset)$/ }, async args => {
      const clean = args.path.replace(/\?(raw|asset)$/, '');
      const resolved = clean.startsWith('.') ? path.resolve(args.resolveDir, clean) : (await b.resolve(clean, { resolveDir: args.resolveDir, kind: 'import-statement' })).path;
      return { path: resolved, namespace: args.path.endsWith('?raw') ? 'text-resource' : 'office-resource' };
    });
    b.onLoad({ filter: /.*/, namespace: 'text-resource' }, args => ({ contents: fs.readFileSync(args.path, 'utf8'), loader: 'text' }));
    b.onLoad({ filter: /.*/, namespace: 'office-resource' }, args => {
      const name = createHash('sha256').update(fs.readFileSync(args.path)).digest('hex').slice(0, 12) + '-' + path.basename(args.path);
      fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
      fs.copyFileSync(args.path, path.join(output, 'assets', name));
      return { contents: `module.exports = require('node:path').join(__dirname, '../assets', ${JSON.stringify(name)})`, loader: 'js' };
    });
  },
};
const req = createRequire(path.join(source, 'apps/slides/package.json'));
const hb = path.join(path.dirname(req.resolve('harfbuzzjs')), 'harfbuzz.js');
for (const editor of selected.length ? selected : editors) {
  if (editor === 'sheets') assertSheetsDependencyVersions();
  const appRoot = path.join(source, 'apps', editor);
  run(process.execPath, [path.join(source, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'], appRoot);
  const dest = path.join(output, editor);
  fs.rmSync(dest, { recursive: true, force: true });
  for (const dir of ['preload', 'renderer']) fs.cpSync(path.join(appRoot, 'out', dir), path.join(dest, dir), { recursive: true });
  fs.copyFileSync(path.join(root, 'electron/genoffice-editor.css'), path.join(dest, 'renderer/workbench.css'));
  await build({ entryPoints: [path.join(root, 'react/src/office-agent.jsx')], outfile: path.join(dest, 'renderer/workbench-agent.js'), bundle: true, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  fs.appendFileSync(path.join(dest, 'preload/index.js'), '\n' + fs.readFileSync(path.join(root, 'electron/genoffice-agent-preload.cjs'), 'utf8'));
  const indexPath = path.join(dest, 'renderer/index.html');
  fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8').replace('</head>', '<link rel="stylesheet" href="./workbench-agent.css"><link rel="stylesheet" href="./workbench.css"><script defer src="./workbench-agent.js"></script>\n</head>'));
  const main = path.join(output, 'main', `${editor}.cjs`);
  await build({ entryPoints: [path.join(appRoot, 'src/main', `${editor}-main.ts`)], outfile: main, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], alias: { 'harfbuzzjs/dist/harfbuzz.js': hb }, define: { 'import.meta.url': 'officeModuleUrl' }, banner: { js: "const officeModuleUrl = require('node:url').pathToFileURL(__filename).href;" }, plugins: [assetPlugin], logLevel: 'warning' });
  if (editor === 'sheets') {
    const native = path.join(appRoot, 'native/xlsx-engine');
    const name = process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar';
    const binary = path.join(native, 'target/release', name);
    const cargo = process.env.CARGO || (process.platform === 'win32' ? 'cargo.exe' : 'cargo');
    const cargoResult = spawnSync(cargo, ['--version'], { stdio:'ignore', shell:false });
    if (cargoResult.status === 0) run(cargo, ['build', '--release', '--locked', '--manifest-path', path.join(native, 'Cargo.toml'), '--config', path.join(native, '.cargo/config.toml')], source);
    else if (!fs.existsSync(binary)) throw new Error('缺少 cargo，且没有可复用的 release 版 xlsx-sidecar；请安装 Rust 工具链后重试');
    else console.warn('未找到 cargo，复用本地 release 版 xlsx-sidecar（校验二进制架构及实际运行）');
    assertNativeTarget(binary);
    fs.mkdirSync(path.join(dest, 'native'), { recursive: true });
    fs.copyFileSync(binary, path.join(dest, 'native', name));
    if (process.platform !== 'win32') fs.chmodSync(path.join(dest, 'native', name), 0o755);
    if (process.platform === 'win32') {
      const dependency = path.join(native, 'target/release/libunwind.dll');
      if (fs.existsSync(dependency)) fs.copyFileSync(dependency, path.join(dest, 'native/libunwind.dll'));
      else if (existingLibunwind) fs.writeFileSync(path.join(dest, 'native/libunwind.dll'), existingLibunwind);
      await ensureWindowsUnwind({ binary, destination: path.join(dest, 'native'), cacheRoot: path.join(root, '.cache/genoffice') });
    }
    probeSheetsNative(output);
  }
}
await build({ stdin: { contents: "export { installRendererProtocol } from '@genoffice/electron-utils'; export { setUiLang } from '@genoffice/i18n'", resolveDir: source, loader: 'ts' }, outfile: path.join(output, 'main/runtime.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
fs.mkdirSync(path.join(output, 'wasm'), { recursive: true });
for (const [from, name] of [['@embedpdf/pdfium/dist/pdfium.wasm', 'pdfium.wasm'], ['harfbuzzjs/hb-subset.wasm', 'hb-subset.wasm']]) {
  const file = path.join(source, 'node_modules', from);
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(output, 'wasm', name));
}
for (const name of ['LICENSE', 'NOTICE', 'LICENSE-UNICODE.txt']) if (fs.existsSync(path.join(source, name))) fs.copyFileSync(path.join(source, name), path.join(output, name));
const notices = [];
const lock = JSON.parse(fs.readFileSync(path.join(source, 'package-lock.json'), 'utf8'));
for (const [relative, info] of Object.entries(lock.packages || {})) {
  if (!relative.includes('node_modules') || info.dev || info.link) continue;
  const dir = path.join(source, relative);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name));
  for (const name of files) { const file = path.join(dir, name); if (fs.statSync(file).isFile()) notices.push(`\n${relative} ${info.version || ''}\n${fs.readFileSync(file, 'utf8')}`); }
}
fs.writeFileSync(path.join(output, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'));
const builtModules = editors.filter(name => ['main/runtime.cjs', 'main/docs.cjs', `main/${name}.cjs`, `${name}/renderer/index.html`, `${name}/preload/index.js`].every(file => fs.existsSync(path.join(output, file))));
const nativeRoot = path.join(output, 'sheets/native');
const nativeFiles = fs.existsSync(nativeRoot)
  ? fs.readdirSync(nativeRoot, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => `sheets/native/${entry.name}`).sort()
  : [];
fs.writeFileSync(path.join(output, 'BUILD.json'), JSON.stringify({ format: 1, source: 'cheney-plus/happyoffice', commit: 'd9b77caf8a0f0cd7d536b1f549346db69a537044', platform: process.platform, arch: process.arch, modules: builtModules, nativeFiles }, null, 2));
console.log('GenOffice 编辑器已构建：', output);
