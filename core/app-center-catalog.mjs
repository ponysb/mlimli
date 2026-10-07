import { accountServerUrl, publicAccountStatus } from './account.mjs';

export function createCatalogSync({ fetcher = fetch, now = Date.now } = {}) {
  let cached, pending;
  return async (center, { force = false, baseUrl = accountServerUrl(), enabled = publicAccountStatus().enabled } = {}) => {
    if (!enabled) return {};
    if (pending?.baseUrl === baseUrl) return pending.promise;
    if (!force && cached?.baseUrl === baseUrl && cached.expires > now()) { if (cached.items) center.syncCatalog(cached.items); return cached.status; }
    const promise = (async () => {
      try {
        const response = await fetcher(baseUrl + '/api/v2/apps', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
        if (!response.ok) throw new Error('平台应用目录暂时不可用');
        const body = await response.json();
        if (body.success === false || !Array.isArray(body.data?.items)) throw new Error('平台应用目录格式无效');
        center.syncCatalog(body.data.items);
        const status = { catalogUpdatedAt: now(), catalogError: '' };
        cached = { baseUrl, items: body.data.items, status, expires: now() + 60000 }; return status;
      } catch {
        const status = { catalogError: '平台应用暂时无法更新，已保留本机应用。', catalogUpdatedAt: cached?.baseUrl === baseUrl ? cached.status.catalogUpdatedAt : null };
        cached = { baseUrl, status, expires: now() + 15000 }; return status;
      }
    })();
    pending = { baseUrl, promise };
    try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
  };
}
export const refreshAppCatalog = createCatalogSync();
