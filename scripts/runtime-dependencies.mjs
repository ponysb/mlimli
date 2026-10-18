import fs from 'node:fs';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';

const BUILTINS = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.mjs']);
const PROVIDED_BY_HOST = new Set(['electron']);
const IMPORT_PATTERNS = [
  /\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire(?:\.resolve)?\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function packageName(specifier) {
  if (!specifier || specifier.startsWith('.') || path.isAbsolute(specifier) || BUILTINS.has(specifier)) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function runtimeSources(root) {
  const files = [];
  function visit(target, relative) {
    if (!fs.existsSync(target)) return;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error(`运行时源码不能包含符号链接：${relative}`);
    if (stat.isFile()) {
      if (SOURCE_EXTENSIONS.has(path.extname(target))) files.push({ file: target, relative });
      return;
    }
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (childRelative.split('/').includes('node_modules') || (childRelative.startsWith('plugins/') && childRelative.split('/').includes('skills'))) continue;
      visit(path.join(target, entry.name), childRelative);
    }
  }
  for (const entry of ['server.mjs', 'core', 'cli', 'plugins', 'scripts/setup-windows-sandbox.mjs']) visit(path.join(root, entry), entry);
  return files;
}

export function runtimeDependencySpecifiers(root) {
  const found = new Map();
  for (const source of runtimeSources(path.resolve(root))) {
    const code = fs.readFileSync(source.file, 'utf8');
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of code.matchAll(pattern)) {
        const name = packageName(match[1]);
        if (!name || PROVIDED_BY_HOST.has(name)) continue;
        if (!found.has(match[1])) found.set(match[1], source.relative);
      }
    }
  }
  return found;
}

export function runtimeDependencyPackages(root) {
  return [...new Set([...runtimeDependencySpecifiers(root).keys()].map(packageName))].sort();
}

export function verifyRuntimeDependencies(root) {
  const resolvedRoot = path.resolve(root);
  const modulesRoot = path.join(resolvedRoot, 'node_modules');
  const specifiers = runtimeDependencySpecifiers(root);
  const failures = [];
  for (const [specifier, source] of specifiers) {
    const require = createRequire(path.join(resolvedRoot, source));
    try {
      const resolved = fs.realpathSync(require.resolve(specifier));
      const relative = path.relative(fs.realpathSync(modulesRoot), resolved);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`解析到了发布目录之外：${resolved}`);
    }
    catch (error) { failures.push(`${specifier}（${source}）：${error.code || error.message}`); }
  }
  if (failures.length) throw new Error(`发布运行时缺少依赖：\n- ${failures.join('\n- ')}`);
  return { checked: specifiers.size, packages: [...new Set([...specifiers.keys()].map(packageName))].sort() };
}

export function verifyInstalledBuildDependencies(root) {
  const resolvedRoot = path.resolve(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(resolvedRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(resolvedRoot, 'package-lock.json'), 'utf8'));
  const lockedRoot = lock.packages?.[''];
  if (!lockedRoot) throw new Error('package-lock.json 缺少根项目记录，请先运行 npm install 更新锁文件');
  const groups = ['dependencies', 'devDependencies'];
  const failures = [];
  for (const group of groups) {
    const declared = manifest[group] || {};
    const locked = lockedRoot[group] || {};
    for (const [name, range] of Object.entries(declared)) {
      if (locked[name] !== range) { failures.push(`${name}：package.json 与 package-lock.json 不一致`); continue; }
      if (!lock.packages?.[`node_modules/${name}`]?.version) failures.push(`${name}：锁文件没有安装版本`);
    }
  }
  let checked = 0;
  for (const [relative, expectedPackage] of Object.entries(lock.packages)) {
    if (!relative || !relative.split('/').includes('node_modules') || !expectedPackage.version || expectedPackage.optional) continue;
    checked++;
    const installed = path.join(resolvedRoot, ...relative.split('/'), 'package.json');
    try {
      const actual = JSON.parse(fs.readFileSync(installed, 'utf8')).version;
      if (actual.replace(/^v(?=\d)/, '') !== expectedPackage.version.replace(/^v(?=\d)/, '')) failures.push(`${relative}：已安装 ${actual}，锁文件要求 ${expectedPackage.version}`);
    } catch { failures.push(`${relative}：未完整安装（锁文件要求 ${expectedPackage.version}）`); }
  }
  if (failures.length) throw new Error(`构建依赖不完整，禁止打包：\n- ${failures.join('\n- ')}\n请关闭正在运行的开发版客户端后执行 npm ci。`);
  return { checked };
}
