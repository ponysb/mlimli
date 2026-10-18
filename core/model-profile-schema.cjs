const crypto = require('node:crypto');
const list = value => Array.isArray(value) ? [...new Set(value.map(String).map(x => x.trim()).filter(Boolean))].slice(0, 100) : [];
function normalizeId(value) { return String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/(\d)\.(?=\d)/g, '$1-'); }
function validateProfiles(value) {
  if (!Array.isArray(value) || value.length > 20000) throw new Error('模型档案必须是数组，最多 20000 项');
  const ids = new Set();
  return value.map(row => {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || row.id.length > 200) throw new Error('无效标准模型 ID');
    if (ids.has(normalizeId(row.id))) throw new Error('模型 ID 重复：' + row.id);
    ids.add(normalizeId(row.id));
    const result = { id: row.id.trim(), name: String(row.name || row.id).slice(0, 200), vendor: String(row.vendor || row.ownedBy || '').slice(0, 100), family: String(row.family || '').slice(0, 100), aliases: list(row.aliases), prefixes: list(row.prefixes), suffixes: list(row.suffixes), capabilities: list(row.capabilities), inputModalities: list(row.inputModalities), outputModalities: list(row.outputModalities), source: row.source === 'cherry' ? 'cherry' : 'manual' };
    for (const key of ['contextWindow', 'maxOutputTokens']) if (row[key] != null) {
      if (!Number.isSafeInteger(row[key]) || row[key] <= 0) throw new Error('无效 Token 上限');
      result[key] = row[key];
    }
    if (row.reasoning != null) {
      if (typeof row.reasoning !== 'object' || Array.isArray(row.reasoning) || JSON.stringify(row.reasoning).length > 10000) throw new Error('无效思考能力档案');
      // Metadata only. Request encoders must explicitly interpret supported controls.
      result.reasoning = JSON.parse(JSON.stringify(row.reasoning));
    }
    return result;
  });
}
function matchProfile(apiId, profiles) {
  const key = normalizeId(apiId);
  for (const method of ['exact', 'alias', 'decorated']) {
    const matches = profiles.filter(row => {
      const names = [row.id, ...(row.aliases || [])].map(normalizeId);
      if (method === 'exact') return normalizeId(row.id) === key;
      if (method === 'alias') return names.slice(1).includes(key);
      let candidate = key;
      for (const prefix of row.prefixes || []) if (candidate.startsWith(normalizeId(prefix))) { candidate = candidate.slice(normalizeId(prefix).length); break; }
      for (const suffix of row.suffixes || []) if (candidate.endsWith(normalizeId(suffix))) { candidate = candidate.slice(0, -normalizeId(suffix).length); break; }
      return candidate !== key && names.includes(candidate);
    });
    if (matches.length) return matches.length === 1 ? { apiId, method, profile: matches[0] } : { apiId, method: 'ambiguous', candidates: matches.map(x => x.id) };
  }
  return { apiId, method: 'unknown' };
}
function hashProfiles(profiles) { return crypto.createHash('sha256').update(JSON.stringify(profiles)).digest('hex'); }
module.exports = { validateProfiles, matchProfile, hashProfiles, normalizeId };
