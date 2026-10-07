import fs from 'node:fs';
import path from 'node:path';
import { getRunContext } from './run-context.mjs';
import { getWorkspaceRoot, canonicalPath, isInside } from './paths.mjs';
import { matchScore, redactMemoryText } from './memory.mjs';
import { memorySettings } from './memory-policy.mjs';

export function searchHistory(query, { limit = 8, sessionId, excludeSessionId } = {}) {
  if (!memorySettings().enabled || !memorySettings().historyEnabled) throw new Error('历史检索已关闭');
  if (typeof query !== 'string' || !query.trim()) throw new Error('搜索词不能为空');
  if (sessionId && !/^[\w-]+$/.test(sessionId)) throw new Error('无效会话 ID');
  const root = getRunContext()?.sessionStorageRoot || getWorkspaceRoot(), directory = path.join(root, '.agent', 'sessions');
  if (!isInside(canonicalPath(directory), canonicalPath(root))) throw new Error('历史目录越界');
  let index; try { index = JSON.parse(fs.readFileSync(path.join(directory, 'index.json'), 'utf8')); } catch { return []; }
  const sessions = Object.values(index).filter(item => !item.parentSessionId && /^[\w-]+$/.test(item.id) && item.id !== excludeSessionId && (!sessionId || item.id === sessionId)).sort((a, b) => b.updated - a.updated).slice(0, 100);
  const hits = []; let remaining = 8 * 1024 * 1024;
  for (const session of sessions) {
    const file = path.join(directory, `${session.id}.jsonl`); let handle;
    if (!isInside(canonicalPath(file), canonicalPath(root))) continue;
    try {
      const stat = fs.statSync(file), bytes = Math.min(stat.size, remaining, 1024 * 1024);
      if (!bytes) break;
      handle = fs.openSync(file, 'r'); const buffer = Buffer.alloc(bytes);
      fs.readSync(handle, buffer, 0, bytes, stat.size - bytes); remaining -= bytes;
      const lines = buffer.toString('utf8').split('\n');
      for (const line of lines) {
        let entry; try { entry = JSON.parse(line); } catch { continue; }
        if (entry.type !== 'message' || !['user', 'assistant'].includes(entry.role) || ['agent','runtime'].includes(entry.source)) continue;
        const content = Array.isArray(entry.content) ? entry.content.filter(part => part.type === 'text').map(part => part.text).join('\n') : entry.content || entry.text || '';
        const score = matchScore(content, query); if (!score) continue;
        const text = redactMemoryText(content), terms = query.toLowerCase().match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
        const position = Math.max(0, text.toLowerCase().indexOf(terms[0] || '') - 150);
        hits.push({ sessionId: session.id, title: redactMemoryText(session.title), entryId: entry.id, role: entry.role, at: entry.ts, score, snippet: text.slice(position, position + 1200), truncated: text.length > 1200 });
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    finally { if (handle !== undefined) fs.closeSync(handle); }
  }
  return hits.sort((a, b) => b.score - a.score || b.at - a.at).slice(0, Math.max(1, Math.min(20, Number(limit) || 8)));
}
