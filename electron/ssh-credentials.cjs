const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createSshCredentialVault({ safeStorage, dataRoot }) {
  const directory = path.join(dataRoot, '.security', 'ssh', 'credentials');
  const available = () => safeStorage.isEncryptionAvailable() && (!safeStorage.getSelectedStorageBackend || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  const file = id => { if (!/^[\w-]{1,80}$/.test(id)) throw new Error('无效 SSH 连接'); return path.join(directory, `${id}.enc`); };
  const target = c => JSON.stringify([c.host, c.port, c.username, c.authMode]);
  function remove(id) { fs.rmSync(file(id), { force: true }); }
  function read(connection) {
    if (!fs.existsSync(file(connection.id))) return null;
    if (!available()) throw new Error('系统安全存储不可用，不能读取已保存密码');
    try {
      const value = JSON.parse(safeStorage.decryptString(fs.readFileSync(file(connection.id))));
      return value.target === target(connection) ? value.password : null;
    } catch { throw new Error('无法解密 SSH 密码，请重新输入并保存'); }
  }
  function save(connection, password) {
    if (!available()) throw new Error('系统安全存储不可用，密码未保存');
    if (connection.authMode !== 'password' || typeof password !== 'string' || !password || password.length > 16384) throw new Error('请输入有效的服务器登录密码');
    const encrypted = safeStorage.encryptString(JSON.stringify({ target: target(connection), password }));
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const temporary = `${file(connection.id)}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file(connection.id)); }
    finally { fs.rmSync(temporary, { force: true }); }
  }
  return { available, save, read, remove, has: c => available() && Boolean(read(c)) };
}

function registerSshCredentials({ ipcMain, safeStorage, dataRoot, getWindow, getServerUrl, request = fetch }) {
  const vault = createSshCredentialVault({ safeStorage, dataRoot });
  async function api(route, body, method) {
    const response = await request(`${getServerUrl()}/api/ssh/connections${route}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'SSH 操作失败');
    return result;
  }
  function handle(channel, action) {
    ipcMain.handle(channel, async (event, ...args) => {
      const win = getWindow();
      if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || new URL(event.senderFrame.url).origin !== getServerUrl()) throw new Error('SSH 凭据仅允许工作台主窗口使用');
      return action(...args);
    });
  }
  handle('ssh-credential-status', async () => {
    const { connections } = await api('');
    return { available: vault.available(), savedIds: connections.filter(c => { try { return vault.has(c); } catch { return false; } }).map(c => c.id) };
  });
  handle('ssh-save-connection', async ({ password, rememberPassword, ...configuration }) => {
    if (rememberPassword && !vault.available()) throw new Error('系统安全存储不可用，密码未保存');
    const result = await api('', configuration);
    if (rememberPassword && password) vault.save(result.connection, password);
    else if (rememberPassword === false || result.connection.authMode !== 'password') vault.remove(result.connection.id);
    return result.connection;
  });
  handle('ssh-connect', async ({ id, password, passphrase, rememberPassword }) => {
    if (!/^[\w-]{1,80}$/.test(id)) throw new Error('无效 SSH 连接');
    const { connections } = await api('');
    const connection = connections.find(c => c.id === id);
    if (!connection) throw new Error('SSH 连接不存在');
    if (connection.authMode === 'password') {
      password = password || vault.read(connection);
      if (rememberPassword && !vault.available()) throw new Error('系统安全存储不可用，密码未保存');
    }
    await api(`/${id}/connect`, { password, passphrase });
    if (connection.authMode === 'password' && rememberPassword && password) vault.save(connection, password);
    if (rememberPassword === false) vault.remove(id);
    return { id, connected: true };
  });
  handle('ssh-delete-connection', async id => {
    if (!/^[\w-]{1,80}$/.test(id)) throw new Error('无效 SSH 连接');
    const result = await api(`/${id}`, undefined, 'DELETE'); vault.remove(id); return result;
  });
}
module.exports = { createSshCredentialVault, registerSshCredentials };
