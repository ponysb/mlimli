# 交付质量与验收

MLI Agent 默认在任务结束前核对实际交付物和验证记录。缺少证据时，运行时提示 Agent 在当前任务中继续检查或修复；任务摘要展示已执行检查、未满足条件和验证范围。

## 验证方式

- `set_task_plan` 记录目标、交付路径和验收条件；计划本身不能证明完成。
- `verify_artifact` 重读真实文件，检查格式、内容及指定单元格等条件。记录绑定文件 SHA-256，修改后需要重新验证。
- 代码交付需要真实测试、构建或检查命令的成功退出码，并检查源码与配置版本。普通输出命令不能代替测试。
- `verify_browser` 使用独立的 Chromium 测试工作区 HTML 或 localhost 页面，可检查点击、填写、刷新、元素内容、移动布局与控制台错误。截图本身不能代替交互断言。
- `verify_document` 渲染 PDF 并检查文字、页数与页面图片。Office 转 PDF 需要 LibreOffice；缺少依赖会报告失败。指定页检查不代表所有页面均已验证。
- `verify_media` 使用 FFprobe 与 FFmpeg 检查实际流、完整解码、时长及尺寸。需要安装 FFmpeg/FFprobe 或配置 `media.ffmpegPath` / `media.ffprobePath`。

最终验收绑定当前文件版本，不能沿用修改前的结果。主 Agent 汇总子任务后仍须验收最终交付物；子 Agent 停止并不代表交付通过。mock 模型用于演示，不提供真实完成质量保证。

## 配置与恢复

质量检查缺省启用，可在 `config.json` 中配置：

```json
{
  "agent": {
    "quality": {
      "enabled": true,
      "noProgressThreshold": 3
    }
  }
}
```

`noProgressThreshold` 范围为 2–8，控制重复停滞时何时提示换策略。任务持续产生新进展时不受固定修复次数限制；明确设置的步骤或时长预算仍然有效。停滞、错误、预算耗尽或用户停止时，摘要保留当前验证状态，未完成验收可标记为 `needs_validation`。

检查点恢复时，未知副作用需要核对，不能盲目重放已执行操作。关闭质量检查不会解除恢复过程的副作用核对要求。

## 范围与开发验证

测试通过只说明被测试条件通过，不能证明覆盖所有需求。文件可读不代表排版、事实、审美或音画同步正确；图片也须由支持视觉的模型或用户实际检查。运行时会保留尚未验证的范围。

相关回归测试位于 `test/task-quality*.test.mjs`、`test/delivery-evidence.test.mjs`、`test/task-continuity.test.mjs`、`test/task-recovery-http.test.mjs` 和 `test/run-control.test.mjs`。客户端开发检查使用 `npm test`、`npm run check` 和 `npm run build:web`。
