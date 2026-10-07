import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('real Electron application browser waits for login, resumes actions, isolates remote pages and clears persistent sessions', { skip: process.platform !== 'win32', timeout: 100000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-app-browser-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const engines = [path.resolve('node_modules/electron/dist/electron.exe'), path.resolve('node_modules/.cache/electron-22.3.27-win32-ia32/electron.exe')];
  for (const [index, executable] of engines.entries()) {
    if (!fs.existsSync(executable)) { t.diagnostic('未安装可选 Electron 引擎'); continue; }
    const root = path.join(directory, String(index)); fs.mkdirSync(root);
    fs.copyFileSync('test/fixtures/app-center-smoke.cjs', path.join(root, 'main.cjs'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: `mli-app-smoke-${index}`, main: 'main.cjs' }));
    const report = path.join(root, 'result.json');
    const env = { ...process.env, MLI_APP_SMOKE_ROOT: path.resolve('package.json'), MLI_APP_SMOKE_REPORT: report, MLI_APP_SMOKE_NODE: process.execPath };
    if (index) delete env.MLI_APP_CENTER_SCREENSHOT;
    delete env.ELECTRON_RUN_AS_NODE;
    try { await promisify(execFile)(executable, [root], { env, windowsHide: true, timeout: 50000 }); }
    catch (error) { throw new Error(fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : error.message + '\n' + error.stderr); }
    const result = JSON.parse(fs.readFileSync(report, 'utf8'));
    for (const name of ['loginWait', 'resumed', 'isolation', 'snapshot', 'action', 'persistence', 'revoked']) assert.equal(result[name], true, name);
    t.diagnostic(`Electron ${result.electron}: 登录等待、继续操作、隔离、登录持久化和撤销通过`);
  }
});
