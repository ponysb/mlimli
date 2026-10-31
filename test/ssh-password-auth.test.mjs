import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ssh2 from 'ssh2';
const { Server, utils } = ssh2;

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-password-auth-'));
process.env.MLI_AGENT_DATA_DIR = directory;
const store = await import('../core/ssh-connection-store.mjs');
const runtime = await import('../core/ssh-runtime.mjs');

test('password authentication rejects wrong credentials, succeeds with the supplied password, and never persists secrets', async context => {
  const key = utils.generateKeyPairSync('ed25519');
  const server = new Server({ hostKeys: [key.private] }, client => {
    client.on('error', () => {});
    client.on('authentication', auth => {
      if (auth.method === 'password' && auth.username === 'tester' && auth.password === 'temporary-test-password') auth.accept();
      else auth.reject(['password']);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => { runtime.shutdownSshRuntime(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true, force: true }); });
  const connection = store.saveSshConnection({ name: 'Password test', host: '127.0.0.1', port: server.address().port, username: 'tester', authMode: 'password', password: 'must-not-be-saved', passphrase: 'also-not-saved' });
  const observed = await runtime.inspectSshHost(connection.id);
  store.confirmSshHostKey(connection.id, observed.fingerprint, observed.fingerprint);
  await assert.rejects(runtime.connectSsh(connection.id), /请输入服务器登录密码/);
  await assert.rejects(runtime.connectSsh(connection.id, { password: 'wrong-test-password' }), error => {
    assert.match(error.message, /SSH 认证失败.*登录密码未被服务器接受/);
    assert.doesNotMatch(error.message, /wrong-test-password/);
    return true;
  });
  assert.deepEqual(await runtime.connectSsh(connection.id, { password: 'temporary-test-password' }), { id: connection.id, connected: true });
  assert.doesNotMatch(fs.readFileSync(store.sshConnectionStorePath(), 'utf8'), /must-not-be-saved|also-not-saved|temporary-test-password|"password"\s*:/);
  assert.equal(runtime.closeSshConnection(connection.id), true);
});

test('authentication failures explain the selected credential source', () => {
  const error = new Error('All configured authentication methods failed');
  assert.match(runtime.sshConnectionError('agent', error), /ssh-add -l.*登录密码/);
  assert.match(runtime.sshConnectionError('key', error), /authorized_keys/);
  assert.match(runtime.sshConnectionError('password', error), /用户名和密码/);
});
