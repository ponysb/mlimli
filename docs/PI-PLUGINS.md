# pi 插件安装与兼容

MLI 可安装 pi npm 包或本地包目录，将 TypeScript/JavaScript 扩展贡献到 MLI 工具目录，使用现有审批、会话和结果记录。无需重写纯工具插件；不引入第二套 Agent。

## 安装

```bash
mli plugins install npm:@fitchmultz/pi-calculator@4.1.1
mli plugins reload
mli plugins list
mli plugins remove PACKAGE_ID
mli plugins reload
```

本地包：`mli plugins install /absolute/path/to/pi-package`。更新时重新安装指定版本，再 reload。安装与激活分开，reload 要求工作区空闲。包保存在用户配置目录的 pi-packages，依赖禁止执行 npm lifecycle scripts；第三方扩展本身是受信任的同进程 Node 代码。

HTTP 接口：GET /api/plugins/pi，POST /api/plugins/pi/install {source}，POST /api/plugins/reload，DELETE /api/plugins/pi/:id。安装返回 pending，实际加载失败见 runtime.errors，不能把已下载视为 active。

## 支持

- package.json 的 pi.extensions/skills/prompts；目录和 glob；默认 extensions/skills/prompts 目录。
- jiti 加载 .ts/.js；新旧 pi 包名的基础工具 helpers、TypeBox；真实 pi-tui 可供模块导入，工具使用 MLI 默认渲染。
- registerTool 与 execute(toolCallId, params, signal, onUpdate, ctx)；参数与 outputSchema 验证；文本、图片/音频、structuredContent、details 和错误状态。
- registerCommand handler；Skill YAML；简单 prompt 模板的 $ARGUMENTS。
- tool_call 的 block、tool_result 内容转换；session_start 在会话首次使用工具/命令时触发一次，卸载/reload 时触发 session_shutdown；已绑定会话的 Agent/turn 观察事件。
- ctx.cwd、基础 UI notify/confirm/select/input/setStatus、经宿主审批的 ctx.executeTool；pi.registerMcpServer。
- 新旧 @mariozechner 与 @earendil-works 基础入口别名。

所有 pi 工具和可执行命令默认 L2，不能通过第三方 metadata 自动降为只读。只读 Agent 拒绝通用 pi 执行。模型、调试与嵌套工具调用都执行授权和结果钩子。取消传播 signal，但不合作的同进程代码无法被强制停止。

## 边界

完整 pi 会话树、消息注入、provider/model 管理、TUI custom widgets/快捷键/主题、pi Agent 控制接口尚不支持；调用未知 API 明确报 PI_UNSUPPORTED_API。不能宣称所有 pi 包兼容。

session_start 采用 MLI 懒绑定语义，不等同 pi 启动时的全部发现流程。prompt 参数目前仅支持 $ARGUMENTS，不解释 pi 的完整模板语法。Git 来源请先检出固定版本，再安装本地目录。需要 npm build/install 脚本、特定 native addon 或 Node 版本的插件需另行满足运行条件。

已实测：固定 pi 官方示例 hello.ts（原样）及 npm @fitchmultz/pi-calculator@4.1.1（原包），后者 0.1 + 0.2 返回精确字符串 0.3。此包要求 Node >=24；在最低 Node 22 环境应选择兼容版本。

## MCP

在「设置 → MCP 服务」中可添加、编辑、启停、删除服务，或导入包含 `mcpServers` 对象的 JSON。保存立即生效；点击「测试已保存配置」验证连接并查看工具。支持 stdio、Streamable HTTP、旧版 SSE，认证值不回显，留空保留已有值。插件自带的服务显示来源，随插件管理。

配置支持 config.mcp.servers 数组、mcpServers 对象、插件 .mcp.json 与 pi 注册。stdio 使用官方 SDK 的逐行 JSON；远程默认 Streamable HTTP，旧 SSE 显式设置 type:sse。

```json
{"mcp":{"servers":[{"name":"local","command":"node","args":["/path/server.mjs"],"cwd":"/path","timeout":30000},{"name":"remote","url":"https://example.com/mcp","bearer_token_env_var":"SERVICE_TOKEN"}]}}
```

远程 HTTP 支持 SDK 原生 OAuth：服务卡片点击「授权连接」，浏览器授权回调后保存凭据；Agent 目标调用遇到缺授权也会弹出等待窗口。授权失败会显示具体原因。插件中的 Codex 专用 Apps 不会自动变成可用账户连接。

## 状态型插件兼容补充

已支持 sessionManager 的 getEntries/getBranch/getLeafId/getSessionId/getSessionFile/getSessionName/getCwd、pi.appendEntry 的插件私有 custom entries、toolResult details 持久化、on 返回取消订阅函数、插件内 events.on/emit，以及 registerFlag/getFlag 默认值（尚无自定义 CLI 参数透传）。

同一插件跨会话使用时串行执行，并以 shutdown/start(resume) 重建当前会话状态，避免共享闭包直接串用。官方 todo.ts 已原样验证添加、切换两个会话、重载后恢复与 toggle。其 /todos 专用 TUI 仍不支持；ctx.mode 为 web，不假称 TUI 可用。不会自动获得 pi 分支切换、完整消息注入或模型 API。

### 插件协作与资源过滤

pi.events 现在由本运行时中的 pi 扩展共享，支持跨插件 on/emit；加载失败或卸载只移除相应插件的监听器。资源列表支持 !file 和 !directory/** 排除规则，避免禁用的扩展仍被目录扫描加载。事件监听器同步执行，符合 EventEmitter 行为；事件回调不能自行切换或冒用其他会话。

### 设计工具与授权

- Figma 官方远程服务：`https://mcp.figma.com/mcp`。配置已改为原生 HTTP OAuth，首次目标调用或点击「授权连接」会尝试浏览器授权。旧桥接包仍在用户目录中，但当前配置不再使用。当前环境实测动态客户端注册返回 HTTP 403，尚未授权连通。桌面备选为 `http://127.0.0.1:3845/mcp`，需在 Figma 桌面应用开启 MCP 服务后启用对应配置。
- 墨刀官方服务：`https://modao.cc/agent-py/ai/mcp`。在服务配置的密码输入框中填写个人空间令牌，写入 `modao-token` 请求头。Agent 调用时缺少令牌会触发应用内密码窗口，保存到本机后继续调用，取消/停止任务会结束等待。令牌不进入聊天记录或工具结果。已有失效令牌需在设置中更新；其他服务尚未统一实现令牌弹窗。
- OAuth 的浏览器弹出、回环回调、PKCE 与令牌刷新通过官方 SDK 原生实现；尚未覆盖所有提供商变体。远程授权被拒绝、网络错误或用户未完成授权均不表示连接成功。

官方资料：[Figma](https://github.com/figma/mcp-server-guide)、[墨刀](https://modao.cc/feature/ai-mcp.html)。
