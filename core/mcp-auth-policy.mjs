// Transport is not authentication. Explicit configuration wins; 401 challenges
// and OAuth metadata supply evidence for auto mode. Never guess OAuth from HTTP alone.
const observations = new Map();
const identity = s => s.url || `stdio:${s.name}`;
export function observeMcpAuthentication(server, evidence) { observations.set(identity(server), evidence); }
export function mcpAuthentication(server) {
  const explicit = server.auth?.type || 'auto';
  const evidence = observations.get(identity(server)) || {};
  const result = (type, label, action, detail, extra = {}) => ({ type, label, action, detail, ...extra });
  if (!server.url) return result('local', '本地进程凭据', 'configure', '凭据通过环境变量或服务自己的登录命令提供。');
  if (explicit === 'none') return result('none', '无需认证', 'connect', '直接连接服务。');
  if (['device_code', 'client_credentials', 'jwt_bearer'].includes(explicit)) return result(explicit, {device_code:'设备码认证',client_credentials:'机器身份认证',jwt_bearer:'JWT 身份认证'}[explicit], 'unsupported', '当前客户端尚未实现此认证流程，请使用服务支持的其他方式。');
  if (explicit === 'bearer' || explicit === 'auto' && (server.bearer_token_env_var || Object.keys(server.headers || {}).some(k => k.toLowerCase() === 'authorization'))) return result('bearer', '访问令牌', 'configure', '填写访问令牌或 Token 环境变量；不会自动启动浏览器。');
  if (explicit === 'header' || Object.keys(server.headers || {}).length && explicit === 'auto') return result('header', '自定义请求头', 'configure', '按服务要求配置 API Key 或认证请求头。');
  if (new URL(server.url).hostname === 'modao.cc') return result('header', '自定义请求头', 'configure', '此服务使用 modao-token 请求头。');
  const oauth = typeof server.oauth === 'object' ? server.oauth : {};
  if (oauth.client_id && /[<>]/.test(oauth.client_id)) return result('oauth', 'OAuth 配置不完整', 'configure', '插件提供的是占位符，需填写服务方分配的客户端配置。');
  if (oauth.client_id) return result('oauth', 'OAuth · 预注册客户端', 'authorize', '使用已配置的客户端发起 PKCE 浏览器授权。', { registration: 'preregistered' });
  if (new URL(server.url).hostname === 'api.githubcopilot.com') return result('oauth', 'OAuth · 需预注册', 'configure', 'GitHub 不支持动态注册；需要 OAuth App 或访问令牌。');
  if (server.oauth === false) return result('manual', '手动配置认证', 'configure', '已关闭自动 OAuth，按服务要求配置凭据。');
  const metadata = evidence.metadata;
  if (metadata) {
    if (metadata.client_id_metadata_document_supported && oauth.client_metadata_url) return result('oauth', 'OAuth · CIMD', 'authorize', '使用已发布的客户端元数据文档授权。', { registration: 'cimd' });
    if (metadata.registration_endpoint) return result('oauth', 'OAuth · 动态注册', 'authorize', '服务声明支持动态注册，再打开授权页面。', { registration: 'dcr' });
    return result('oauth', 'OAuth · 需预注册', 'configure', '服务未声明可用的自动注册方式，请配置客户端 ID。');
  }
  if (evidence.public) return result('none', '无需认证', 'connect', '服务已接受无凭据连接。');
  if (explicit === 'oauth' || server.oauth === true || evidence.oauth) return result('oauth', 'OAuth · 待发现', 'authorize', '先发现授权服务器与注册能力，再决定是否打开浏览器。');
  if (evidence.unauthorized) return result('manual', '需要认证配置', 'configure', '服务拒绝了请求，但没有提供 OAuth challenge；不能自动判断令牌或其他认证方式。');
  return result('auto', '认证方式待检测', 'detect', '先连接检测，再根据响应选择认证方式。');
}
