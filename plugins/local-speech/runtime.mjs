import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { DATA_ROOT } from '../../core/paths.mjs';
import { readZip } from '../../core/zip.mjs';
import { voiceProfiles } from '../../core/voice-profiles.mjs';
import { DictationWorkerCache } from './worker-cache.mjs';
import { installOfficialPackage } from './offline-install.mjs';
import { sourcePolicy } from './sources.mjs';
import { STT_CATALOG } from './catalog.mjs';
import { MODELS, PREVIEW, VAD, SPEAKER, modelById, modelSupport, recommendModel } from './models.mjs';

const home = path.join(DATA_ROOT, 'local-speech');
const source = path.dirname(fileURLToPath(import.meta.url));
const legacyReceipt = path.join(home, 'installed.json');
const settingsFile = path.join(home, 'settings.json');
const workers = new Set();
const dictationCache = new DictationWorkerCache();
function discardWarmDictation() { dictationCache.clear(); }
function cacheDictation(worker) {
  workers.delete(worker);
  dictationCache.put(worker);
}
function dictationStatus() {
  const active = [...workers].find(worker => worker.kind === 'dictation' && !worker.closed);
  return active ? { state: active.ready ? 'ready' : 'loading', resident: true, active: true, idleTimeoutSeconds: dictationCache.idleMs / 1000, expiresAt: null, error: '' } : { ...dictationCache.status(), active: false };
}
let install = { state: 'not-installed', stage: '', progress: 0, error: '', downloadedBytes: 0, totalBytes: 0, fileDownloadedBytes: 0, fileTotalBytes: 0, speedBps: 0, etaSeconds: null, currentFile: '', currentSource: '', fileStates: [], sourceChecks: [], sourcePolicy };
let installation;
const hardware = { platform: process.platform, arch: process.arch, osRelease: os.release(), memoryGB: Math.round(os.totalmem() / 1024 ** 3 * 10) / 10, cores: os.cpus().length, cpu: os.cpus()[0]?.model || '', gpu: null, detecting: true };
// Cache asynchronous GPU detection; HTTP status requests never wait on a driver tool.
execFile('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 3000 }, (error, stdout) => {
  if (!error) hardware.gpu = stdout.trim().split('\n').map(line => { const parts = line.split(','); return { name: parts[0].trim(), memoryGB: Math.round(Number(parts.at(-1)) / 1024 * 10) / 10 }; }).filter(item => Number.isFinite(item.memoryGB)).sort((a, b) => b.memoryGB - a.memoryGB)[0] || null;
  hardware.detecting = false;
});
function pythonFor(model) {
  try {
    const receipt = JSON.parse(fs.readFileSync(path.join(home, `installed-${model.id}.json`), 'utf8'));
    if (receipt.runtimePython && !receipt.runtimePython.includes('..') && !path.isAbsolute(receipt.runtimePython)) return path.join(home, receipt.runtimePython);
  } catch {}
  if (process.arch === 'ia32') return path.join(home, 'python32', 'python.exe');
  return path.join(home, model.engine === 'transformers' ? 'venv-qwen' : 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { return {}; } }
function atomicJSON(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); }
function requiredFiles(model, preview = process.arch !== 'ia32') {
  const files = [VAD, SPEAKER];
  if (preview) files.push(...['encoder.int8.onnx', 'decoder.onnx', 'joiner.int8.onnx', 'tokens.txt'].map(file => path.join(PREVIEW, file)));
  const names = model.engine === 'transformers' ? ['config.json', 'model.safetensors.index.json', 'model-00001-of-00002.safetensors', 'model-00002-of-00002.safetensors', 'tokenizer_config.json', 'vocab.json', 'merges.txt', 'preprocessor_config.json'] : model.id === 'qwen06' ? ['conv_frontend.onnx', 'encoder.int8.onnx', 'decoder.int8.onnx', 'tokenizer/vocab.json', 'tokenizer/merges.txt', 'tokenizer/tokenizer_config.json'] : ['model.int8.onnx', 'tokens.txt'];
  return [...files, ...names.map(file => path.join(model.directory, file))];
}
function estimatedDownloadBytes(model) {
  const accelerator = hardware.gpu ? 'cuda' : 'cpu';
  const runtime = STT_CATALOG.runtimes.find(item => item.platform === process.platform && item.arch === process.arch && item.engine === model.engine && (item.accelerator === accelerator || item.accelerator === 'cpu'));
  const catalogModel = STT_CATALOG.models.find(item => item.id === model.id);
  if (!runtime || !catalogModel) return (model.downloadMB + 29 + (process.arch === 'ia32' ? 0 : 133)) * 1024 ** 2;
  const roles = process.arch === 'ia32' ? new Set(['vad', 'speaker']) : new Set(['vad', 'speaker', 'preview']);
  const refs = [...STT_CATALOG.shared.filter(item => roles.has(item.role)), ...catalogModel.artifacts, runtime.python, ...runtime.wheels, ...(runtime.native ? [runtime.native] : [])];
  return [...new Set(refs.map(item => item.sha256))].reduce((total, sha) => total + Number(STT_CATALOG.files[sha]?.size || 0), 0);
}
function installed(model) {
  if (modelSupport(model, hardware)) return false;
  try {
    let saved;
    try { saved = JSON.parse(fs.readFileSync(path.join(home, `installed-${model.id}.json`), 'utf8')); } catch {}
    if (model.id === 'sensevoice' && !saved) { saved = JSON.parse(fs.readFileSync(legacyReceipt, 'utf8')); if (saved.version !== 2) return false; }
    else if (saved?.version !== 3 || saved.modelId !== model.id || saved.arch !== process.arch || saved.platform !== process.platform) return false;
    return fs.existsSync(pythonFor(model)) && requiredFiles(model, saved.preview !== false).every(file => fs.existsSync(path.join(home, file))) && (process.arch !== 'ia32' || fs.existsSync(path.join(home, 'native32', 'lib', 'sherpa-onnx-c-api.dll')));
  } catch { return false; }
}
function selectedId() {
  const saved = readSettings();
  const requested = MODELS.find(model => model.id === saved.modelId);
  if (requested && installed(requested)) return requested.id;
  // An interrupted download must not disable an already usable installation.
  const fallback = MODELS.find(model => installed(model));
  return fallback?.id || requested?.id || recommendModel(hardware).id;
}
export function speechStatus() {
  const recommendation = recommendModel(hardware), requestedModelId = readSettings().modelId, modelId = selectedId(), model = modelById(modelId), ready = installed(model);
  let upgradeAvailable = false;
  try { upgradeAvailable = !ready && modelId === 'sensevoice' && JSON.parse(fs.readFileSync(legacyReceipt, 'utf8')).version !== 2; } catch {}
  // Preserve migration status even when a fresh recommendation points elsewhere.
  try { upgradeAvailable ||= JSON.parse(fs.readFileSync(legacyReceipt, 'utf8')).version < 2; } catch {}
  const models = MODELS.map(item => ({ ...item, installed: installed(item), removable: fs.existsSync(path.join(home, item.directory)) || fs.existsSync(path.join(home, `${item.directory}.tar.bz2`)) || fs.existsSync(path.join(home, `${item.directory}.tar.bz2.partial`)), supported: !modelSupport(item, hardware), unavailableReason: modelSupport(item, hardware), recommended: item.id === recommendation.id,
    totalDownloadMB: Math.ceil(estimatedDownloadBytes(item) / 1024 ** 2),
    platformNote: process.arch === 'ia32' ? 'Windows 10+ x86，原生 ONNX + 私有 32 位环境，无需显卡' : 'Windows 10+ x64 / macOS x64、ARM64 / Linux x64、ARM64（glibc 2.28+）；跨平台待各系统实测',
  })).sort((a, b) => Number(b.recommended) - Number(a.recommended));
  return { ...install, state: installation ? 'installing' : ready ? 'ready' : upgradeAvailable && install.state !== 'error' ? 'upgrade-required' : install.state === 'ready' ? 'not-installed' : install.state,
    ready, upgradeAvailable, modelId, requestedModelId, model: model.name, models, recommendation, hardware: { ...hardware }, activeSessions: workers.size, dictation: dictationStatus(), vad: 'Silero VAD', speaker: '3D-Speaker CAM++', downloadMB: models.find(item => item.id === modelId).totalDownloadMB, downloadSource: 'client-direct', sourcePolicy, local: true };
}
export function removeSpeechModel(id) {
  if (workers.size || installation) throw new Error('请结束语音录制并等待安装完成后删除模型');
  const model = modelById(id);
  discardWarmDictation();
  let packageRecord;
  try { packageRecord = JSON.parse(fs.readFileSync(path.join(home, `package-${id}.json`), 'utf8')); } catch {}
  const otherPackages = fs.existsSync(home) ? fs.readdirSync(home).filter(file => /^package-[a-z0-9]+\.json$/.test(file) && file !== `package-${id}.json`).flatMap(file => {
    try { return [JSON.parse(fs.readFileSync(path.join(home, file), 'utf8'))]; } catch { return []; }
  }) : [];
  if (packageRecord) {
    const fileHashes = data => [...data.artifacts, data.runtime.python, ...data.runtime.wheels, ...(data.runtime.native ? [data.runtime.native] : [])].map(file => file.sha256);
    const used = new Set(otherPackages.flatMap(fileHashes));
    for (const sha of fileHashes(packageRecord)) if (/^[a-f0-9]{64}$/.test(sha) && !used.has(sha)) for (const suffix of ['', '.partial']) fs.rmSync(path.join(home, 'packages', sha + suffix), { force: true });
    if (/^[a-z0-9-]+$/.test(packageRecord.runtime.id) && !otherPackages.some(item => item.runtime.id === packageRecord.runtime.id)) fs.rmSync(path.join(home, 'runtime', packageRecord.runtime.id), { recursive: true, force: true });
  }
  for (const file of [model.directory, `${model.directory}.tar.bz2`, `${model.directory}.tar.bz2.partial`, `installed-${id}.json`, `package-${id}.json`, ...(id === 'sensevoice' ? ['installed.json'] : [])]) {
    fs.rmSync(path.join(home, file), { recursive: true, force: true });
  }
  if (readSettings().modelId === id) atomicJSON(settingsFile, { modelId: MODELS.find(item => installed(item))?.id || recommendModel(hardware).id });
  if (install.installingModelId === id) install = { state: 'not-installed', stage: '', progress: 0, error: '' };
  return speechStatus();
}
export function selectSpeechModel(id) {
  if (workers.size || installation) throw new Error('请结束语音录制并等待安装完成后切换模型');
  const model = modelById(id), unsupported = modelSupport(model, hardware);
  if (unsupported) throw new Error(unsupported);
  if (!installed(model)) throw new Error('请先下载此模型，验证成功后会自动启用');
  discardWarmDictation();
  atomicJSON(settingsFile, { modelId: id }); return speechStatus();
}
function command(exe, args, timeout = 30 * 60 * 1000) {
  Object.assign(install, { currentFile: '', fileDownloadedBytes: 0, fileTotalBytes: 0, speedBps: 0, etaSeconds: null });
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PIP_NO_INDEX: '1' } });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('安装超时，请检查网络后重试')); }, timeout);
    const collect = data => { output = (output + data.toString()).slice(-4000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(output || `安装进程退出：${code}`)); });
  });
}
async function download(asset, destination) {
  install.currentFile = asset.name || path.basename(destination); install.currentSource = ''; install.fileDownloadedBytes = 0; install.fileTotalBytes = Number(asset.size || 0); install.speedBps = 0; install.etaSeconds = null;
  if (fs.existsSync(destination) && (!asset.size || fs.statSync(destination).size === asset.size)) {
    let verified = true;
    if (asset.digest?.startsWith('sha256:')) {
      const savedHash = crypto.createHash('sha256');
      for await (const chunk of fs.createReadStream(destination)) savedHash.update(chunk);
      verified = savedHash.digest('hex') === asset.digest.slice(7);
    }
    if (verified) {
      const existing = fs.statSync(destination).size; install.fileDownloadedBytes = existing; install.downloadedBytes += existing; install.totalBytes = Math.max(install.totalBytes, install.downloadedBytes); install.progress = install.totalBytes ? Math.round(install.downloadedBytes / install.totalBytes * 100) : 100; return;
    }
  }
  const sources = Array.isArray(asset.sources) ? asset.sources : [{ id: 'unknown', name: '下载源', url: asset.browser_download_url }];
  let response, lastError; const failures = [];
  for (const candidate of sources) {
    install.currentSource = candidate.name || candidate.url;
    try {
      const attempt = await fetch(candidate.url, { signal: AbortSignal.timeout(60 * 60 * 1000), redirect: 'follow' });
      if (!attempt.ok) { await attempt.body?.cancel(); throw new Error(`HTTP ${attempt.status}`); }
      response = attempt; break;
    } catch (error) { lastError = error; failures.push(`${candidate.name || candidate.url}: ${error?.cause?.code || error?.message || '连接失败'}`); }
  }
  if (!response) throw new Error(`所有下载源均失败：${failures.join('；') || lastError?.message || '连接失败'}；可检查网络、代理或防火墙后重试`);
  if (!install.fileTotalBytes) install.fileTotalBytes = Number(response.headers.get('content-length') || 0);
  const temporary = destination + '.partial', file = fs.openSync(temporary, 'w'), hash = crypto.createHash('sha256'); let size = 0;
  const started = Date.now(), completedBytes = install.downloadedBytes;
  try { for await (const chunk of response.body) { fs.writeSync(file, chunk); hash.update(chunk); size += chunk.length; install.fileDownloadedBytes = size; install.downloadedBytes = completedBytes + size; const elapsed = (Date.now() - started) / 1000; install.speedBps = elapsed > 0 ? Math.round(size / elapsed) : 0; install.etaSeconds = install.speedBps && install.fileTotalBytes > size ? Math.ceil((install.fileTotalBytes - size) / install.speedBps) : null; install.progress = install.fileTotalBytes ? Math.min(100, Math.round(size / install.fileTotalBytes * 100)) : 0; } }
  finally { fs.closeSync(file); }
  install.fileDownloadedBytes = size; install.downloadedBytes = completedBytes + size; install.speedBps = Date.now() > started ? Math.round(size / ((Date.now() - started) / 1000)) : 0; install.etaSeconds = install.speedBps && install.fileTotalBytes > size ? Math.ceil((install.fileTotalBytes - size) / install.speedBps) : null; install.progress = 100;
  if (asset.size && size !== asset.size) throw new Error(`下载不完整：${size} / ${asset.size} 字节，请重试`);
  if (asset.digest?.startsWith('sha256:') && asset.digest.slice(7) !== hash.digest('hex')) throw new Error(`SHA256 校验失败：${asset.name || path.basename(destination)}，请切换源后重试`);
  fs.renameSync(temporary, destination);
}
function extractZip(archive, destination) {
  for (const entry of readZip(fs.readFileSync(archive))) {
    const target = path.resolve(destination, entry.name);
    if (!target.startsWith(path.resolve(destination) + path.sep)) throw new Error('无效归档路径');
    if (entry.name.endsWith('/')) fs.mkdirSync(target, { recursive: true });
    else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, entry.data); }
  }
}
function workerOptions(model) { return JSON.stringify({ modelId: model.id, directory: model.directory, engine: model.engine, preview: process.arch !== 'ia32', native: process.arch === 'ia32', threads: Math.max(1, Math.min(4, hardware.cores - 1)), device: 'auto' }); }
export function installSpeech(id = selectedId()) {
  if (installation) throw new Error('已有模型正在安装，请等待完成');
  if (workers.size) throw new Error('请结束语音录制后安装或切换模型');
  const model = modelById(id), unsupported = modelSupport(model, hardware); if (unsupported) throw new Error(unsupported);
  if (installed(model)) return selectSpeechModel(id);
  discardWarmDictation();
  install = { state: 'installing', installingModelId: id, stage: `准备安装 ${model.name}`, progress: 0, error: '', downloadedBytes: 0, totalBytes: 0, fileDownloadedBytes: 0, fileTotalBytes: 0, speedBps: 0, etaSeconds: null, currentFile: '', currentSource: '', fileStates: [], sourceChecks: [], sourcePolicy };
  installation = (async () => {
    fs.mkdirSync(home, { recursive: true });
    install.stage = '检查国内优先下载源';
    const prepared = await installOfficialPackage({ model, platform: process.platform, arch: process.arch, accelerator: hardware.gpu ? 'cuda' : 'cpu', home, source,
      stage: value => { install.stage = value; }, plan: total => { install.totalBytes = total; }, download, command, extractZip,
      sourceReport: checks => { install.sourceChecks = checks; },
      fileStatus: (name, state, detail = '') => { const existing = install.fileStates.find(item => item.name === name); if (existing) Object.assign(existing, { state, detail }); else install.fileStates.push({ name, state, detail }); } });
    install.stage = '加载模型并验证真实推理'; install.progress = 0;
    await command(prepared.python, [path.join(source, 'worker.py'), home, '--options', workerOptions(model), '--check'], 300000);
    if (!requiredFiles(model).every(file => fs.existsSync(path.join(home, file)))) throw new Error('模型文件不完整，未启用，请重试');
    atomicJSON(path.join(home, `installed-${id}.json`), { version: 3, modelId: id, arch: process.arch, platform: process.platform, preview: process.arch !== 'ia32', ...prepared, installedAt: new Date().toISOString() });
    atomicJSON(settingsFile, { modelId: id }); install = { ...install, state: 'ready', stage: `${model.name} 已启用`, progress: 100, error: '', etaSeconds: 0 };
  })().catch(error => { install = { ...install, state: 'error', installingModelId: id, stage: '安装失败，可重试', error: `${install.stage}：${error.message}` }; }).finally(() => { installation = null; });
  return speechStatus();
}

export class SpeechWorker {
  constructor({ kind = 'meeting' } = {}) {
    if (!speechStatus().ready) throw new Error('请先下载安装本地语音插件');
    const model = modelById(selectedId()); this.kind = kind; this.ready = false; this.modelId = kind === 'dictation' && process.arch !== 'ia32' ? 'zipformer-zh-streaming' : model.id;
    const options = JSON.stringify({ ...JSON.parse(workerOptions(model)), kind });
    this.child = spawn(pythonFor(model), ['-u', path.join(source, 'worker.py'), home, '--options', options], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } });
    this.pending = new Map(); this.sequence = 0; this.errorLog = ''; this.closed = false; workers.add(this);
    this.child.stderr.on('data', chunk => { this.errorLog = (this.errorLog + chunk.toString()).slice(-2500); });
    this.child.on('error', error => this.fail(error)); this.child.on('exit', code => this.fail(new Error(`本地语音进程退出 (${code})：${this.errorLog}`)));
    createInterface({ input: this.child.stdout }).on('line', line => {
      try { const data = JSON.parse(line), task = this.pending.get(data.id); if (!task) return; clearTimeout(task.timer); this.pending.delete(data.id); data.error ? task.reject(new Error(data.error)) : task.resolve(data); } catch {}
    });
    this.initialized = this.request({ profiles: voiceProfiles({ includeEmbeddings: true }) }, 300000).then(result => { this.ready = true; return result; });
    this.initialized.catch(error => this.fail(error));
  }
  request(payload, timeout = 60000) {
    if (this.closed) return Promise.reject(new Error('本地语音进程已关闭'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.fail(new Error('本地语音转写超时，请选择更轻量的模型')); this.child.kill(); }, timeout);
      this.pending.set(id, { resolve, reject, timer }); this.child.stdin.write(JSON.stringify({ ...payload, id }) + '\n', error => { if (error) this.fail(error); });
    });
  }
  fail(error) { this.closed = true; workers.delete(this); for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); } this.pending.clear(); if (this.child.exitCode === null) this.child.kill(); }
  close() { this.fail(new Error('语音已停止')); this.child.kill(); }
}
export function warmDictationWorker() {
  if (installation || !speechStatus().ready || [...workers].some(worker => worker.kind === 'dictation')) return dictationStatus();
  dictationCache.ensure(() => { const worker = new SpeechWorker({ kind: 'dictation' }); workers.delete(worker); return worker; });
  return dictationStatus();
}
export function createSpeechWorker(options) {
  if (options.kind !== 'dictation') return new SpeechWorker(options);
  const worker = dictationCache.take();
  if (!worker) return new SpeechWorker(options);
  workers.add(worker);
  worker.ready = false;
  worker.initialized = worker.initialized.then(() => worker.request({ reset: true })).then(result => { worker.ready = true; return result; });
  worker.initialized.catch(error => worker.fail(error));
  return worker;
}
export function releaseSpeechWorker(worker) {
  if (!worker.closed && worker.kind === 'dictation') cacheDictation(worker);
  else worker.close();
}
export function closeSpeechWorkers() { discardWarmDictation(); for (const worker of workers) worker.close(); }
