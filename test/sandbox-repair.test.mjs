import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandboxRepairBundle } from '../scripts/sandbox-repair-bundle.mjs';
import { restoreSandboxComponents, ensureSandboxComponents } from '../core/sandbox-repair.mjs';
import { repairWindowsSandboxComponents } from '../core/windows-sandbox.mjs';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-repair-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'core'));
  const archive = gzipSync(Buffer.from(JSON.stringify(files)));
  fs.writeFileSync(path.join(root, 'sandbox-runtime-repair.gz'), archive);
  fs.writeFileSync(path.join(root, 'core', 'sandbox-repair-manifest.json'), JSON.stringify({ sha256: crypto.createHash('sha256').update(archive).digest('hex') }));
  return root;
}
test('offline repair restores missing and damaged files', t => {
  const relative = 'node_modules/@anthropic-ai/sandbox-runtime/dist/index.js';
  const root = fixture(t, [{ path: relative, data: Buffer.from('restored').toString('base64') }]);
  restoreSandboxComponents({ root });
  const target = path.join(root, relative);
  assert.equal(fs.readFileSync(target, 'utf8'), 'restored');
  fs.writeFileSync(target, 'broken');
  restoreSandboxComponents({ root });
  assert.equal(fs.readFileSync(target, 'utf8'), 'restored');
});
test('repair rejects tampered archives and path traversal before writing', t => {
  const root = fixture(t, [{ path: 'node_modules/../../outside', data: '' }]);
  assert.throws(() => restoreSandboxComponents({ root }), /无效路径/);
  fs.appendFileSync(path.join(root, 'sandbox-runtime-repair.gz'), 'tampered');
  assert.throws(() => restoreSandboxComponents({ root }), /校验失败/);
});
test('repair refuses symlink targets', t => {
  const root = fixture(t, [{ path: 'node_modules/index.js', data: '' }]);
  fs.symlinkSync(path.join(root, 'core'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => restoreSandboxComponents({ root }), /符号链接/);
});
test('command repair shares one restoration and propagates failures', async () => {
  let ready = false, restores = 0;
  const check = () => { if (!ready) throw Error('missing'); return 'helper'; };
  const restore = async () => { restores++; ready = true; };
  assert.deepEqual(await Promise.all([ensureSandboxComponents(check, { restore }), ensureSandboxComponents(check, { restore })]), ['helper', 'helper']);
  assert.equal(restores, 1);
  await assert.rejects(ensureSandboxComponents(() => { throw Error('missing'); }, { restore: () => { throw Error('repair failed'); } }), /repair failed/);
});
test('packaged backup restores the actual runtime in a clean directory', t => {
  const root = fixture(t, []);
  createSandboxRepairBundle(root, fileURLToPath(new URL('../', import.meta.url)));
  restoreSandboxComponents({ root });
  execFileSync(process.execPath, ['--input-type=module', '-e', "await import('@anthropic-ai/sandbox-runtime')"], { cwd: root });
  assert.ok(fs.existsSync(path.join(root, 'node_modules/@anthropic-ai/sandbox-runtime/vendor/srt-win/x64/srt-win.exe')));
});
test('development repair validates installed components without requiring a release backup', async () => {
  const calls = [];
  await repairWindowsSandboxComponents({
    packaged: false,
    restore: () => calls.push('restore'),
    getHelper: () => calls.push('helper'),
    loadRuntime: async () => calls.push('runtime'),
  });
  assert.deepEqual(calls, ['helper', 'runtime']);
});
test('packaged repair restores its backup before validating components', async () => {
  const calls = [];
  await repairWindowsSandboxComponents({
    restore: () => calls.push('restore'),
    getHelper: () => calls.push('helper'),
    loadRuntime: async () => calls.push('runtime'),
  });
  assert.deepEqual(calls, ['restore', 'helper', 'runtime']);
});
