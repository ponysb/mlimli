// Aggregate the full session, independently of history pagination.
const positive = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
export function sessionStatistics(entries = []) {
  const turns = new Map(), requests = new Map();
  for (const entry of entries) {
    const key = entry.turnId;
    if (['turn_start', 'turn_resume', 'step_start', 'turn_end', 'task_summary'].includes(entry.type) && key) {
      const turn = turns.get(key) || { steps: new Set(), count: 0 };
      if (entry.type === 'step_start' && Number.isInteger(entry.step)) turn.steps.add(entry.step);
      turn.count = Math.max(turn.count, positive(entry.stepCount));
      turns.set(key, turn);
    }
    if (entry.type === 'model_usage' && entry.requestId) requests.set(entry.requestId, entry.metrics || {});
  }
  let promptTokens = 0, completionTokens = 0, cacheReadTokens = 0, totalMs = 0, estimated = false;
  for (const metrics of requests.values()) {
    promptTokens += positive(metrics.promptTokens);
    completionTokens += positive(metrics.completionTokens);
    cacheReadTokens += Math.min(positive(metrics.promptTokens), positive(metrics.cacheReadTokens));
    totalMs += positive(metrics.totalMs);
    estimated ||= metrics.estimatedTokens === true;
  }
  // Older transcripts contain billing totals but no per-request timing.
  let legacyTokens = 0, legacyPrompt = 0, legacyCache = 0;
  const loggedTurns = new Set(entries.filter(e => e.type === 'model_usage').map(e => e.turnId));
  const summaries = new Map();
  for (const entry of entries) if (entry.turnId && entry.billing && !loggedTurns.has(entry.turnId) && ['turn_end', 'task_summary'].includes(entry.type)) summaries.set(entry.turnId, entry.billing);
  for (const billing of summaries.values()) {
    legacyPrompt += positive(billing.promptTokens);
    legacyTokens += positive(billing.promptTokens) + positive(billing.completionTokens);
    legacyCache += Math.min(positive(billing.promptTokens), positive(billing.cacheReadTokens));
    estimated ||= billing.estimatedTokens === true;
  }
  return {
    turns: turns.size,
    steps: [...turns.values()].reduce((sum, turn) => sum + Math.max(turn.steps.size, turn.count), 0),
    totalTokens: promptTokens + completionTokens + legacyTokens,
    tokensPerSecond: totalMs > 0 ? completionTokens / (totalMs / 1000) : null,
    cacheHitPercent: promptTokens + legacyPrompt > 0 ? (cacheReadTokens + legacyCache) / (promptTokens + legacyPrompt) * 100 : null,
    estimated,
  };
}
