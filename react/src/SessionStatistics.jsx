import React from 'react';
import { Gauge, Database } from 'lucide-react';
import { compactTokens, statisticsLabels } from './session-statistics.mjs';
import './session-statistics.css';

export default function SessionStatistics({ statistics, context }) {
  const labels = statisticsLabels(statistics, context);
  return <div className="session-statistics" role="group" aria-label="会话统计">
    <span className="session-statistics-item" title="会话累计轮次与模型执行步数；速度为输出 token / 模型请求总耗时（含首字等待）">
      <Gauge size={13} aria-hidden="true" />
      <span>{labels.turns} 轮 {labels.steps} 步<span className="session-statistics-secondary"> · {labels.speed} tok/s</span></span>
    </span>
    <span className="session-statistics-item" title={`会话累计输入与输出 token${statistics?.estimated ? '（含估算）' : ''}；缓存命中率为缓存读取 token / 输入 token`}>
      <Database size={13} aria-hidden="true" />
      <span>{statistics?.estimated ? '≈' : ''}{compactTokens(statistics?.totalTokens)} tok<span className="session-statistics-secondary"> · 缓存命中 {labels.cache}</span></span>
    </span>
    <span className="session-statistics-item" title="当前模型上下文占用（估算）">
      <svg className="session-context-ring" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" className="session-context-ring-track" />
        <circle cx="8" cy="8" r="6" pathLength="100" strokeDasharray={`${labels.percent} 100`} transform="rotate(-90 8 8)" />
      </svg>
      <span>{labels.percent}%</span>
    </span>
  </div>;
}
