<p align="center">
  <img src="electron/assets/icon.png" width="96" alt="MLI Agent" />
</p>

<h1 align="center">魔力工作台 · MLI Agent</h1>
<p align="center">开源、本地优先的通用 Agent 工作台</p>
<p align="center">
  <img src="https://img.shields.io/badge/version-v0.2.0-245b43" alt="v0.2.0" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-64748b" alt="Windows / macOS / Linux" />
</p>
<p align="center">
  简体中文 · <a href="README.en.md">English</a> · <a href="https://github.com/ponysb/mlimli/issues">Issues</a> · <a href="docs/TERMINAL.md">TUI / CLI</a> · <a href="PLUGIN-COMPATIBILITY.md">插件说明</a>
</p>

MLI Agent 是面向创作、办公与开发的开源 Agent 工作台，支持 Windows、macOS、Linux，提供桌面、浏览器与终端入口。支持自定义 API 地址、自有 API Key 和三种主流模型协议，可自由组合模型、Skill 与工具插件。项目采用 Apache-2.0 许可证，支持二次开发与扩展。

## 核心特性

- **开放的模型接入**：支持 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 三协议；自定义 API 地址、API Key、模型名称与上下文窗口，支持多服务商、多模型切换。
- **灵活的 AIGC 工作流**：提供图片、视频模型的 API 文档链接或 Skill，即可让 Agent 组织接口调用、提示词调试、任务轮询与素材下载；自由选择创作模型，并将成熟流程沉淀为可复用技能。
- **创作、办公与开发**：小说与剧本创作、漫剧和 AI 视频制作、口播剪辑；Word、Excel、PPT、PDF 工作流；代码编辑、命令执行、Git、TUI 与 LSP 诊断和代码导航。
- **可扩展的能力体系**：专家库、Skill 技能库、工具插件、MCP、执行钩子，以及语言服务和消息渠道适配器；按场景组合方法与执行能力。
- **完整的任务管理**：本地会话持久化、项目记忆、上下文压缩、消息排队、多会话运行、定时任务与完成通知；定时任务创建独立会话，执行进度在界面中可见。
- **聚焦内容的工作台**：文件与产物预览、内置浏览器、白板、附件拖放、权限审批与交互式提问；支持飞书、钉钉消息渠道。

跨平台构建覆盖 Windows 安装包、macOS PKG 和 Linux TUI / CLI 归档。媒体工具通过 FFmpeg 完成裁剪、拼接、转码与音轨处理；文档工具结合原生 OOXML、LibreOffice，以及 Windows Office / WPS 完成读写和格式转换。Windows 桌面自动化提供截图、窗口读取、鼠标与键盘操作。

## 关注我

<p>
  <a href="https://space.bilibili.com/7318180" title="点击进入 B 站主页"><img src="https://img.shields.io/badge/B站-关注我的频道-00A1D6?style=for-the-badge" alt="B站：关注我的频道" /></a>
  <a href="https://xhslink.cn/o/7exC6HysEHH" title="点击进入小红书主页"><img src="https://img.shields.io/badge/小红书-查看最新分享-FF2442?style=for-the-badge" alt="小红书：查看最新分享" /></a>
  <a href="electron/assets/dyh.png" title="点击查看微信公众号二维码，扫码关注"><img src="https://img.shields.io/badge/微信公众号-扫码关注-07C160?style=for-the-badge" alt="微信公众号：点击查看二维码" /></a>
  <a href="electron/assets/qq.png" title="点击查看 QQ 群二维码，扫码加入"><img src="https://img.shields.io/badge/QQ交流群-扫码加入-12B7F5?style=for-the-badge" alt="QQ交流群：点击查看二维码" /></a>
</p>

## 本地开发

要求 **Node.js ≥ 22.12**、npm。Git、FFmpeg、LibreOffice 等按所开发的功能安装。

首次检出后，在仓库根目录执行：

~~~sh
git clone https://github.com/ponysb/mlimli.git
cd mlimli
npm ci
cp config.example.json config.json
npm run build:web
npm start
~~~

浏览器工作台默认位于 `http://127.0.0.1:3000`。示例配置提供 mock 模型，便于开发调试；在模型设置中填写 API 地址、API Key 和模型名称，即可接入自己的服务商。配置也可直接通过 `config.json` 管理。

桌面开发使用 `npm run electron`，Electron 会启动或复用它管理的本地运行时。TUI 与 CLI 复用相同内核：

~~~sh
npm run tui
npm run cli -- --help
npm run cli -- --version
npm run cli -- exec --auto --json "Inspect the project and write a summary"
~~~

前端使用 Vite；修改 `react/` 后运行 `npm run build:web` 更新本地服务托管的 `dist/`。`npm run dev:web` 提供前端开发服务器，/api 请求需要代理到正在运行的本地 Agent。内核调试可使用 `node --watch server.mjs`。终端快捷键、数据目录和运行时共享规则见 [TUI / CLI 文档](docs/TERMINAL.md)。

### 配置与数据

- `config.json`：服务商、模型、上下文预算、权限与 MCP 配置；无凭据模板为 [config.example.json](config.example.json)。
- `MLI_AGENT_PORT` / `MLI_AGENT_HOST`：本地 HTTP 服务地址；默认监听 `127.0.0.1`。
- `MLI_AGENT_DATA_DIR`：运行时配置及用户插件目录；源码模式默认使用项目目录。
- `MLI_AGENT_WORKSPACE`：工作目录；项目会话、记忆和权限记录保存在该目录的 `.agent/` 下。

桌面与 TUI 共享配置、用户插件和项目会话。多项目并行可通过独立的 `MLI_AGENT_DATA_DIR` 组织配置与运行时，终端也支持使用 `--data-dir` 指定数据目录。

## 工程结构

~~~text
core/          Agent 运行时、模型协议、会话、权限、LSP、MCP、渠道与调度
server.mjs     本地 REST / SSE 服务与前端静态资源入口
react/         React 工作台与 Vite 前端
cli/           CLI、OpenTUI / Solid 终端界面与非交互执行
electron/      Electron 主进程、预加载桥、运行时启动及安装脚本
plugins/       执行工具、Skill、语言服务及渠道适配器
scripts/       自检、构建与跨平台打包
test/          客户端单元与集成测试
docs/          终端、打包与插件开发说明
~~~

React、Electron 与终端通过本地 REST / SSE 接口访问运行时。`core/loop.mjs` 负责执行，`core/stream.mjs` 处理模型流，`core/session.mjs` 保存会话，`core/permissions.mjs` 执行授权，`core/plugins.mjs` 注册扩展。

## 扩展

### Skill 与专家

Skill 用 Markdown 描述方法、接口和工作约束，适合接入新的 AIGC API 或复用创作、办公流程。运行时发现技能索引，Agent 按需读取完整指南。临时接入也可直接提供可访问的 API 文档链接，让 Agent 阅读接口并通过执行工具调用；复用时再沉淀为 Skill。

~~~text
skills/my-video-api/
  SKILL.md
  scripts/              可选的调用与结果处理脚本
  references/           可选的 API 文档与参考材料
~~~

~~~markdown
---
name: my-video-api
description: 通过指定 API 创建视频任务、查询状态并下载结果。
---

说明 API 地址、鉴权环境变量、请求与响应结构、异步任务状态和输出路径。
记录失败处理与重试规则，使用环境变量管理凭据。
~~~

工作区支持 `skills/`、`.agent/skills/`、`.agents/skills/`；插件也可携带 `skills/`。专家提供场景方法与提示配置，适合在技能之上组织写作、编辑和分析方式。

### 工具插件

新执行能力放入 `plugins/<name>/`。推荐布局：

~~~text
plugins/example/
  .codex-plugin/plugin.json
  plugin.mjs
  skills/               可选
  assets/               可选
~~~

~~~json
{
  "name": "example",
  "version": "0.2.0",
  "description": "Example tool plugin",
  "capabilities": []
}
~~~

~~~js
export default function setup(ctx) {
  ctx.registerTool({
    name: 'example_echo',
    description: 'Return the supplied text.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    permission: 'L0',
    async run({ text }) {
      return { content: String(text) };
    },
  });
  ctx.registerCommand('/echo', {
    description: 'Run the example tool',
    template: 'Use example_echo to return: {{args}}',
  });
}
~~~

工具权限为 L0 只读、L1 工作区写入、L2 系统执行、L3 敏感操作。UI 提问使用 `ctx.requestUi`；执行钩子为 `authorize_tool_call`、`process_tool_result`、`on_event`，资源释放通过 `ctx.registerCleanup` 注册。插件加载或重载使用 `POST /api/plugins/reload`。

插件还可通过 `ctx.registerLanguageServer` 和 `ctx.registerChannelAdapter` 扩展 LSP 与连接渠道。LSP 优先使用项目或系统已有服务，缺失时经授权安装到 Agent 缓存；当前内置 JavaScript / TypeScript 与 Python。已有实现可参考 `plugins/lsp`、`plugins/feishu`、`plugins/dingtalk`。

用户插件放在运行时数据目录的 `plugins/` 下，同名用户插件优先于内置插件。旧版根 `plugin.json` 保持兼容；纯 Skill 插件可以省略 `plugin.mjs`。详见 [插件兼容说明](PLUGIN-COMPATIBILITY.md)。

### MCP

在 `config.json` 的 `mcp.servers` 中声明 stdio 服务：

~~~json
{
  "mcp": {
    "servers": [
      {
        "name": "my-service",
        "command": "node",
        "args": ["/absolute/path/to/mcp-server.mjs"]
      }
    ]
  }
}
~~~

运行时支持 MCP 工具发现、描述与调用。配置服务进程和鉴权信息后，可将外部数据源与工具接入现有 Agent 工作流。

## 构建与部署

~~~sh
# 本地浏览器客户端：Node 托管 Agent 与已构建的前端
npm run build:web
npm start

# Windows 现代版与兼容版
npm run dist:win
npm run dist:win:modern
npm run dist:win:legacy

# macOS PKG，需在 macOS 构建
npm run dist:mac -- --arch arm64

# Linux TUI / CLI，含独立 Node 运行时
npm run dist:linux -- --arch x64
~~~

产物位于 `release/`，版本由根 `package.json` 统一提供。Windows 打包包含构建与启动验证；现代版用于 Windows 10 / 11 x64，兼容版用于 Win7 SP1 / ia32 环境。具体依赖与验证见 [Windows 打包说明](docs/WINDOWS-PACKAGING.md)；其他终端包说明见 [TUI / CLI 文档](docs/TERMINAL.md)。

本地运行采用 loopback 监听，远程开发可通过 SSH 端口转发访问工作台。

## 测试与贡献

~~~sh
npm test
npm run check
npm run test:tui
npm run build:web
~~~

欢迎通过 Issue 和 PR 参与开发。提交时提供平台、复现方式、修改范围与验证结果；运行时、协议和插件接口变更补充相关测试，UI 变更覆盖流式输出、审批与会话切换。开发配置与凭据通过本地配置文件或环境变量管理。

## 致谢与许可

感谢 [OpenCode](https://github.com/anomalyco/opencode)、[Claude Code](https://github.com/anthropics/claude-code)、[Pi Agent](https://github.com/earendil-works/pi) 与 [Cherry Studio](https://github.com/CherryHQ/cherry-studio)，这些项目为 Agent 工程设计、交互体验与扩展机制提供了参考与启发。

感谢以下主要开源项目及其贡献者，为工作台提供了坚实的基础：

- **界面与构建**：[React](https://react.dev/)、[Vite](https://vite.dev/) 与 [esbuild](https://github.com/evanw/esbuild)。
- **桌面与打包**：[Electron](https://github.com/electron/electron) 与 [electron-builder](https://github.com/electron-userland/electron-builder)。
- **终端交互**：[OpenTUI](https://github.com/anomalyco/opentui)、[SolidJS](https://github.com/solidjs/solid) 与 [Terminal Kit](https://github.com/cronvel/terminal-kit)。
- **白板创作**：[Excalidraw](https://github.com/excalidraw/excalidraw)。
- **代码编辑与终端面板**：[CodeMirror](https://github.com/codemirror/dev)、[React CodeMirror](https://github.com/uiwjs/react-codemirror) 与 [xterm.js](https://github.com/xtermjs/xterm.js)。
- **Markdown 与 PDF**：[Streamdown](https://github.com/vercel/streamdown) 与 [PDF.js](https://github.com/mozilla/pdf.js)。
- **图标与二维码**：[Lucide](https://github.com/lucide-icons/lucide) 与 [qrcode.react](https://github.com/zpao/qrcode.react)。
- **消息渠道**：[飞书 / Lark Node SDK](https://github.com/larksuite/node-sdk) 与 [钉钉 Stream SDK](https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs)。
- **媒体与文档工具**：[FFmpeg](https://ffmpeg.org/) 与 [LibreOffice](https://www.libreoffice.org/)。

内置第三方 Skill、插件与素材保留各自的许可证及通知。

项目代码采用 [Apache-2.0](LICENSE)；第三方组件以各自许可为准。
