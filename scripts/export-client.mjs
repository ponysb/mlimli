import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CLIENT_FILES = [
  'README.md', 'README.en.md', '.gitignore', '.env.example', 'config.example.json', 'package.json', 'package-lock.json', 'build-windows.cmd',
  'vite.config.js', 'server.mjs', 'PLUGIN-COMPATIBILITY.md',
  'scripts/check.mjs', 'scripts/export-client.mjs', 'scripts/package-win.mjs', 'scripts/verify-win.mjs', 'scripts/clean-release.mjs', 'docs/WINDOWS-PACKAGING.md',
  'scripts/terminal-package.mjs', 'scripts/package-linux.mjs', 'scripts/package-mac.mjs', 'docs/TERMINAL.md', 'test/cli.test.mjs',
  'scripts/build-tui.mjs', 'scripts/compile-tui.ts', 'scripts/test-tui.mjs', 'test/modern-tui.test.mjs', 'test/tui/interaction.test.tsx',
  'test/account.test.mjs', 'test/agent-workflow.test.mjs', 'test/export-client.test.mjs',
  'test/local-library.test.mjs', 'test/session-compat.test.mjs', 'test/session-queue.test.mjs',
  'test/session-tool-replay.test.mjs', 'test/conversation-avatar.test.mjs', 'test/electron-package.test.mjs', 'test/terminal-ui.test.mjs', 'test/provider-settings.test.mjs', 'test/client-env.test.mjs',
  'test/terminal-dependencies.test.mjs',
  'test/attachments.test.mjs', 'test/attachments-http.test.mjs',
  'test/lsp.test.mjs', 'test/task-artifacts.test.mjs', 'test/debug-console.test.mjs',
];
export const CLIENT_TREES = [
  'core', 'react', 'electron', 'cli',
  ...['desktop', 'office', 'ffmpeg', 'remotion', 'notion', 'build-web-apps',
    'build-web-data-visualization', 'linear', 'google-drive', 'github', 'feishu', 'dingtalk', 'lsp'].map(name => `plugins/${name}`),
];
const CLIENT_SCRIPTS = ['start', 'tui', 'cli', 'build:tui', 'test:tui', 'check', 'test', 'dev:web', 'build:web', 'build:web:legacy', 'preelectron', 'electron', 'export:client', 'pack:win', 'dist:win', 'dist:win:modern', 'dist:win:legacy', 'dist:win:all', 'verify:win', 'dist:mac', 'dist:linux'];
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', '.agent', '.agents', 'logs', 'dist', 'dist-legacy', 'release', 'storage', 'media-secrets']);
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function excluded(relativePath) {
  const parts = relativePath.split('/');
  const name = parts.at(-1);
  return parts.some(part => EXCLUDED_DIRECTORIES.has(part)) ||
    name === 'config.json' || name === 'account-session.json' ||
    (name.startsWith('.env') && name !== '.env.example') ||
    /\.(?:log|pem|key|p12|pfx|sqlite|sqlite3|db|zip)$/i.test(name);
}

function assertNoLink(root, relativePath) {
  let current = root;
  for (const part of relativePath.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`导出拒绝符号链接：${relativePath}`);
  }
}

function assertNoCredentials(relativePath, data) {
  if (data.includes(0)) return;
  const text = data.toString('utf8');
  const privateKey = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
  const providerKey = /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}\b/;
  const githubToken = /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/;
  if (privateKey.test(text) || providerKey.test(text) || githubToken.test(text)) {
    throw new Error(`文件疑似包含凭据，请人工检查：${relativePath}`);
  }
}

function packageForClient(data) {
  const manifest = JSON.parse(data.toString('utf8'));
  manifest.private = true;
  manifest.scripts = Object.fromEntries(CLIENT_SCRIPTS.filter(name => manifest.scripts?.[name]).map(name => [name, manifest.scripts[name]]));
  return Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
}

export function planClientExport(sourceRoot = SOURCE_ROOT) {
  const root = fs.realpathSync(sourceRoot);
  const paths = new Set();
  function collect(relativePath) {
    if (excluded(relativePath)) return;
    assertNoLink(root, relativePath);
    const absolutePath = path.join(root, relativePath);
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolutePath).sort()) collect(`${relativePath}/${entry}`);
    } else if (stat.isFile()) paths.add(relativePath);
    else throw new Error(`不支持的发布文件：${relativePath}`);
  }
  for (const relativePath of [...CLIENT_FILES, ...CLIENT_TREES]) collect(relativePath);
  if (fs.existsSync(path.join(root, 'LICENSE'))) collect('LICENSE');
  const entries = [...paths].sort().map(relativePath => {
    let data = fs.readFileSync(path.join(root, relativePath));
    if (relativePath === 'package.json') data = packageForClient(data);
    if (relativePath === 'config.example.json') {
      const config = JSON.parse(data.toString('utf8'));
      if (config.account?.enabled !== false || config.security?.workspaceRoot !== './workspace' ||
          config.providers?.some(provider => provider.apiKey || provider.apiKeyEnv)) {
        throw new Error('公开配置必须关闭账户要求、使用示例工作区且不含模型凭据');
      }
    }
    assertNoCredentials(relativePath, data);
    return { path: relativePath, data };
  });
  entries.sort((first, second) => first.path.localeCompare(second.path));
  const warnings = ['基础凭据扫描不是完整安全或许可证审核；发布前人工检查源文件与第三方素材。'];
  if (!paths.has('LICENSE')) warnings.unshift('尚未提供根 LICENSE，请在正式发布前确认权利人并补齐许可证。');
  return { sourceRoot: root, entries, warnings };
}

function validateDestination(root, output) {
  const relative = path.relative(root, output);
  if (!relative) throw new Error('导出目录不能是源项目目录');
  if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) {
    const first = relative.split(path.sep)[0];
    if (first !== 'release') throw new Error('项目内部导出仅允许 release/ 下的独立目录');
  }
  let current = path.parse(output).root;
  for (const part of output.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('导出目标不能经过符号链接');
  }
  if (fs.existsSync(output) && (!fs.statSync(output).isDirectory() || fs.readdirSync(output).length)) {
    throw new Error('导出目录已存在且非空，请选择新的空目录；不会覆盖或删除原文件');
  }
}

export function exportClient({ sourceRoot = SOURCE_ROOT, output, dryRun = false } = {}) {
  const plan = planClientExport(sourceRoot);
  const destination = path.resolve(output || path.join(plan.sourceRoot, 'release', 'client-source'));
  validateDestination(plan.sourceRoot, destination);
  const files = plan.entries.map(entry => ({
    path: entry.path, bytes: entry.data.length,
    sha256: crypto.createHash('sha256').update(entry.data).digest('hex'),
  }));
  const manifest = { format: 1, scope: 'client-only', files, warnings: plan.warnings };
  if (!dryRun) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of plan.entries) {
      const target = path.join(destination, ...entry.path.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.data, { flag: 'wx' });
    }
    fs.writeFileSync(path.join(destination, 'EXPORT-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  }
  return { output: destination, manifest, dryRun };
}

function main() {
  const args = process.argv.slice(2);
  let output; let dryRun = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--dry-run') dryRun = true;
    else if (argument === '--output' && args[index + 1] && !args[index + 1].startsWith('--')) output = args[++index];
    else throw new Error('用法：node scripts/export-client.mjs [--dry-run] [--output 新的空目录]');
  }
  const result = exportClient({ output, dryRun });
  console.log(`${dryRun ? '预检通过（未写文件）' : '客户端源码已导出'}：${result.output}`);
  console.log(`共 ${result.manifest.files.length} 个文件；不含账户后台、官网、运行配置或用户数据。`);
  for (const warning of result.manifest.warnings) console.warn(warning);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
