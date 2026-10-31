const finite = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const count = value => finite(value) ? Math.max(0, Number(value)) : 0;
export function compactTokens(value) {
  const tokens = count(value);
  const unit = tokens >= 1e6 ? 1e6 : tokens >= 1e3 ? 1e3 : 1;
  return `${Number((tokens / unit).toFixed(unit === 1 ? 0 : 1))}${unit === 1e6 ? 'M' : unit === 1e3 ? 'K' : ''}`;
}
export function statisticsLabels(statistics, context) {
  return {
    turns: count(statistics?.turns), steps: count(statistics?.steps),
    speed: finite(statistics?.tokensPerSecond) ? Math.round(count(statistics.tokensPerSecond)) : '—',
    cache: finite(statistics?.cacheHitPercent) ? `${Math.min(100, count(statistics.cacheHitPercent)).toFixed(0)}%` : '—',
    percent: Math.min(100, count(context?.percent)),
  };
}
