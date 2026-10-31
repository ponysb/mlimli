// Remind on the next ordinary model request; never generate a synthetic update.
export class ProgressUpdates {
  constructor(now = Date.now()) {
    this.lastUpdateAt = now;
    this.toolCount = 0;
    this.hasUpdate = false;
  }
  observe(text, toolCount = 0, now = Date.now()) {
    if (text?.trim()) {
      this.lastUpdateAt = now;
      this.toolCount = 0;
      this.hasUpdate = true;
    }
    this.toolCount += toolCount;
  }
  prompt(now = Date.now()) {
    if (!this.toolCount) return '';
    if (this.hasUpdate && this.toolCount < 8 && now - this.lastUpdateAt < 60000) return '';
    return '# 进展沟通提醒\n已经连续执行多项工具操作且缺少面向用户的进展说明。若任务仍需继续，请在本次工具调用前，用 1–3 句普通回复说明已证实的关键发现、对结果的影响和下一步；没有新结论时说明正在检查的事项或实际阻碍，不逐条复述工具，也不编造完成情况。若任务已完成，直接给最终答复，不为了汇报增加工具调用。';
  }
}
