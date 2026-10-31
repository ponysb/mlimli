const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalApiRequest(req) {
  const host = String(req.headers?.host || '');
  const remoteAddress = String(req.socket?.remoteAddress || '');
  const forwarded = req.headers?.forwarded || req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'];
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) || forwarded || !LOOPBACK_ADDRESSES.has(remoteAddress)) return false;
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers?.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { return false; }
    if (origin.host !== host || !['http:', 'https:'].includes(origin.protocol)) return false;
  }
  return true;
}
