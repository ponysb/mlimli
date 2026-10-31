import { mcpAuthentication } from './mcp-auth-policy.mjs';
import { mcpServers } from './mcp.mjs';

export function configuredMcp(config) {
  const value = config.mcp?.servers ?? config.mcpServers ?? [];
  return Array.isArray(value) ? value : Object.entries(value).map(([name, server]) => ({ ...server, name }));
}
export function publicMcpSettings(config) {
  const expose = ({ env, headers, oauth, ...server }) => ({ ...server, authentication: mcpAuthentication({ ...server, headers, oauth }), ...(oauth !== undefined ? { oauth: typeof oauth === 'object' ? Object.fromEntries(Object.entries(oauth).filter(([k]) => k !== 'client_secret')) : oauth } : {}), envKeys: Object.keys(env || {}), headerKeys: Object.keys(headers || {}) });
  return { servers: configuredMcp(config).map(expose), contributed: mcpServers(config).filter(s => s.owner).map(expose) };
}
function validate(server) {
  if (!server || typeof server !== 'object' || !/^[\w.-]{1,80}$/.test(server.name || '')) throw new Error('服务名称须为 1–80 位字母、数字、下划线、点或短横线');
  if (server.enabled !== undefined && typeof server.enabled !== 'boolean') throw new Error('无效启用状态');
  if (server.type !== undefined && !['stdio', 'http', 'sse'].includes(server.type)) throw new Error('无效传输类型');
  if (server.url) {
    const url = new URL(server.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务地址须为 HTTP/HTTPS');
    if (url.username || url.password) throw new Error('请通过请求头配置认证');
    if (server.command) throw new Error('远程地址与本地命令不能同时设置');
  } else if (typeof server.command !== 'string' || !server.command.trim()) throw new Error('请填写本地可执行文件或远程地址');
  if ((server.type === 'http' || server.type === 'sse') && !server.url) throw new Error('远程服务需要 URL');
  if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some(v => typeof v !== 'string'))) throw new Error('启动参数须为字符串数组');
  for (const key of ['env', 'headers']) if (server[key] !== undefined && (!server[key] || Array.isArray(server[key]) || typeof server[key] !== 'object' || Object.values(server[key]).some(v => typeof v !== 'string'))) throw new Error(`${key} 须为字符串对象`);
  for (const key of ['cwd', 'bearer_token_env_var']) if (server[key] !== undefined && typeof server[key] !== 'string') throw new Error(`${key} 须为字符串`);
  if (server.timeout !== undefined && (!Number.isInteger(server.timeout) || server.timeout < 100 || server.timeout > 300000)) throw new Error('超时须为 100–300000 毫秒');
  if (server.oauth !== undefined && typeof server.oauth !== 'boolean') {
    if (!server.oauth || Array.isArray(server.oauth) || typeof server.oauth !== 'object') throw new Error('oauth 须为布尔值或配置对象');
    if (Object.keys(server.oauth).some(k => !['client_id', 'client_secret_env', 'scope', 'client_metadata_url'].includes(k)) || Object.values(server.oauth).some(v => typeof v !== 'string')) throw new Error('OAuth 配置支持 client_id、client_secret_env、scope 字符串');
  }
  if (server.auth !== undefined && (!server.auth || !['auto','none','bearer','header','oauth','device_code','client_credentials','jwt_bearer'].includes(server.auth.type))) throw new Error('无效认证方式');
  return Object.fromEntries(['name', 'enabled', 'type', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'bearer_token_env_var', 'timeout', 'oauth', 'auth'].filter(k => server[k] !== undefined).map(k => [k, server[k]]));
}
export function updateMcpSettings(config, body) {
  if (body.action === 'plugin-auth') {
    const server = mcpServers(config).find(s => s.owner === body.owner && s.name === body.name);
    if (!server) throw new Error('插件服务不存在');
    const previous = config.mcp?.pluginOverrides?.[body.owner]?.[body.name] || {};
    const patch = {};
    for (const key of ['headers', 'oauth', 'bearer_token_env_var', 'auth']) if (body[key] !== undefined) patch[key] = body[key];
    validate({ ...server, ...patch });
    return { ...config.mcp, pluginOverrides: { ...config.mcp?.pluginOverrides, [body.owner]: { ...config.mcp?.pluginOverrides?.[body.owner], [body.name]: { ...previous, ...patch } } } };
  }
  let servers = configuredMcp(config).map(s => ({ ...s }));
  if (body.action === 'save') {
    const previous = servers.find(s => s.name === body.server?.name);
    if (body.modaoToken !== undefined && (body.server?.name !== 'modao' || typeof body.modaoToken !== 'string' || !body.modaoToken.trim())) throw new Error('无效墨刀令牌');
    const server = validate({ ...body.server, env: body.server?.env ?? previous?.env, headers: body.modaoToken ? { ...(body.server?.headers ?? previous?.headers), 'modao-token': body.modaoToken.trim() } : body.server?.headers ?? previous?.headers });
    servers = [...servers.filter(s => s.name !== server.name), server];
  } else if (body.action === 'delete') {
    if (!servers.some(s => s.name === body.name)) throw new Error('服务不存在');
    servers = servers.filter(s => s.name !== body.name);
  } else if (body.action === 'import') {
    if (!body.config?.mcpServers || Array.isArray(body.config.mcpServers) || typeof body.config.mcpServers !== 'object') throw new Error('请提供包含 mcpServers 对象的 JSON');
    const imported = Object.entries(body.config.mcpServers).map(([name, s]) => validate({ ...s, name }));
    if (!imported.length) throw new Error('导入配置为空');
    for (const server of imported) {
      if (servers.some(s => s.name === server.name)) throw new Error(`服务 ${server.name} 已存在，请通过表单编辑或修改导入名称`);
      servers.push(server);
    }
  } else throw new Error('无效操作');
  const contributed = mcpServers({});
  if (servers.some(s => contributed.some(c => c.name === s.name))) throw new Error('服务名称与插件自带 MCP 重复');
  return { ...config.mcp, servers };
}
