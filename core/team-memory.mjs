import { listTeamMemory, accountOrganizationId } from './account.mjs';
import { getRunContext } from './run-context.mjs';
import { memorySettings } from './memory-policy.mjs';

function terms(value) {
  const raw = String(value || '').toLowerCase().slice(0, 2000);
  const words = new Set(raw.match(/[a-z0-9_./-]{2,}|[\u4e00-\u9fff]{2,}/g) || []);
  return [...words].flatMap((word) => /[\u4e00-\u9fff]/.test(word) ? [...Array(Math.min(60, word.length - 1))].map((_, index) => word.slice(index, index + 2)) : [word]).slice(0, 100);
}

function score(item, queryTerms) {
  const text = `${item.title || item.name || ''} ${(item.tags || []).join(' ')} ${item.content || item.description || ''}`.toLowerCase();
  return (item.pinned ? 100 : 0) + queryTerms.reduce((total, term) => total + (text.includes(term) ? 3 : 0), 0);
}

export async function createTeamMemorySnapshot(query = '') {
  if (!memorySettings().enabled) return { body: '', ids: [], organizationId: null };
  const organizationId = accountOrganizationId();
  if (!organizationId) return { body: '', ids: [], organizationId: null };
  const data = await listTeamMemory();
  const queryTerms = terms(query);
  const memories = (data.memories || []).map((item) => ({ ...item, source: 'team-memory' }));
  const repositoryItems = (data.repositories || []).flatMap((repository) => (repository.items || []).map((item, index) => ({
    ...item,
    id: `${repository.id}:${item.id || index}`,
    title: item.title || `${repository.name} #${index + 1}`,
    tags: [...new Set([...(repository.tags || []), ...(item.tags || [])])],
    pinned: Boolean(item.pinned),
    source: `repository:${repository.name}`,
    revision: repository.revision
  })));
  const items = [...memories, ...repositoryItems].filter((item) => String(item.content || '').trim());
  const ranked = items.map((item) => ({ item, rank: score(item, queryTerms) })).filter(({ rank }) => rank > 0).sort((a, b) => b.rank - a.rank);
  const blocks = [], ids = [];
  let budget = 4400;
  for (const { item } of ranked.slice(0, 8)) {
    const block = `[team/${item.id} · ${item.title || '团队记忆'} · v${item.revision || 1}]\n${String(item.content).slice(0, 1100)}`;
    if (block.length > budget) continue;
    budget -= block.length;
    blocks.push(block);
    ids.push(item.id);
  }
  const used = new Set(ids);
  const catalog = items.filter((item) => !used.has(item.id)).slice(0, 24).map((item) => `- team/${item.id}：${item.title || '团队记忆'}`).join('\n').slice(0, 2200);
  return {
    body: [...blocks, ...(catalog ? [`其他团队记忆目录：\n${catalog}`] : [])].join('\n\n'),
    ids,
    organizationId,
    organizationName: data.scope?.organizationName || '',
    items
  };
}

export function teamMemoryItems() {
  return getRunContext()?.teamMemorySnapshot?.items || [];
}

export function readTeamMemory(id) {
  return teamMemoryItems().find((item) => item.id === id) || null;
}

export function searchTeamMemories(query, limit = 12) {
  const queryTerms = terms(query);
  if (!queryTerms.length) throw new Error('搜索词不能为空');
  return teamMemoryItems().map((item) => ({ item, rank: score(item, queryTerms) })).filter(({ rank }) => rank > 0).sort((a, b) => b.rank - a.rank).slice(0, Math.max(1, Math.min(30, Number(limit) || 12))).map(({ item }) => item);
}
