import path from 'node:path';
import { getConfig, saveConfigFile } from './llm.mjs';
import { DATA_ROOT } from './paths.mjs';
import { configuredMcp } from './mcp-settings.mjs';

// Credentials travel only through the private UI response and local configuration.
export async function prepareMcpAuthorization(server, options = {}) {
  const isModao = server.url && new URL(server.url).hostname === 'modao.cc' && new URL(server.url).pathname === '/agent-py/ai/mcp';
  if (!isModao || server.headers?.['modao-token']) return server;
  if (!options.session?.id) throw new Error('墨刀需要个人空间令牌，请在 MCP 设置中填写后再连接');
  const { uiRequest } = await import('./plugins.mjs');
  const token = await uiRequest(options.session, 'secret', {
    title: '连接墨刀', text: '个人空间令牌',
    detail: '在墨刀「头像 → 令牌设置」创建令牌。保存到本机后将继续当前调用，令牌不会进入聊天记录。',
    placeholder: '粘贴墨刀个人空间令牌',
  }, 180000, options.signal);
  options.signal?.throwIfAborted();
  if (typeof token !== 'string' || !token.trim()) throw new Error('已取消墨刀授权');
  const cfg = getConfig(), previous = cfg.mcp;
  const servers = configuredMcp(cfg).map(s => ({ ...s }));
  const current = servers.find(s => s.name === server.name);
  if (!current || current.url !== server.url) throw new Error('服务配置已变更，请重新连接');
  current.headers = { ...current.headers, 'modao-token': token.trim() };
  cfg.mcp = { ...cfg.mcp, servers };
  try { saveConfigFile(path.join(DATA_ROOT, 'config.json')); }
  catch { cfg.mcp = previous; throw new Error('令牌保存失败，请在设置中重试'); }
  return current;
}
