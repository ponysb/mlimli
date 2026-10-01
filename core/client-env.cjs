const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const PUBLIC_KEYS = ['MLI_ACCOUNT_SERVER_URL', 'MLI_ACCOUNT_ENABLED', 'MLI_AGENT_PORT'];

function readEnvironment(file) {
  try { return dotenv.parse(fs.readFileSync(file)); }
  catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`无法读取客户端环境配置：${file}（${error.code || '读取失败'}）`);
  }
}

function publicClientEnvironment(root) {
  const values = readEnvironment(path.join(root, '.env'));
  const selected = {};
  for (const key of PUBLIC_KEYS) {
    if (values[key] == null || !values[key].trim()) continue;
    selected[key] = values[key].trim();
  }
  if (selected.MLI_ACCOUNT_SERVER_URL) {
    let url;
    try { url = new URL(selected.MLI_ACCOUNT_SERVER_URL); }
    catch { throw new Error('MLI_ACCOUNT_SERVER_URL 必须是有效的 HTTP/HTTPS 地址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('打包后台地址只能使用 HTTP/HTTPS，不能包含账号密码、查询参数或片段');
    }
    selected.MLI_ACCOUNT_SERVER_URL = url.href.replace(/\/$/, '');
  }
  if (selected.MLI_ACCOUNT_ENABLED) {
    const flag = selected.MLI_ACCOUNT_ENABLED.toLowerCase();
    if (!['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(flag)) throw new Error('MLI_ACCOUNT_ENABLED 必须是 true 或 false');
    selected.MLI_ACCOUNT_ENABLED = ['true', '1', 'yes', 'on'].includes(flag) ? 'true' : 'false';
  }
  if (selected.MLI_AGENT_PORT && (!/^\d+$/.test(selected.MLI_AGENT_PORT) || Number(selected.MLI_AGENT_PORT) > 65535)) {
    throw new Error('MLI_AGENT_PORT 必须是 0 到 65535 的整数');
  }
  return Object.entries(selected).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
}

function loadClientEnvironment({ runtimeRoot, dataRoot = runtimeRoot, packaged = false, env = process.env }) {
  const files = [];
  if (path.resolve(dataRoot) !== path.resolve(runtimeRoot)) files.push({ file: path.join(dataRoot, '.env'), publicOnly: false });
  if (!packaged) files.push({ file: path.join(runtimeRoot, '.env'), publicOnly: false });
  files.push({ file: path.join(runtimeRoot, 'client-defaults.env'), publicOnly: true });
  for (const { file, publicOnly } of files) {
    for (const [key, value] of Object.entries(readEnvironment(file))) {
      if (publicOnly && !PUBLIC_KEYS.includes(key)) continue;
      if (['MLI_AGENT_DATA_DIR', 'MLI_CLIENT_PACKAGED', 'MLI_ACCOUNT_SESSION_FILE'].includes(key)) continue;
      if (env[key] === undefined) env[key] = value;
    }
  }
}

module.exports = { loadClientEnvironment, publicClientEnvironment };
