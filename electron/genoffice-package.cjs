const fs = require('node:fs');
const path = require('node:path');

const MODULES = ['docs', 'sheets', 'slides', 'pdf'];

function resolveGenOfficeRoot({ developmentMode, electronDirectory, resourcesPath }) {
  return developmentMode
    ? path.resolve(electronDirectory, '../resources/genoffice')
    : path.resolve(resourcesPath, 'genoffice');
}

function readManifest(resourceRoot) {
  const file = path.join(resourceRoot, 'BUILD.json');
  if (!fs.existsSync(file)) return { manifest: null, error: '缺少 BUILD.json' };
  try {
    return { manifest: JSON.parse(fs.readFileSync(file, 'utf8')), error: null };
  } catch (error) {
    return { manifest: null, error: `BUILD.json 无效：${error.message}` };
  }
}

function requiredFiles(type, platform) {
  const files = [
    'main/runtime.cjs',
    'main/docs.cjs',
    `main/${type}.cjs`,
    `${type}/renderer/index.html`,
    `${type}/preload/index.js`,
  ];
  if (type === 'pdf') files.push('wasm/pdfium.wasm', 'wasm/hb-subset.wasm');
  if (type === 'sheets') files.push(`sheets/native/${platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar'}`);
  return [...new Set(files)];
}

function inspectGenOfficePackage(resourceRoot, {
  platform = process.platform,
  arch = process.arch,
  electronMajor = Number(process.versions.electron?.split('.')[0] || 0),
  requireManifest = false,
} = {}) {
  const root = path.resolve(resourceRoot);
  const { manifest, error: manifestError } = readManifest(root);
  const sharedReasons = [];
  if (electronMajor && electronMajor < 30) sharedReasons.push(`Electron ${electronMajor} 不支持嵌入编辑器（需要 >= 30）`);
  if (requireManifest && manifestError) sharedReasons.push(manifestError);
  if (manifest?.platform && manifest.platform !== platform) sharedReasons.push(`组件平台为 ${manifest.platform}-${manifest.arch || 'unknown'}，当前为 ${platform}-${arch}`);
  if (manifest?.arch && manifest.arch !== arch) sharedReasons.push(`组件架构为 ${manifest.platform || 'unknown'}-${manifest.arch}，当前为 ${platform}-${arch}`);

  const details = {};
  for (const type of MODULES) {
    const reasons = [...sharedReasons];
    for (const relative of requiredFiles(type, platform)) {
      if (!fs.existsSync(path.join(root, relative))) reasons.push(`缺少 ${relative}`);
    }
    if (Array.isArray(manifest?.modules) && !manifest.modules.includes(type)) reasons.push(`BUILD.json 未声明 ${type} 模块`);
    if (type === 'sheets' && Array.isArray(manifest?.nativeFiles)) {
      for (const relative of manifest.nativeFiles) {
        if (!fs.existsSync(path.join(root, relative))) reasons.push(`缺少原生依赖 ${relative}`);
      }
    }
    details[type] = { available: reasons.length === 0, reasons };
  }
  return {
    root,
    platform,
    arch,
    manifest,
    manifestError,
    status: Object.fromEntries(MODULES.map(type => [type, details[type].available])),
    details,
  };
}

function assertGenOfficePackage(resourceRoot, options = {}) {
  const report = inspectGenOfficePackage(resourceRoot, { ...options, requireManifest: true });
  const failures = MODULES.filter(type => !report.status[type]).map(type => `${type}: ${report.details[type].reasons.join('；')}`);
  if (failures.length) throw new Error(`GenOffice ${report.platform}-${report.arch} 组件包不完整：\n- ${failures.join('\n- ')}`);
  return report;
}

module.exports = { MODULES, resolveGenOfficeRoot, inspectGenOfficePackage, assertGenOfficePackage };
