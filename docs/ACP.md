# ACP 接入（Agent 角色）

MLI 提供 `mli acp`，使用官方 `@agentclientprotocol/sdk` 稳定 v1 入口，通过 stdio JSON-RPC 接受外部客户端的调用。现有桌面、Web 和 TUI 的 HTTP/SSE 接口保持不变。

支持两个方向：**ACP Agent**（外部 Client → MLI Runtime）和 **ACP Client**（MLI 调度器 → 受信任外部 ACP Agent）。外部 Agent 复用已有子任务排队、依赖、等待、取消及汇总机制。

## 调用外部 Agent

在 **设置 → 外部 Agent** 标签页可先点击“检测本机 ACP”。检测器只检查已确认的 ACP 入口，并通过 `initialize` 握手验证协议；目前包括：OpenCode (`opencode acp`)、Cursor (`cursor-agent acp` 或 `cursor-acp`)、Qoder (`qodercli --acp`)，以及 Claude Code (`claude-agent-acp` 或 `claude-code-cli-acp`)、Codex (`codex-acp`)、Oh My Pi (`omp-acp`)、ZCode (`zcode-acp-server` 或 `zcode-acp`) 适配器。普通 `codex`、`claude`、`cursor-agent`、`qoder` 等非 ACP 启动方式不会被识别。检测完成后立即关闭探测进程，不发送任务、不登录、不安装软件，也不自动加入可信配置。

WorkBuddy 的已知本机实现是私有 HTTP/SSE ACP Gateway，不是当前外部 Agent 客户端使用的 stdio ACP 传输，界面会明确标记为暂不支持。Trae 当前没有可确认的官方 stdio ACP Agent 入口。如果未来提供原生入口或用户安装了其他适配器，只需把该适配器的可执行文件手动加入配置即可，不应根据桌面程序存在就推断它支持 ACP。

确认检测结果后，可添加、编辑或删除配置。填写 ID、显示名称、可执行文件、JSON 参数数组与超时；保存后新任务立即生效，无需重启，也不会启动程序。高级环境变量值不回显；留空保留，填写对象替换，勾选清空则删除已有值。任务运行期间不能修改配置。

也可手动编辑 MLI 用户数据目录的 `config.json` 后重启。配置只能由用户维护，模型只能选择已有 ID，不能指定任意命令。

```json
{
  "acp": {
    "agents": [
      {
        "id": "opencode",
        "name": "OpenCode",
        "command": "/absolute/path/to/opencode",
        "args": ["acp"],
        "timeoutMs": 600000
      },
      {
        "id": "codex",
        "name": "Codex ACP",
        "command": "/absolute/path/to/codex-acp",
        "args": [],
        "timeoutMs": 600000
      }
    ]
  }
}
```

OpenCode 使用其 `acp` 入口；Codex 需单独安装 `@agentclientprotocol/codex-acp` 适配器，不能把普通 `codex` 命令当 ACP 服务。参考官方 OpenCode ACP 文档及 codex-acp README。此实现不会自动安装软件、自动登录或修改这些 Agent 的权限设置。先在外部 Agent 自身完成登录/模型配置；使用绝对可执行文件路径，尤其是 Windows 不要把 `.cmd` shell 包装器当作可执行文件。

在聊天中明确要求：“用已配置的 OpenCode 实现这个任务”。主 Agent 可调用：

```json
{
  "tasks": [
    {
      "profile": "worker",
      "externalAgentId": "opencode",
      "title": "修复登录流程",
      "instruction": "仅修改指定模块，完成后返回改动、测试与未解决问题"
    }
  ]
}
```

`agent_external_list` 列出配置 ID（不暴露命令参数/环境变量）。`agent_spawn` 返回与内置子任务相同的句柄，后续用 `agent_wait`、`agent_inspect`、`agent_stop`；结果进入子会话历史和任务组。只有 worker 支持 externalAgentId，不能假装外部进程受只读策略保护。共享工作区沿用单写入者策略。运行中不支持 steer/info，完成后的 follow_up 会新建外部进程/会话，并仅传新指令，不自动复用外部聊天历史。

### 外部进程的安全边界

- 每次启动均经过 L3 明确审批，即使 MLI 会话处于 auto-all 也不会跳过；既有持久权限规则不会跳过，界面选择记住权限也只允许这一次。外部 Agent 后续发起的工具调用同样逐次经过单次人工审批。
- 外部 Agent 请求审批时，仅转发 allow_once；未知会话、取消、未知选项、缺少单次允许选项均拒绝，不自动授予 allow_always。
- **MLI 沙箱不保护外部进程**。外部 Agent 可使用其自身的文件、网络和凭据访问能力，也可能自行自动执行不发起 ACP 审批的操作。启动批准是在信任整个配置的程序，不是逐操作强制隔离。
- 只继承基本 PATH/HOME/临时目录等环境，不自动转发 MLI 平台秘密、API Key 或整个 process.env。需要的其他环境可显式配置 `env`（字符串对象），但不要在项目仓库保存密钥。HOME 仍让外部 Agent 能读取自身本地凭据，不代表完全隔离。
- 请求仅使用 stdio，不提供 Client 文件/终端能力或客户端 MCP。超时、取消、异常退出均清理子进程；不同操作系统对脱离进程组/自行守护的后代进程无法保证绝对终止。
- 外部 end_turn 标记为任务完成，但结果是 **外部自报，未独立验收**；主 Agent 仍必须核对产物与测试。外部 token/cost 不计入 MLI 模型用量。

本机检测返回 `available`、`not_found`、`invalid` 或 `unsupported`，且不会自动配置任何 Agent。可运行 `node --test test/acp-client.test.mjs` 验证发现、协议、审批、取消与任务组集成。

## 启动

源码运行（Node.js >= 22.12）：

```sh
npm install
node cli/main.cjs acp --cwd /absolute/path/to/project
```

安装终端客户端后可使用 `mli acp --cwd /absolute/path/to/project`。

此命令不是交互终端，不会显示聊天界面；stdin/stdout 专供协议消息。运行时日志在用户数据目录的 `desktop.log`，启动错误输出到 stderr。保留原有 `--data-dir`、`--connect`，不接受 `--auto`、`--resume` 或命令行 prompt。

Client 的通用进程配置示例（字段以所用 Client 为准）：

```json
{
  "command": "/absolute/path/to/node",
  "args": [
    "/absolute/path/to/mli/cli/main.cjs",
    "acp",
    "--cwd",
    "/absolute/path/to/project"
  ]
}
```

模型、API Key、平台登录、插件、沙箱及 MCP 仍使用现有 MLI 用户配置；先运行 `mli config` 或在工作台配置。ACP 不新增凭据交换或自动登录。不要把 API Key 写入项目文件。

## 支持范围

- `initialize`：协商 v1，返回 package.json 中的实际应用版本。
- `session/new`：创建持久化 MLI 会话，初始权限模式固定为 `default`，不继承自动批准默认值。
- `session/prompt`：接受文本块，转发文本增量、工具调用与最终结果，等待任务结束后返回。
- `session/request_permission`：允许一次、拒绝一次；取消、未知选项和请求错误均按拒绝处理，支持主任务所属子 Agent 的审批。
- `session/cancel`：停止主任务及其子任务，Prompt 返回 `cancelled`。
- EOF / SIGINT / SIGTERM / 事件流断线：停止本连接拥有的任务并释放 runtime lease，不停止其他客户端会话。

一个连接可创建多个会话，但绑定同一个真实工作目录；同一会话不能并发 Prompt。`session/new.cwd` 必须是现存绝对目录。不同项目需要不同 ACP 进程；现有运行时共享全局工作区，同时运行多项目还需要独立 `--data-dir`。其他工作台切换共享工作区时，请求失败而不会静默改到新项目。

暂不支持：跨连接加载/恢复/列出历史会话、图片/音频/资源块、Client 提供的 MCP 配置、Client 文件与终端代理、权限模式切换。运行时 MCP 配置仍可供内置工具使用。额外交互输入应在 MLI 工作台完成；ACP 收到插件 `ui_request` 时取消任务并提示，不自动确认。

所有文件操作仍由 MLI 工具、沙箱和权限规则负责。人工审批模式不会绕过已有用户批准的持久规则；可在工作台审查这些规则。ACP 不是新增的隔离边界。

## 验证

```sh
node --test test/acp.test.mjs
```

含官方 SDK Client 经 stdio 启动真实 MLI mock-provider runtime、审批文件写入、检查工具通知和 EOF 退出。另覆盖工作区约束、未知会话、内容限制、并发 Prompt、取消及断线清理。尚未做真实 Zed、JetBrains 或 Orca 的 UI 兼容性验收。
