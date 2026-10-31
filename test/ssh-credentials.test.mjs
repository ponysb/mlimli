import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const { createSshCredentialVault, registerSshCredentials } = createRequire(import.meta.url)('../electron/ssh-credentials.cjs');
function fixture(t) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-vault-'));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const key = crypto.randomBytes(32);
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: text => { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(text), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]); },
    decryptString: blob => { const decipher = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12)); decipher.setAuthTag(blob.subarray(12, 28)); return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString(); },
  };
  const connection = { id: 'test-connection', host: 'server.example', port: 22, username: 'tester', authMode: 'password' };
  return { dataRoot, safeStorage, connection };
}
test('vault persists only ciphertext, binds credentials to target, survives reopening and deletes secrets', t => {
  const f = fixture(t), vault = createSshCredentialVault(f);
  vault.save(f.connection, 'secret-for-test');
  const file = path.join(f.dataRoot, '.security/ssh/credentials/test-connection.enc');
  assert.equal(fs.readFileSync(file).includes(Buffer.from('secret-for-test')), false);
  assert.equal(createSshCredentialVault(f).read(f.connection), 'secret-for-test');
  assert.equal(vault.read({ ...f.connection, host: 'other.example' }), null);
  assert.equal(vault.read({ ...f.connection, username: 'other' }), null);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.writeFileSync(file, 'corrupt');
  assert.throws(() => vault.read(f.connection), /无法解密/);
  vault.remove(f.connection.id); assert.equal(fs.existsSync(file), false);
  assert.throws(() => vault.remove('../outside'), /无效/);
});
test('vault fails closed for unavailable encryption and Linux basic_text', t => {
  const f = fixture(t);
  for (const storage of [{ ...f.safeStorage, isEncryptionAvailable: () => false }, { ...f.safeStorage, getSelectedStorageBackend: () => 'basic_text' }]) {
    const vault = createSshCredentialVault({ ...f, safeStorage: storage });
    assert.equal(vault.available(), false);
    assert.throws(() => vault.save(f.connection, 'secret'), /安全存储不可用/);
  }
});
test('credential IPC restricts sender, never returns passwords, connects internally and cleans up on deletion', async t => {
  const f = fixture(t), handlers = new Map(), calls = [];
  const contents = { mainFrame: {} }; contents.mainFrame.url = 'http://127.0.0.1:1234/';
  const event = { sender: contents, senderFrame: contents.mainFrame };
  let rejectAuth = false;
  registerSshCredentials({ ...f, ipcMain: { handle: (name, action) => handlers.set(name, action) }, getWindow: () => ({ isDestroyed: () => false, webContents: contents }), getServerUrl: () => 'http://127.0.0.1:1234', request: async (url, options) => {
    calls.push({ url, ...options });
    return { ok: !(rejectAuth && url.endsWith('/connect')), json: async () => url.endsWith('/connect') ? { error: '认证失败' } : { connections: [f.connection], connection: f.connection } };
  } });
  const invoke = (name, data) => handlers.get(name)(event, data);
  await assert.rejects(handlers.get('ssh-credential-status')({ sender: {}, senderFrame: contents.mainFrame }), /仅允许/);
  await invoke('ssh-save-connection', { ...f.connection, password: 'saved-secret', rememberPassword: true });
  assert.equal(calls[0].body.includes('saved-secret'), false);
  const status = await invoke('ssh-credential-status');
  assert.deepEqual(status, { available: true, savedIds: [f.connection.id] });
  assert.equal(JSON.stringify(status).includes('saved-secret'), false);
  const result = await invoke('ssh-connect', { id: f.connection.id });
  assert.equal(result.connected, true);
  assert.equal(JSON.parse(calls.findLast(c => c.url.endsWith('/connect')).body).password, 'saved-secret');
  rejectAuth = true;
  await assert.rejects(invoke('ssh-connect', { id: f.connection.id, password: 'bad-password', rememberPassword: true }), /认证失败/);
  assert.equal(createSshCredentialVault(f).read(f.connection), 'saved-secret');
  rejectAuth = false;
  await invoke('ssh-delete-connection', f.connection.id);
  assert.equal(createSshCredentialVault(f).has(f.connection), false);
});
