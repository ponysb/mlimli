const net = require('node:net');
function privateHost(host) {
  host = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') && !net.isIP(host)) return true;
  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    // 198.18.0.0/15 is used by the local transparent network proxy for public
    // domains in some desktop environments. It must not be treated as a local
    // service here; localhost, RFC1918, link-local and loopback remain blocked.
    return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127;
  }
  if (net.isIPv6(host)) return host === '::' || host === '::1' || /^(?:f[cd]|fe[89ab]|ff)/i.test(host) || host.startsWith('::ffff:') || !/^[23]/.test(host);
  return false;
}
function appUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error('请输入完整的 https:// 应用网址'); }
  if (url.protocol !== 'https:' || url.username || url.password || privateHost(url.hostname) || url.port && url.port !== '443') throw new Error('应用台仅支持公共 HTTPS 网站，不允许本机、内网、凭据网址或特殊端口');
  if (url.href.length > 3000) throw new Error('应用网址过长');
  return url;
}
function loginPage(value, paths = ['/login', '/signin', '/sign-in', '/auth', '/oauth', '/sso']) {
  const url = new URL(value);
  return paths.some(p => url.pathname.toLowerCase() === p.toLowerCase() || url.pathname.toLowerCase().startsWith(p.toLowerCase().replace(/\/$/, '') + '/'));
}
function publicPageUrl(value) {
  const url = new URL(value); return url.origin + url.pathname; // No OAuth codes/tokens in records, SSE or model output.
}
module.exports = { appUrl, privateHost, loginPage, publicPageUrl };
