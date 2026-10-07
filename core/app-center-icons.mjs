import https from 'node:https';
import dns from 'node:dns/promises';
import policy from './app-center-policy.cjs';

// Resolve once and pin the connection to a validated public address. Redirects
// are checked again; no logged-in browser session or external icon service is used.
export async function publicRequest(value, redirects = 0) {
  const url = policy.appUrl(value);
  const addresses = await dns.lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(item => policy.privateHost(item.address))) throw new Error('网站解析到内网');
  const address = addresses[0];
  const response = await new Promise((resolve, reject) => {
    const req = https.get(url, { agent: false, autoSelectFamily: false, family: address.family,
      lookup: (_host, options, done) => options.all ? done(null, [address]) : done(null, address.address, address.family),
      headers: { accept: 'text/html,image/*;q=0.9', 'user-agent': 'Moli-App-Icons/0.3', 'accept-encoding': 'identity' } }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 512 * 1024) req.destroy(new Error('网站图标响应过大')); else chunks.push(chunk); });
      res.on('error', reject); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks), url: url.href }));
    });
    const deadline = setTimeout(() => req.destroy(new Error('网站图标请求超时')), 2500);
    req.on('error', reject); req.on('close', () => clearTimeout(deadline));
  });
  if (response.status >= 300 && response.status < 400 && response.headers.location && redirects < 3) return publicRequest(new URL(response.headers.location, url).href, redirects + 1);
  if (response.status !== 200) throw new Error('网站图标不可用');
  return response;
}

export function iconCandidates(html, base) {
  const candidates = [];
  const attr = (tag, name) => {
    const match = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag);
    return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').replace(/&amp;/gi, '&');
  };
  for (const tag of html.slice(0, 128000).match(/<link\b[^>]*>/gi) || []) {
    if (!/(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(attr(tag, 'rel'))) continue;
    try { const url = policy.appUrl(new URL(attr(tag, 'href'), base).href); candidates.push(url.href); } catch {}
  }
  return [...new Set([...candidates.slice(0, 4), new URL('/favicon.ico', base).href])];
}
export function rasterType(data) {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(data.toString('ascii', 0, 6))) return 'image/gif';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (data.length > 6 && data.readUInt32LE(0) === 65536) return 'image/x-icon';
  return null;
}
export function createIconLoader({ request = publicRequest, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  return async value => {
    const url = policy.publicPageUrl(policy.appUrl(value).href), existing = cache.get(url);
    if (existing?.expires > now()) return existing.icon;
    if (pending.has(url)) return pending.get(url);
    const job = (async () => {
      let candidates = [new URL('/favicon.ico', url).href], icon = null;
      try { const page = await request(url); if (String(page.headers['content-type']).includes('text/html')) candidates = iconCandidates(page.data.toString('utf8'), page.url || url); } catch {}
      for (const candidate of candidates) {
        try { const response = await request(candidate), type = rasterType(response.data); if (type) { icon = { type, data: response.data }; break; } } catch {}
      }
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(url, { icon, expires: now() + (icon ? 86400000 : 3600000) }); return icon;
    })();
    pending.set(url, job);
    try { return await job; } finally { pending.delete(url); }
  };
}
export const loadAppIcon = createIconLoader();
