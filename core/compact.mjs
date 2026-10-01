// core/compact.mjs —— 上下文压缩：token 估算 + 阈值触发 + 8 段结构化摘要
// 压缩 = 往会话树追加 compaction entry（磁盘全量保留，模型只见窄视图）
import { completeOnce } from './llm.mjs';
import { emit } from './events.mjs';

const IMAGE_TOKENS = 800; // 每张图粗略计

export function estimateTokens(messages) {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') chars += m.content.length;
    else if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p.type === 'image') chars += IMAGE_TOKENS * 4;
        else chars += (p.text ?? '').length;
      }
    }
    if (m.text) chars += m.text.length;
    if (m.toolCalls?.length) for (const c of m.toolCalls) chars += JSON.stringify(c.args ?? {}).length + c.name.length;
  }
  return Math.ceil(chars / 4);
}

export function shouldCompact(session, { contextWindow, compactAtPercent }) {
  const messages = session.messages();
  const used = estimateTokens(messages);
  const budget = Math.floor((contextWindow ?? 128000) * ((compactAtPercent ?? 75) / 100));
  return { used, budget, need: used >= budget };
}

const SUMMARY_PROMPT = `请把以下对话历史压缩为一份结构化摘要，供后续对话作为唯一上下文使用。严格按以下 8 个小节输出（无内容的小节写"无"），总长度不超过 1200 字：
## Summary（任务目标与当前进展）
## Decisions（已确定的关键决定）
## Files Read（读过的关键文件及要点）
## Files Modified（已修改/创建的文件及改动）
## Commands Run（执行过的关键命令及结果）
## Tools Used（使用的工具与发现）
## Open TODOs（未完成的事项与下一步）
## Risks（风险与注意事项）`;

/** 需要时执行压缩；返回 {done, used, budget, summary?} */
export async function maybeCompact(session, cfg, { force = false } = {}) {
  const { used, budget, need } = shouldCompact(session, cfg);
  if (!need && !force) return { done: false, used, budget };
  if (used < 2000 && !force) return { done: false, used, budget }; // 太短不值得压

  const messages = session.messages();
  const res = await completeOnce({
    sessionId: session.id,
    messages: [
      { role: 'user', content: `${SUMMARY_PROMPT}\n\n<对话历史>\n${JSON.stringify(messages, null, 1).slice(0, 60000)}\n</对话历史>` },
    ],
  });
  session.append({ type: 'compaction', summary: res });
  emit('compaction', { sessionId: session.id, used, summary: res.slice(0, 200) + '…' });
  return { done: true, used, budget, summary: res };
}
