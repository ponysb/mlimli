import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import clientEnvironment from '../core/client-env.cjs';
import runtime from '../electron/runtime.cjs';
import { exportClient } from '../scripts/export-client.mjs';
import { bundleCompatibility } from '../scripts/package-win.mjs';

function fixture(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-env-test-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'runtime');
  const data = path.join(directory, 'user-data');
  fs.mkdirSync(root);
  fs.mkdirSync(data);
  return { directory, root, data };
}

test('source .env uses dotenv quoting and comments without overriding process settings', context => {
  const { root } = fixture(context);
  fs.writeFileSync(path.join(root, '.env'), '\uFEFFMLI_ACCOUNT_SERVER_URL="https://example.com" # public\nMLI_ACCOUNT_ENABLED=true\nMLI_AGENT_PORT=3100\nMLI_ACCOUNT_APP_SECRET="local-only"\n');
  const env = { MLI_AGENT_PORT: '0' };
  clientEnvironment.loadClientEnvironment({ runtimeRoot: root, env });
  assert.equal(env.MLI_ACCOUNT_SERVER_URL, 'https://example.com');
  assert.equal(env.MLI_ACCOUNT_ENABLED, 'true');
  assert.equal(env.MLI_AGENT_PORT, '0');
  assert.equal(env.MLI_ACCOUNT_APP_SECRET, 'local-only');
});

test('process settings and user .env take precedence over source and packaged defaults', context => {
  const { root, data } = fixture(context);
  fs.writeFileSync(path.join(root, '.env'), 'MLI_ACCOUNT_SERVER_URL=https://source.example.com\nMLI_ACCOUNT_ENABLED=true\n');
  fs.writeFileSync(path.join(root, 'client-defaults.env'), 'MLI_ACCOUNT_SERVER_URL=https://default.example.com\nMLI_ACCOUNT_ENABLED=true\nMLI_ACCOUNT_APP_SECRET=must-not-load\n');
  fs.writeFileSync(path.join(data, '.env'), 'MLI_ACCOUNT_SERVER_URL=https://user.example.com\nMLI_ACCOUNT_ENABLED=true\nMLI_AGENT_DATA_DIR=must-not-load\nMLI_CLIENT_PACKAGED=0\nMLI_ACCOUNT_SESSION_FILE=must-not-load\n');
  const env = { MLI_ACCOUNT_ENABLED: 'false' };
  clientEnvironment.loadClientEnvironment({ runtimeRoot: root, dataRoot: data, packaged: true, env });
  assert.deepEqual(env, { MLI_ACCOUNT_ENABLED: 'false', MLI_ACCOUNT_SERVER_URL: 'https://user.example.com' });
  fs.unlinkSync(path.join(data, '.env'));
  const defaults = {};
  clientEnvironment.loadClientEnvironment({ runtimeRoot: root, dataRoot: data, packaged: true, env: defaults });
  assert.deepEqual(defaults, { MLI_ACCOUNT_SERVER_URL: 'https://default.example.com', MLI_ACCOUNT_ENABLED: 'true' });
});

test('packaging reads only public keys, validates addresses, and never carries secrets', context => {
  const { root } = fixture(context);
  const file = path.join(root, '.env');
  fs.writeFileSync(file, 'MLI_ACCOUNT_SERVER_URL="https://example.com/"\nMLI_ACCOUNT_ENABLED=YES\nMLI_AGENT_PORT=3000\nMLI_ACCOUNT_APP_SECRET=private-secret\nJWT_SECRET=jwt-secret\nDB_PASSWORD=db-secret\nMLI_API_KEY=provider-secret\n');
  assert.equal(clientEnvironment.publicClientEnvironment(root), 'MLI_ACCOUNT_SERVER_URL=https://example.com\nMLI_ACCOUNT_ENABLED=true\nMLI_AGENT_PORT=3000\n');
  for (const url of ['invalid', 'file:///private', 'https://user:password@example.com', 'https://example.com?token=secret', 'https://example.com#secret']) {
    fs.writeFileSync(file, `MLI_ACCOUNT_SERVER_URL="${url}"\n`);
    assert.throws(() => clientEnvironment.publicClientEnvironment(root), /地址|打包/);
  }
  for (const entry of ['MLI_ACCOUNT_ENABLED=invalid', 'MLI_AGENT_PORT=65536', 'MLI_AGENT_PORT=-1']) {
    fs.writeFileSync(file, entry);
    assert.throws(() => clientEnvironment.publicClientEnvironment(root));
  }
  fs.unlinkSync(file);
  assert.equal(clientEnvironment.publicClientEnvironment(root), '\n');
  assert.doesNotThrow(() => clientEnvironment.loadClientEnvironment({ runtimeRoot: root, env: {} }));
});

test('isolated source desktop loads root .env and packaged runtime loads public defaults without node_modules', async context => {
  const { directory, root, data } = fixture(context);
  exportClient({ output: root });
  const stage = { appDirectory: path.join(directory, 'app'), runtimeDirectory: root };
  fs.mkdirSync(path.join(stage.appDirectory, 'electron'), { recursive: true });
  await bundleCompatibility(stage);
  fs.writeFileSync(path.join(root, '.env'), 'MLI_ACCOUNT_SERVER_URL=http://127.0.0.1:1/source\nMLI_ACCOUNT_ENABLED=false\nMLI_AGENT_PORT=3300\n');
  fs.writeFileSync(path.join(root, 'client-defaults.env'), 'MLI_ACCOUNT_SERVER_URL=http://127.0.0.1:1/packaged\nMLI_ACCOUNT_ENABLED=false\n');
  for (const packaged of [false, true]) {
    const childRuntime = runtime.startRuntime({ executable: process.execPath, runtimeRoot: root, dataRoot: data, packaged, environment: {
      MLI_ACCOUNT_SERVER_URL: undefined, MLI_ACCOUNT_ENABLED: undefined, MLI_ACCOUNT_APP_SECRET: '',
    } });
    context.after(() => { if (childRuntime.child.exitCode === null) childRuntime.child.kill(); });
    try {
      const address = await childRuntime.ready;
      const info = await (await fetch(`${address.url}/api/info`)).json();
      assert.equal(info.account.enabled, false);
      assert.equal(info.account.baseUrl, `http://127.0.0.1:1/${packaged ? 'packaged' : 'source'}`);
      assert.equal(info.provider.protocol, 'mock');
      assert.notEqual(new URL(address.url).port, '3300');
      assert.equal(info.workspace, path.join(data, 'workspace'));
    } finally {
      if (childRuntime.child.exitCode === null) {
        const exited = once(childRuntime.child, 'exit');
        childRuntime.child.kill();
        await exited;
      }
    }
  }
  runtime.prepareData(root, root);
  fs.writeFileSync(path.join(root, '.env'), 'MLI_ACCOUNT_SERVER_URL=http://127.0.0.1:1/web\nMLI_ACCOUNT_ENABLED=false\nMLI_AGENT_PORT=0\n');
  const environment = { ...process.env, MLI_AGENT_DATA_DIR: root };
  for (const key of ['MLI_ACCOUNT_SERVER_URL', 'MLI_ACCOUNT_ENABLED', 'MLI_AGENT_PORT', 'MLI_CLIENT_PACKAGED', 'MLI_ACCOUNT_APP_SECRET']) delete environment[key];
  const child = spawn(process.execPath, [path.join(root, 'server.mjs')], { cwd: directory, windowsHide: true, env: environment, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  context.after(() => { if (child.exitCode === null) child.kill(); });
  let errorOutput = '';
  child.stderr.on('data', value => { errorOutput += value; });
  child.stdout.resume();
  try {
    const address = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('源码 Web 启动超时')), 15000);
      child.once('message', value => { clearTimeout(timer); resolve(value); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error(errorOutput || '源码 Web 提前退出')); });
    });
    const info = await (await fetch(`http://127.0.0.1:${address.port}/api/info`)).json();
    assert.equal(info.account.baseUrl, 'http://127.0.0.1:1/web');
    assert.equal(info.account.enabled, false);
    assert.equal(info.workspace, path.join(root, 'workspace'));
  } finally {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
});
