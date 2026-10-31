import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

// Pinned upstream runtime, with the SHA-256 published on the release asset.
const LLVM_ARCHIVE = 'llvm-mingw-20261020-ucrt-ubuntu-22.04-x86_64';
const LLVM_SHA256 = '55064b60b991a1e1e8090b8c2f84e82b22cfe5903d12c159d65064cf5e8ae335';
const LLVM_URL = `https://github.com/mstorsjo/llvm-mingw/releases/download/20261020/${LLVM_ARCHIVE}.tar.xz`;

export function nativeBinaryTarget(file) {
  const data = fs.readFileSync(file);
  if (data.length >= 64 && data.toString('ascii', 0, 2) === 'MZ') {
    const pe = data.readUInt32LE(0x3c);
    if (pe + 24 <= data.length && data.toString('ascii', pe, pe + 4) === 'PE\0\0') {
      const arch = { 0x8664: 'x64', 0xaa64: 'arm64', 0x14c: 'ia32' }[data.readUInt16LE(pe + 4)];
      if (arch) return { platform: 'win32', arch };
    }
  }
  if (data.length >= 20 && data.toString('hex', 0, 4) === '7f454c46') {
    const machine = data[5] === 1 ? data.readUInt16LE(18) : data.readUInt16BE(18);
    const arch = { 62: 'x64', 183: 'arm64', 3: 'ia32' }[machine];
    if (arch) return { platform: 'linux', arch };
  }
  if (data.length >= 8 && data.readUInt32LE(0) === 0xfeedfacf) {
    const arch = { 0x1000007: 'x64', 0x100000c: 'arm64' }[data.readUInt32LE(4)];
    if (arch) return { platform: 'darwin', arch };
  }
  throw new Error(`无法识别原生文件的平台/架构：${file}`);
}

export function assertNativeTarget(file, platform = process.platform, arch = process.arch) {
  const actual = nativeBinaryTarget(file);
  if (actual.platform !== platform || actual.arch !== arch) {
    throw new Error(`原生文件为 ${actual.platform}-${actual.arch}，需要 ${platform}-${arch}：${file}`);
  }
}

export function probeSheetsNative(directory) {
  const executable = path.join(directory, 'sheets/native', process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar');
  assertNativeTarget(executable);
  const result = spawnSync(executable, [], {
    input: JSON.stringify({ version: 1, requestId: 'mli-runtime-probe', command: 'close', sessionId: '__mli_runtime_probe__' }) + '\n',
    encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  let response;
  try { response = JSON.parse(result.stdout.trim()); } catch {}
  // Closing an absent session exercises the protocol without touching a file.
  if (result.error || result.status !== 0 || response?.requestId !== 'mli-runtime-probe' || response.version !== 1) {
    throw new Error(`XLSX 原生引擎无法运行（退出码 ${result.status}）：${result.error?.message || result.stderr || '请检查平台架构及原生运行库'}`);
  }
}

export async function ensureWindowsUnwind({ binary, destination, cacheRoot, arch = process.arch }) {
  // MSVC/static builds do not import libunwind and need no extra DLL.
  if (!fs.readFileSync(binary).includes(Buffer.from('libunwind.dll'))) return;
  const dll = path.join(destination, 'libunwind.dll');
  if (fs.existsSync(dll)) { assertNativeTarget(dll, 'win32', arch); return; }
  const triplet = { x64: 'x86_64', arm64: 'aarch64', ia32: 'i686' }[arch];
  if (!triplet) throw new Error(`不支持的 Windows XLSX 架构：${arch}`);
  const runtime = path.join(cacheRoot, 'native-runtime', `llvm-mingw-20261020-${arch}`);
  const cachedDll = path.join(runtime, 'libunwind.dll');
  const license = 'LICENSE-LLVM-runtime.txt';
  if (!fs.existsSync(cachedDll) || !fs.existsSync(path.join(runtime, license))) {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const archive = path.join(cacheRoot, `${LLVM_ARCHIVE}.tar.xz`);
    const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (!fs.existsSync(archive) || hash(archive) !== LLVM_SHA256) {
      console.log('正在下载 Windows XLSX 运行库（LLVM MinGW，SHA-256 校验）...');
      const temporary = `${archive}.${process.pid}.tmp`;
      try {
        const response = await fetch(LLVM_URL, { signal: AbortSignal.timeout(180000) });
        if (!response.ok) throw new Error(`下载 XLSX 运行库失败：HTTP ${response.status}`);
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
        if (hash(temporary) !== LLVM_SHA256) throw new Error('XLSX 运行库 SHA-256 校验失败');
        fs.renameSync(temporary, archive);
      } finally { fs.rmSync(temporary, { force: true }); }
    }
    const staging = fs.mkdtempSync(path.join(cacheRoot, '.runtime-'));
    try {
      const member = `${LLVM_ARCHIVE}/${triplet}-w64-mingw32/bin/libunwind.dll`;
      const result = spawnSync('tar', ['-xf', archive, '-C', staging, member, `${LLVM_ARCHIVE}/LICENSE.TXT`], { windowsHide: true, encoding: 'utf8' });
      if (result.error || result.status !== 0) throw new Error(`解压 XLSX 运行库失败：${result.error?.message || result.stderr}`);
      const extracted = path.join(staging, member);
      assertNativeTarget(extracted, 'win32', arch);
      fs.mkdirSync(runtime, { recursive: true });
      fs.copyFileSync(extracted, cachedDll);
      fs.copyFileSync(path.join(staging, LLVM_ARCHIVE, 'LICENSE.TXT'), path.join(runtime, license));
    } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  }
  assertNativeTarget(cachedDll, 'win32', arch);
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(cachedDll, dll);
  fs.copyFileSync(path.join(runtime, license), path.join(destination, license));
}
