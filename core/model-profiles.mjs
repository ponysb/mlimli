import fs from 'node:fs';
import path from 'node:path';
import schema from './model-profile-schema.cjs';
import { DATA_ROOT } from './paths.mjs';
import { accountServerUrl } from './account.mjs';

export function createProfileClient({ file, baseUrl, fetcher = fetch }) {
  let snapshot = { profiles: [], version: null }, source = '', checked = 0, pending;
  const validate = value => {
    if (value?.schemaVersion !== 1 || typeof value.version !== 'string') throw new Error('模型档案版本不兼容');
    const profiles = schema.validateProfiles(value.profiles);
    if (schema.hashProfiles(profiles) !== value.hash) throw new Error('模型档案校验失败');
    return { ...value, profiles };
  };
  try { const cached = JSON.parse(fs.readFileSync(file, 'utf8')); snapshot = validate(cached.snapshot); source = cached.source; } catch {}
  const currentUrl = () => baseUrl().replace(/\/$/, '') + '/api/v2/model-profiles';
  function isolateSource() {
    const url = currentUrl();
    if (source !== url) { snapshot = { profiles: [], version: null }; source = url; checked = 0; }
    return url;
  }
  async function refresh({ force = false } = {}) {
    const url = isolateSource();
    if (pending) { await pending.catch(() => {}); if (url !== currentUrl()) return false; }
    if (!force && Date.now() - checked < 5 * 60000) return false;
    checked = Date.now();
    pending = (async () => {
      const response = await fetcher(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('模型档案同步失败');
      const text = await response.text(); if (text.length > 12 * 1024 * 1024) throw new Error('模型档案过大');
      const envelope = JSON.parse(text);
      const raw = envelope.success === true ? envelope.data : envelope;
      if (url !== currentUrl()) return false;
      if (raw?.version === null) return false;
      const next = validate(raw);
      if (next.version === snapshot.version && source === url) return false;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = file + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify({ source: url, snapshot: next })); fs.renameSync(temporary, file);
      snapshot = next; source = url; return true;
    })().finally(() => { pending = null; });
    return pending;
  }
  return { refresh, status: () => { isolateSource(); return { version: snapshot.version, count: snapshot.profiles.length }; }, match: id => { isolateSource(); return schema.matchProfile(id, snapshot.profiles); },
    enrich(model) {
      isolateSource();
      const match = schema.matchProfile(model.model, snapshot.profiles), profile = match.profile;
      if (!profile) return { ...model, profileMatch: match.method };
      const capabilities = { image: profile.capabilities.includes('image-recognition'), video: profile.capabilities.includes('video-recognition'), audio: profile.capabilities.includes('audio-recognition'), thinking: profile.capabilities.includes('reasoning'), ...(model.capabilities || {}) };
      return { ...model, canonicalModelId: profile.id, family: profile.family, vendor: profile.vendor, profileMatch: match.method, reasoning: model.reasoning ?? profile.reasoning, contextWindow: model.contextWindow ?? profile.contextWindow, maxOutputTokens: model.maxOutputTokens ?? profile.maxOutputTokens, capabilities };
    } };
}
let client;
function profileClient() {
  return client ||= createProfileClient({ file: path.join(DATA_ROOT, 'model-profile-cache.json'), baseUrl: accountServerUrl });
}
// Paths participates in runtime import cycles; access it only after module initialization.
export const modelProfiles = {
  refresh: (...args) => profileClient().refresh(...args),
  status: () => profileClient().status(),
  match: id => profileClient().match(id),
  enrich: model => profileClient().enrich(model),
};
