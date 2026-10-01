# 插件系统兼容说明

当前 Agent 已按 Codex 的插件边界对齐：插件目录可使用 `.codex-plugin/plugin.json`，插件可以携带 `skills/`、`assets/`、`.mcp.json` 和 `.app.json`，并由本地 Agent 加载。旧版根目录 `plugin.json` 仍兼容。

## 执行边界

- 后端插件中心负责上传、版本、启用/停用、SHA-256 和下载。
- 本地 Agent 负责下载、校验、安装、热重载和执行工具。
- `desktop`、`office`、`ffmpeg` 只在客户端执行，后端不会访问用户桌面或工作区。
- 纯 Skill 插件可以直接加载；带 Codex 专用 App/MCP 的插件只会加载 Skill，外部账户连接需要另行实现和授权。

## 已内置

- `desktop`：Windows 桌面操作
- `office`：DOCX/XLSX/PPTX 操作
- `ffmpeg`：探测、转码、裁剪、拼接、提取音频、缩略图
- `remotion`：官方 MIT Skill，视频生成最佳实践
- `notion`：官方 MIT Skill，知识库和文档工作流；当前不自动连接 Notion 账户
- `build-web-apps`：官方 MIT Skill，Web 应用、支付和数据库工作流
- `build-web-data-visualization`：官方 MIT Skill，数据可视化工作流
- `linear`、`google-drive`、`github`：官方 MIT Skill；对应外部服务连接需要单独授权

官方来源：`https://github.com/openai/plugins`。专有许可或依赖外部 App/MCP 的官方插件没有复制进本项目。
