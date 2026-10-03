import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import clientEnvironment from '../core/client-env.cjs';

export async function waitFor(check, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error('验证超时');
}

export async function exerciseClient(url, dataRoot) {
  async function request(resource, body) {
    const response = await fetch(`${url}${resource}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
    const payload = await response.json();
    assert.ok(response.ok, `${resource}: ${response.status} ${JSON.stringify(payload)}`);
    return payload;
  }
  const info = await request('/api/info');
  assert.equal(info.provider.protocol, 'mock', '打包验证只允许使用无付费的 mock 模型');
  assert.equal(info.account.enabled, false);
  assert.equal(path.resolve(info.workspace), path.join(dataRoot, 'workspace'));
  const sessions = await request('/api/sessions');
  assert.equal(sessions.sessions.length, 0, '首次启动不能带入开发者聊天记录');
  assert.ok(info.plugins.plugins.length > 0, '内置插件必须正常加载');
  const logo = await fetch(`${url}/branding/logo.png`);
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type'), /image\/png/);
  const session = await request('/api/session', { title: 'Windows 安装包验证' });
  await request(`/api/session/${session.id}/message`, { text: '写一个 hello.txt，用于 Windows 打包验证' });
  const pending = await waitFor(async () => (await request(`/api/session/${session.id}`)).permission);
  assert.equal(pending.tool, 'write_file');
  assert.ok(!fs.existsSync(path.join(info.workspace, 'hello.txt')), '审批前不能写文件');
  await request(`/api/session/${session.id}/permission/${pending.reqId}`, { decision: 'allow' });
  const snapshot = await waitFor(async () => {
    const current = await request(`/api/session/${session.id}`);
    return !current.running && current.entries.some(entry => entry.type === 'turn_end') ? current : null;
  });
  assert.equal(snapshot.entries.findLast(entry => entry.type === 'turn_end').reason, 'done');
  assert.match(fs.readFileSync(path.join(info.workspace, 'hello.txt'), 'utf8'), /Windows 打包验证/);
  assert.ok(fs.existsSync(path.join(dataRoot, '.agent', 'workspaces.json')));
  return { sessionId: session.id, workspace: info.workspace, plugins: info.plugins.plugins.map(plugin => plugin.name), approvals: 'passed', mockFileWrite: 'passed', logo: 'passed' };
}

async function main() {
  const executable = process.argv[2];
  if (!executable || !fs.existsSync(executable)) throw new Error('用法：npm run verify:win -- "完整路径/MoliCreation.exe" [--keep-open]');
  const output = fs.mkdtempSync(path.join(path.dirname(path.resolve(executable)), 'verification-'));
  const dataRoot = path.join(output, 'user-data');
  const environment = { ...process.env, MLI_ACCOUNT_ENABLED: 'false' };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.MLI_ACCOUNT_SERVER_URL;
  delete environment.MLI_ACCOUNT_APP_SECRET;
  let currentChild;
  let currentReport;
  let currentReportFile;
  async function launch(name) {
    const reportFile = path.join(output, `${name}.json`);
    currentReportFile = reportFile;
    currentChild = spawn(path.resolve(executable), [`--mli-data-dir=${dataRoot}`, `--mli-smoke-report=${reportFile}`], { windowsHide: !process.argv.includes('--keep-open'), env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    currentChild.stdout.on('data', data => fs.appendFileSync(path.join(output, 'electron.log'), data));
    currentChild.stderr.on('data', data => fs.appendFileSync(path.join(output, 'electron.log'), data));
    let launchError;
    currentChild.on('error', error => { launchError = error; });
    currentReport = await waitFor(() => {
      if (launchError) throw launchError;
      if (currentChild.exitCode !== null) throw new Error(`桌面窗口启动失败 (${currentChild.exitCode})`);
      if (!fs.existsSync(reportFile)) return null;
      return JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    });
    assert.equal(currentReport.packaged, true);
    assert.match(currentReport.title, /魔力工作台/);
    assert.equal(currentReport.renderer, 'passed');
    if (path.basename(executable).includes('Legacy')) {
      assert.equal(currentReport.arch, 'ia32');
      assert.equal(currentReport.electron, '22.3.27');
    } else assert.equal(currentReport.arch, 'x64');
    return currentReport;
  }
  async function close() {
    const exited = once(currentChild, 'exit');
    fs.writeFileSync(`${currentReportFile}.close`, 'close', { flag: 'wx' });
    await Promise.race([exited, delay(10000).then(() => { throw new Error('桌面窗口未正常退出'); })]);
    await waitFor(() => { try { process.kill(currentReport.serverPid, 0); return false; } catch { return true; } }, 10000);
  }
  try {
    const first = await launch('first-start');
    const result = await exerciseClient(first.url, dataRoot);
    const client = path.join(path.dirname(path.resolve(executable)), 'resources', 'client');
    const bundledNode = path.join(path.dirname(path.resolve(executable)), 'resources', 'node', 'node.exe');
    const cliExecutable = fs.existsSync(bundledNode) ? bundledNode : path.resolve(executable);
    const cliEnvironment = { ...environment, ...(fs.existsSync(bundledNode) ? {} : { ELECTRON_RUN_AS_NODE: '1' }) };
    const help = await promisify(execFile)(cliExecutable, [path.join(client, 'cli', 'main.cjs'), '--help'], { env: cliEnvironment, timeout: 15000, windowsHide: true });
    assert.match(help.stdout, /mli exec/);
    if (fs.existsSync(bundledNode)) {
      const tui = path.join(client, 'cli', 'bin', 'mli-tui.exe');
      assert.ok(fs.existsSync(tui), '现代安装包必须包含独立 TUI 程序');
      const checked = await promisify(execFile)(tui, ['--self-test'], { cwd: dataRoot, timeout: 15000, windowsHide: true });
      assert.match(checked.stdout, /OpenTUI native renderer ready/);
      result.modernTui = 'passed';
    }
    const terminal = await promisify(execFile)(cliExecutable, [path.join(client, 'cli', 'main.cjs'), '--data-dir', dataRoot, '--cwd', first.dataRoot + path.sep + 'workspace', 'exec', '--auto', '--json', '写一个 hello.txt，用于终端打包验证'], { env: cliEnvironment, timeout: 20000, windowsHide: true });
    const terminalEvents = terminal.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(terminalEvents.findLast(event => event.type === 'turn_end').reason, 'done');
    assert.equal((await (await fetch(`${first.url}/api/runtime`)).json()).pid, first.serverPid);
    result.terminal = 'passed';
    result.sharedRuntime = 'passed';
    const defaults = {};
    clientEnvironment.loadClientEnvironment({ runtimeRoot: path.join(path.dirname(path.resolve(executable)), 'resources', 'client'), packaged: true, env: defaults });
    const firstInfo = await (await fetch(`${first.url}/api/info`)).json();
    assert.equal(firstInfo.account.baseUrl, (defaults.MLI_ACCOUNT_SERVER_URL || 'http://127.0.0.1:3086').trim().replace(/\/$/, ''), '打包应用必须读取内置公开后台地址');
    const configBefore = fs.readFileSync(path.join(dataRoot, 'config.json'), 'utf8');
    await close();
    fs.writeFileSync(path.join(dataRoot, '.env'), 'MLI_ACCOUNT_SERVER_URL=http://127.0.0.1:1/user-override\nMLI_ACCOUNT_ENABLED=false\n');
    const second = await launch('second-start');
    const secondInfo = await (await fetch(`${second.url}/api/info`)).json();
    assert.equal(secondInfo.account.baseUrl, 'http://127.0.0.1:1/user-override', '用户 .env 必须覆盖内置后台地址');
    const response = await fetch(`${second.url}/api/session/${result.sessionId}`);
    assert.equal(response.status, 200, '重新打开必须保留会话');
    assert.equal(fs.readFileSync(path.join(dataRoot, 'config.json'), 'utf8'), configBefore, '重新打开不能覆盖配置');
    assert.ok(fs.existsSync(path.join(dataRoot, 'workspace', 'hello.txt')));
    const verified = { ...result, packaged: true, renderer: first.renderer, arch: first.arch, electron: first.electron, node: first.node, chrome: first.chrome, persistence: 'passed', restart: 'passed', shutdown: 'passed', publicDefaults: 'passed', userEnvironment: 'passed', dataRoot, executable: path.resolve(executable) };
    if (process.argv.includes('--keep-open')) {
      console.log('窗口保留用于人工检查；关闭窗口后结束验证。');
      await once(currentChild, 'exit');
      await waitFor(() => { try { process.kill(second.serverPid, 0); return false; } catch { return true; } }, 10000);
    } else await close();
    fs.writeFileSync(path.join(output, 'RESULT.json'), JSON.stringify(verified, null, 2));
    console.log(`打包验证通过：${path.join(output, 'RESULT.json')}`);
  } finally {
    if (currentReport?.appPid && currentReport.appPid !== currentChild?.pid) { try { process.kill(currentReport.appPid); } catch {} }
    if (currentChild?.exitCode === null) currentChild.kill();
    if (currentReport?.serverPid) { try { process.kill(currentReport.serverPid); } catch {} }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
