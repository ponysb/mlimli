import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STT_CATALOG } from './catalog.mjs';
import { assetSources, checkSourceReachability, sourcePolicy } from './sources.mjs';

function inside(root, value) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes(':') || value.startsWith('/') || value.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('安装包路径无效');
  const target = path.resolve(root, value);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('安装包路径越界');
  return target;
}
function fileFor(ref) {
  const file = STT_CATALOG.files[ref.sha256];
  if (!file || !Number.isSafeInteger(file.size) || file.size < 1) throw new Error(`资源清单缺少文件：${ref.sha256}`);
  return { ...ref, filename: file.filename, size: file.size, sourceURL: file.sourceURL };
}
function selectedRefs(model, runtime, arch) {
  const roles = arch === 'ia32' ? new Set(['vad', 'speaker']) : new Set(['vad', 'speaker', 'preview']);
  return [...STT_CATALOG.shared.filter(item => roles.has(item.role)), ...model.artifacts, runtime.python, ...runtime.wheels, ...(runtime.native ? [runtime.native] : [])].map(fileFor);
}
async function makeManifest(model, platform, arch, accelerator, sourceReport) {
  const catalogModel = STT_CATALOG.models.find(item => item.id === model.id);
  if (!catalogModel || !catalogModel.enabled) throw new Error('此语音模型没有可用的客户端资源清单');
  if (arch === 'ia32' && !['paraformer', 'sensevoice'].includes(model.id)) throw new Error('此模型需要 64 位系统');
  const candidates = STT_CATALOG.runtimes.filter(item => item.platform === platform && item.arch === arch && item.engine === model.engine && item.enabled);
  const runtime = candidates.find(item => item.accelerator === accelerator) || candidates.find(item => item.accelerator === 'cpu');
  if (!runtime) throw new Error(`没有 ${platform}/${arch}/${model.engine} 的客户端运行环境`);
  const files = selectedRefs(catalogModel, runtime, arch);
  await Promise.all(files.map(async file => { file.sources = await assetSources(file, { platform, arch, accelerator }); }));
  const unresolved = files.filter(file => !file.sources?.length).map(file => file.filename);
  if (unresolved.length) throw new Error(`无法从国内 PyPI 源解析依赖文件：${unresolved.slice(0, 8).join('、')}${unresolved.length > 8 ? ` 等 ${unresolved.length} 个文件` : ''}。请稍后重试或检查镜像网络。`);
  const checks = await checkSourceReachability(files, sourceReport);
  if (checks.length && !checks.some(item => item.state === 'available')) {
    const detail = checks.map(item => `${item.name}: ${item.error || '不可用'}`).join('；');
    throw new Error(`下载源检查失败，未找到可用源。${detail}。请检查网络、代理或防火墙后重试。`);
  }
  const artifacts = files.filter(file => catalogModel.artifacts.some(item => item.sha256 === file.sha256) || STT_CATALOG.shared.some(item => item.sha256 === file.sha256));
  return { schema: 2, model: { id: catalogModel.id, name: catalogModel.name, directory: catalogModel.directory, version: catalogModel.version, engine: catalogModel.engine }, runtime: { ...runtime, python: files.find(file => file.sha256 === runtime.python.sha256), wheels: runtime.wheels.map(ref => files.find(file => file.sha256 === ref.sha256)), native: runtime.native ? files.find(file => file.sha256 === runtime.native.sha256) : null }, artifacts, totalBytes: files.reduce((sum, file) => sum + file.size, 0), sourceChecks: checks, sourcePolicy };
}
export { makeManifest as buildSpeechManifest };
export async function installOfficialPackage({ model, platform, arch, accelerator, home, stage, plan = () => {}, download, command, extractZip, sourceReport = () => {}, fileStatus = () => {}, source }) {
  const manifest = await makeManifest(model, platform, arch, accelerator, sourceReport);
  const cache = path.join(home, 'packages'); fs.mkdirSync(cache, { recursive: true });
  const packageReceipt = path.join(home, `package-${model.id}.json`);
  fs.writeFileSync(packageReceipt + '.tmp', JSON.stringify(manifest)); fs.renameSync(packageReceipt + '.tmp', packageReceipt);
  plan(manifest.totalBytes);
  async function get(file) {
    if (!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 1 || !Array.isArray(file.sources) || !file.sources.length) throw new Error(`资源校验信息无效：${file.filename || file.sha256}`);
    const target = path.join(cache, file.sha256); stage(`下载 ${file.filename}`); fileStatus(file.filename, 'downloading');
    try { await download({ sources: file.sources, size: file.size, digest: `sha256:${file.sha256}`, official: true, name: file.filename }, target); fileStatus(file.filename, 'verified'); return target; }
    catch (error) { fileStatus(file.filename, 'error', error.message); throw error; }
  }
  const runtime = manifest.runtime, pythonArchive = await get(runtime.python), runtimeHome = path.join(home, 'runtime', runtime.id); fs.mkdirSync(runtimeHome, { recursive: true });
  const python = inside(runtimeHome, runtime.python.executable);
  const runtimeKey = crypto.createHash('sha256').update(JSON.stringify({ id: runtime.id, python: runtime.python.sha256, executable: runtime.python.executable, wheels: runtime.wheels.map(file => file.sha256).sort(), native: runtime.native?.sha256, packages: runtime.packages })).digest('hex');
  let runtimeReady = false; try { runtimeReady = fs.existsSync(python) && (!runtime.native || fs.existsSync(path.join(home, 'native32/lib/sherpa-onnx-c-api.dll'))) && JSON.parse(fs.readFileSync(path.join(runtimeHome, 'ready.json'), 'utf8')).digest === runtimeKey; } catch {}
  if (!runtimeReady) {
    stage('解包独立 Python 环境');
    if (runtime.python.format === 'zip' && arch === 'ia32') { extractZip(pythonArchive, runtimeHome); fs.writeFileSync(path.join(runtimeHome, 'python311._pth'), `python311.zip\n.\nLib/site-packages\n${source}\nimport site\n`); }
    else if (runtime.python.format === 'tar.gz' && arch !== 'ia32') { await command('tar', ['-xzf', pythonArchive, '-C', runtimeHome]); if (platform !== 'win32') fs.chmodSync(python, 0o755); }
    else throw new Error(`不支持当前平台的 Python 安装包：${runtime.python.format}/${arch}`);
    const wheelHome = path.join(runtimeHome, 'wheels'); fs.mkdirSync(wheelHome, { recursive: true });
    for (const wheel of runtime.wheels) { const file = await get(wheel); if (!wheel.filename.endsWith('.whl') || !/^[a-zA-Z0-9_.+-]+$/.test(wheel.filename)) throw new Error(`依赖文件名无效：${wheel.filename}`); fs.copyFileSync(file, inside(wheelHome, wheel.filename)); }
    stage('离线安装推理依赖');
    if (arch === 'ia32') { const site = path.join(runtimeHome, 'Lib', 'site-packages'); fs.mkdirSync(site, { recursive: true }); const pip = runtime.wheels.find(wheel => wheel.filename.startsWith('pip-')); if (!pip) throw new Error('缺少离线安装工具 pip'); extractZip(path.join(wheelHome, pip.filename), site); await command(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-index', '--find-links', wheelHome, '--target', site, ...runtime.packages]); }
    else await command(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-index', '--find-links', wheelHome, ...runtime.packages]);
    for (const wheel of runtime.wheels) fileStatus(wheel.filename, 'installed'); fileStatus(runtime.python.filename, 'installed');
    if (runtime.native) { const archive = await get(runtime.native); stage('解包 32 位推理引擎'); await command(python, [path.join(source, 'unpack.py'), archive, home]); const directory = runtime.native.filename.replace('.tar.bz2', ''); fs.mkdirSync(path.join(home, 'native32'), { recursive: true }); fs.cpSync(path.join(home, directory, 'lib'), path.join(home, 'native32', 'lib'), { recursive: true }); }
    fs.writeFileSync(path.join(runtimeHome, 'ready.json'), JSON.stringify({ digest: runtimeKey })); fs.rmSync(wheelHome, { recursive: true, force: true });
  }
  for (const artifact of manifest.artifacts) { const archive = await get(artifact); stage(`解包 ${artifact.filename}`); fileStatus(artifact.filename, 'installing'); if (artifact.format === 'file') { const target = inside(home, artifact.destination); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(archive, target); } else if (artifact.format === 'tar.bz2') await command(python, [path.join(source, 'unpack.py'), archive, home]); else throw new Error(`不支持此模型包格式：${artifact.format}`); fileStatus(artifact.filename, 'installed'); }
  return { python, runtimeId: runtime.id, runtimePython: path.relative(home, python), accelerator: runtime.accelerator, packageVersion: manifest.model.version, packageDigest: crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex') };
}
