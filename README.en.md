<p align="center">
  <img src="electron/assets/icon.png" width="96" alt="MLI Agent" />
</p>

<h1 align="center">MLI Agent · 魔力工作台</h1>
<p align="center">An open-source, local-first Agent workbench</p>
<p align="center">
  <img src="https://img.shields.io/badge/version-v0.3.0-245b43" alt="v0.3.0" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-64748b" alt="Windows / macOS / Linux" />
</p>
<p align="center">
  <a href="README.md">简体中文</a> · English · <a href="https://github.com/ponysb/mlimli/issues">Issues</a> · <a href="docs/TERMINAL.md">TUI / CLI</a> · <a href="PLUGIN-COMPATIBILITY.md">Plugins</a>
</p>

MLI Agent is an open-source workbench for creative work, office workflows and software development. It supports Windows, macOS and Linux, with desktop, browser and terminal interfaces. Custom API endpoints, your own API keys and three model protocols let you combine providers, Skills and tool plugins. The project uses the Apache-2.0 license and supports customization and extension.

## Key features

- **Open model integration**: OpenAI Chat Completions, OpenAI Responses and Anthropic Messages. Configure API endpoints, keys, model names and context windows, and switch between multiple providers and models.
- **Flexible AIGC workflows**: provide an image or video model's API documentation URL or a Skill to organize API calls, prompt iteration, job polling and asset downloads. Choose your creative models and turn successful workflows into reusable Skills.
- **Creative work, documents and code**: novels, scripts, illustrated video stories, AI video production and narration editing; Word, Excel, PowerPoint and PDF workflows; code editing, shell execution, Git, TUI and LSP diagnostics and navigation.
- **Extensible capabilities**: expert presets, Skills, tool plugins, MCP, execution hooks, language servers and messaging adapters. Combine methods and tools for each workflow.
- **Task management**: local session persistence, project memory, context compaction, queued messages, concurrent sessions, scheduled tasks and completion notifications. Scheduled runs create separate sessions with visible execution progress.
- **A content-focused workbench**: file and artifact previews, an embedded browser, whiteboards, attachment drag-and-drop, permission approvals and interactive questions, plus Feishu and DingTalk channels.

Cross-platform builds provide Windows installers, a macOS PKG and Linux TUI / CLI archives. Media tools use FFmpeg for trimming, concatenation, transcoding and audio tracks. Document tools combine native OOXML, LibreOffice and Windows Office / WPS for reading, editing and conversion. Windows desktop automation provides screenshots, window inspection, mouse and keyboard control.

## Follow me

<p>
  <a href="https://space.bilibili.com/7318180" title="Visit my Bilibili channel"><img src="https://img.shields.io/badge/Bilibili-Follow%20my%20channel-00A1D6?style=for-the-badge" alt="Bilibili: follow my channel" /></a>
  <a href="https://xhslink.cn/o/7exC6HysEHH" title="Visit my Xiaohongshu profile"><img src="https://img.shields.io/badge/Xiaohongshu-Latest%20updates-FF2442?style=for-the-badge" alt="Xiaohongshu: latest updates" /></a>
  <a href="electron/assets/dyh.png" title="Open the WeChat QR code and scan to follow"><img src="https://img.shields.io/badge/WeChat-Scan%20to%20follow-07C160?style=for-the-badge" alt="WeChat: click to view QR code" /></a>
  <a href="electron/assets/qq.png" title="Open the QQ group QR code and scan to join"><img src="https://img.shields.io/badge/QQ%20Community-Scan%20to%20join-12B7F5?style=for-the-badge" alt="QQ community: click to view QR code" /></a>
</p>

## Development

Requirements: **Node.js ≥ 22.12** and npm. Install Git, FFmpeg, LibreOffice and other tools as needed for the features you develop.

For a fresh checkout, run from the repository root:

~~~sh
git clone https://github.com/ponysb/mlimli.git
cd mlimli
npm ci
cp config.example.json config.json
npm run build:web
npm start
~~~

The browser workbench defaults to `http://127.0.0.1:3000`. The example configuration includes a mock model for development. Add an API endpoint, API key and model name in model settings to connect your provider, or manage the configuration directly in `config.json`.

For desktop development, run `npm run electron`; Electron starts or reuses its managed local runtime. TUI and CLI use the same core:

~~~sh
npm run tui
npm run cli -- --help
npm run cli -- --version
npm run cli -- exec --auto --json "Inspect the project and write a summary"
~~~

The frontend uses Vite. After editing `react/`, run `npm run build:web` to update the `dist/` files served by the local Agent. `npm run dev:web` provides the frontend development server; /api requests need a proxy to the running local Agent. Use `node --watch server.mjs` for runtime development. See [TUI / CLI documentation](docs/TERMINAL.md) for terminal interaction, data directories and shared runtime behavior.

### Configuration and data

- `config.json`: providers, models, context budgets, permissions and MCP. Use [config.example.json](config.example.json) as a credential-free template.
- `MLI_AGENT_PORT` / `MLI_AGENT_HOST`: local HTTP service address; binds to `127.0.0.1` by default.
- `MLI_AGENT_DATA_DIR`: runtime configuration and user plugin directory; source mode defaults to the repository directory.
- `MLI_AGENT_WORKSPACE`: working directory; project sessions, memory and permission records live in its `.agent/` directory.

Desktop and TUI clients share configuration, user plugins and project sessions. Use separate `MLI_AGENT_DATA_DIR` directories for concurrent projects; the terminal also accepts `--data-dir` to select a data directory.

## Project layout

~~~text
core/          Runtime, model protocols, sessions, permissions, LSP, MCP, channels, scheduler
server.mjs     Local REST / SSE service and frontend static hosting
react/         React workbench and Vite frontend
cli/           CLI, OpenTUI / Solid terminal interface and non-interactive execution
electron/      Electron main process, preload bridge, runtime launcher and installers
plugins/       Tool implementations, Skills, language servers and channel adapters
scripts/       Checks, builds and cross-platform packaging
test/          Client unit and integration tests
docs/          Terminal, packaging and plugin development documentation
~~~

React, Electron and terminal clients access the runtime through local REST / SSE APIs. `core/loop.mjs` runs tasks, `core/stream.mjs` handles model streams, `core/session.mjs` persists sessions, `core/permissions.mjs` enforces authorization and `core/plugins.mjs` registers extensions.

## Extensions

### Skills and expert presets

A Skill describes methods, APIs and working constraints in Markdown. Use it to introduce an AIGC API or reuse writing and document workflows. The runtime discovers a Skill index; the Agent reads full instructions on demand. For a one-off integration, provide an accessible API documentation URL so the Agent can read the interface and call it through execution tools; turn the workflow into a Skill when you want to reuse it.

~~~text
skills/my-video-api/
  SKILL.md
  scripts/              Optional API calls and result processing
  references/           Optional API documentation and reference material
~~~

~~~markdown
---
name: my-video-api
description: Create video jobs, poll their status and download results through a specific API.
---

Describe the API URL, authentication environment variables, request and response schemas,
job states and output paths. Document failure handling and retry rules.
Manage credentials through environment variables.
~~~

Workspace Skills can live in `skills/`, `.agent/skills/` or `.agents/skills/`. Plugins may also include `skills/`. Expert presets add task-specific methods and prompt configuration for writing, editing or analysis.

### Tool plugins

Place a new execution capability in `plugins/<name>/`. Recommended layout:

~~~text
plugins/example/
  .codex-plugin/plugin.json
  plugin.mjs
  skills/               Optional
  assets/               Optional
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

Tool permissions are L0 for read-only operations, L1 for workspace writes, L2 for system execution and L3 for sensitive operations. Ask for user input with `ctx.requestUi`. Hooks include `authorize_tool_call`, `process_tool_result` and `on_event`; register cleanup with `ctx.registerCleanup`. Load or reload plugins through `POST /api/plugins/reload`.

Use `ctx.registerLanguageServer` and `ctx.registerChannelAdapter` to extend LSP and channels. LSP uses project or system servers first, then offers an authorized installation into the Agent cache when needed. JavaScript / TypeScript and Python are currently bundled as server definitions. See `plugins/lsp`, `plugins/feishu` and `plugins/dingtalk` for implementations.

User plugins live in the runtime data directory's `plugins/` folder and override bundled plugins of the same name. A root `plugin.json` remains supported. Skill-only plugins can omit `plugin.mjs`. See [plugin compatibility notes](PLUGIN-COMPATIBILITY.md).

### MCP

Declare stdio services in `config.json` under `mcp.servers`:

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

The runtime supports MCP tool discovery, descriptions and calls. Configure service processes and authentication to connect external data sources and tools to your Agent workflows.

## Build and deployment

~~~sh
# Local browser client: Node hosts the Agent and compiled frontend
npm run build:web
npm start

# Windows modern and compatibility editions
npm run dist:win
npm run dist:win:modern
npm run dist:win:legacy

# macOS PKG; build on macOS
npm run dist:mac -- --arch arm64

# Linux TUI / CLI with a standalone Node runtime
npm run dist:linux -- --arch x64
~~~

Artifacts are written to `release/` and take their version from the root `package.json`. Windows packaging includes build and launch verification. The modern edition targets Windows 10 / 11 x64; the compatibility edition targets Win7 SP1 / ia32 environments. See [Windows packaging](docs/WINDOWS-PACKAGING.md) for dependencies and verification, and [TUI / CLI documentation](docs/TERMINAL.md) for terminal packages.

The local runtime binds to loopback. Use SSH port forwarding to access the workbench for remote development.

## Tests and contributions

~~~sh
npm test
npm run check
npm run test:tui
npm run build:web
~~~

Contributions through issues and PRs are welcome. Include your platform, reproduction steps, scope and validation. Add focused tests for runtime, protocol and plugin interface changes; check streaming, approvals and session switching for UI changes. Manage development settings and credentials through local configuration files or environment variables.

## Acknowledgements and license

Thanks to [OpenCode](https://github.com/anomalyco/opencode), [Claude Code](https://github.com/anthropics/claude-code), [Pi Agent](https://github.com/earendil-works/pi) and [Cherry Studio](https://github.com/CherryHQ/cherry-studio) for ideas and inspiration in Agent engineering, interaction design and extensibility.

We also thank the following major open-source projects and their contributors for the foundations of this workbench:

- **UI and build tools**: [React](https://react.dev/), [Vite](https://vite.dev/) and [esbuild](https://github.com/evanw/esbuild).
- **Desktop and packaging**: [Electron](https://github.com/electron/electron) and [electron-builder](https://github.com/electron-userland/electron-builder).
- **Terminal interfaces**: [OpenTUI](https://github.com/anomalyco/opentui), [SolidJS](https://github.com/solidjs/solid) and [Terminal Kit](https://github.com/cronvel/terminal-kit).
- **Whiteboard creation**: [Excalidraw](https://github.com/excalidraw/excalidraw).
- **Code editing and terminal panels**: [CodeMirror](https://github.com/codemirror/dev), [React CodeMirror](https://github.com/uiwjs/react-codemirror) and [xterm.js](https://github.com/xtermjs/xterm.js).
- **Markdown and PDF**: [Streamdown](https://github.com/vercel/streamdown) and [PDF.js](https://github.com/mozilla/pdf.js).
- **Icons and QR codes**: [Lucide](https://github.com/lucide-icons/lucide) and [qrcode.react](https://github.com/zpao/qrcode.react).
- **Messaging channels**: [Feishu / Lark Node SDK](https://github.com/larksuite/node-sdk) and [DingTalk Stream SDK](https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs).
- **Media and document tools**: [FFmpeg](https://ffmpeg.org/) and [LibreOffice](https://www.libreoffice.org/).

Bundled third-party Skills, plugins and assets retain their own licenses and notices.

Project code is licensed under [Apache-2.0](LICENSE). Third-party components remain subject to their respective licenses.
