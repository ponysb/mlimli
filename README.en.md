<h1 align="center">
  <img src="electron/assets/icon.png" alt="MLI Agent" width="64" valign="middle" /> MLI Agent
</h1>

<p align="center">
  <strong>A local Agent workbench that reads files, creates content, handles office work, and operates tools.</strong><br/>
  Choose a workspace, describe the outcome in plain language, and let the Agent execute and verify the task.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.4.4-245b43" alt="v0.4.4" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0" />
  <img src="https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-64748b" alt="Windows / macOS / Linux" />
</p>

<p align="center">
  <a href="README.md">简体中文</a> · English · <a href="https://github.com/ponysb/mlimli/issues">Issues</a> · <a href="docs/TERMINAL.md">Terminal</a>
</p>

<p align="center">
  <img src="docs/task-recovery-ui.png" alt="MLI Agent workspace" width="960" />
</p>

<p align="center">
  <strong>Code workspace (editor · Git · LSP)</strong> · <strong>TUI / CLI</strong> · <strong>Multi-agent orchestration</strong> · <strong>ACP clients</strong><br/>
  <strong>Personal assistant</strong> · <strong>Feishu / DingTalk</strong> · Office work · Content creation · Web and app operations
</p>

## What it can do

| Task | Try asking |
| --- | --- |
| Organize files | “Sort this folder by topic and create a linked index.” |
| Documents | “Turn these materials into a Word report and check the heading and table formatting.” |
| Spreadsheets | “Analyze this sales sheet, flag anomalies, add formulas, and create charts.” |
| Presentations | “Turn this proposal into a 10-slide presentation and keep the data sources.” |
| Writing | “Continue chapter three using the existing character notes and check continuity.” |
| Images and video | “Create a shot list, asset list, and generation prompts from this script.” |
| Web apps | “Open my authorized app, summarize today's tasks, and save the result in the project.” |
| Code and websites | “Run this project, fix the mobile layout, use LSP to check diagnostics and references, and verify the main interactions.” |
| Multi-agent orchestration | “Inspect auth, error handling, and test gaps in parallel; combine the evidence and propose fixes.” |
| Personal assistant | “Summarize my schedule and project progress every morning, and remind me when new messages arrive.” |

Tasks do not stop at a chat response. With your approval, the Agent can read and edit workspace files, run commands, use Skills and plugins, and save deliverables directly into the project.

## Get started

### 1. Install and open

Choose the build for your system from [Releases](https://github.com/ponysb/mlimli/releases). Windows and macOS packages include the desktop app and the `mli` command. Linux packages provide the TUI and CLI. Installed builds can check for updates under **Settings → App Updates**.

If no package is currently available, follow [Run from source](#run-from-source).

### 2. Configure a model

Open **Settings → Model Configuration → Add Model**, then enter:

- A protocol: OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages
- The API endpoint, API key, and model name
- Optional settings such as the context window

You can add several providers and switch models below the composer. Usage fees and data handling are determined by the provider you choose.

### 3. Add a workspace

Select **Add Workspace** and choose the folder for the task. Sessions, project memory, and outputs are organized around that folder, keeping separate projects isolated.

### 4. Describe the task

State the goal, source material, output format, and acceptance criteria. For example:

> Read the files under `research/` and create `weekly-report.docx`. Include progress, risks, next steps, and owners. List missing information instead of guessing. Reopen the finished file and check its layout.

The default **Manual Approval** mode asks before writing files, running commands, or performing sensitive actions. You can change the permission mode for uninterrupted work after checking the workspace and scope.

## Everyday operations

- **Add context:** select `+` beside the composer to reference files, folders, Skills, or plugins. Images can be dragged in directly.
- **Inspect results:** switch between Sessions and Files in the sidebar to preview outputs. Tool activity can be expanded when needed.
- **Revise:** continue in the same session with requests such as “Shorten section two to 300 words and keep the table unchanged.”
- **Work in parallel:** use **Delegate Task** so sub-agents can research, produce, or review independently while the main task collects their results.
- **Orchestrate multiple agents:** the main Agent can delegate to explorer, researcher, reviewer, and worker roles, run them asynchronously, wait for results, send follow-ups, or stop the group. Each task has its own context and reports back to the main task.
- **Schedule work:** create a Scheduled Task with its instructions, time, and workspace. Each run appears as a separate session.
- **Use it as a personal assistant:** combine project memory, history, schedules, and messaging channels so the Agent remembers preferences, follows up on work, and sends reminders.
- **Use experts and Skills:** choose an Expert for a working style. Skills are loaded only when relevant to the task.
- **Use signed-in websites:** add a site in App Center, sign in yourself, and confirm access before the Agent reads or operates the page.
- **Connect Feishu and DingTalk:** configure bot credentials, a workspace, and user / group allowlists under **Settings → Channels**. Start tasks from messages, receive results, and require an @mention in group chats.
- **Dictate or record meetings:** hold the microphone button to dictate; click it to record, transcribe, and summarize a meeting.
- **Manage memory:** review, edit, or disable saved preferences and project knowledge under **Settings → Memory**.
- **Use the terminal:** run `mli` for the TUI or `mli exec "task"` for a one-off job. See the [terminal guide](docs/TERMINAL.md) for all commands.

## Highlights

<table>
<tr>
<td width="50%" valign="top">

### Code workflow: editor, LSP, terminal

Code editing, the built-in terminal, Git, LSP diagnostics, and code navigation live in one workspace. Built-in language services currently cover TypeScript / JavaScript and Python, with definition, reference, hover, implementation, symbol, and call-hierarchy queries. Language servers can be installed locally when needed.

</td>
<td width="50%" valign="top">

### Bring your own model

Use three common model protocols, custom endpoints, and your own API keys. Configure multiple models and switch per task without being tied to one provider.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Context that lasts

Sessions stay local. Project memory applies only to its workspace, while global preferences can be reused. Memories can be reviewed, edited, disabled, and restored.

</td>
<td width="50%" valign="top">

### Multi-agent orchestration

The main Agent splits work into independent branches. Sub-agents research, write, and review in parallel with isolated contexts. See status, usage, and results in the panel, send follow-ups, stop tasks, and let the main task assemble the final answer.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Website sign-ins stay local

App Center keeps each login in an isolated embedded browser. Passwords, verification codes, and cookies are not given to the model, and page access requires your confirmation.

</td>
<td width="50%" valign="top">

### Personal assistant and messaging

Memory, scheduled tasks, meetings, and messaging channels turn MLI into a personal assistant: follow projects from the workbench, or receive reminders, send tasks, and read results through Feishu or DingTalk.

</td>
</tr>
</table>

### Terminal, ACP, and external clients

Use the same capabilities from the `mli` TUI / CLI with session resume, a command palette, permission approvals, and JSON output. Run `mli acp` to let an external ACP client create sessions, send prompts, receive tool events, and handle approvals. MLI can also delegate work to configured external ACP agents.

## Permissions and data

- Files, sessions, memories, and app sign-ins are stored locally by default.
- Context required for a task is sent to the model or tool service you configure. Review that service's data policy.
- In Manual Approval mode, read-only operations can proceed automatically; writes, commands, and sensitive actions ask first.
- Agent commands use a workspace sandbox. Commands are blocked if the sandbox is unavailable. Windows requires a one-time sandbox setup from Settings.
- App Center does not expose passwords, verification codes, cookies, or browser storage to the model. Publishing, deleting, purchasing, and similar actions still require explicit authorization.
- Third-party plugins and MCP services add trusted capabilities. Review their source and permissions before installing them.

For details, see [Runtime Sandbox](docs/SANDBOX.md), [App Center](docs/APP-CENTER.md), and [Delivery Quality](docs/CLIENT-QUALITY.md).

## Guides

- [Terminal and CLI](docs/TERMINAL.md)
- [LSP language services](docs/LSP.md)
- [Voice input and meetings](docs/VOICE-MEETINGS.md)
- [Memory](docs/MEMORY.md)
- [Sub-agents](docs/SUBAGENTS.md)
- [ACP integration](docs/ACP.md)
- [Plugin compatibility](PLUGIN-COMPATIBILITY.md)

## Run from source

Source builds require **Node.js 22.12 or later** and npm:

```sh
git clone https://github.com/ponysb/mlimli.git
cd mlimli
npm ci
cp config.example.json config.json
npm run build:web
npm run electron
```

On Windows PowerShell, use `Copy-Item config.example.json config.json` instead of `cp`. For browser mode, run `npm start` and open `http://127.0.0.1:3000`. Packaging and contribution details live in the [Windows packaging guide](docs/WINDOWS-PACKAGING.md), the [terminal guide](docs/TERMINAL.md), and the repository's development documentation.

## Community and support

<p>
  <a href="https://space.bilibili.com/7318180"><img src="https://img.shields.io/badge/Bilibili-Videos%20and%20guides-00A1D6?style=for-the-badge" alt="Bilibili" /></a>
  <a href="https://xhslink.cn/o/7exC6HysEHH"><img src="https://img.shields.io/badge/Xiaohongshu-Usage%20notes-FF2442?style=for-the-badge" alt="Xiaohongshu" /></a>
  <a href="electron/assets/dyh.png"><img src="https://img.shields.io/badge/WeChat-Scan%20to%20follow-07C160?style=for-the-badge" alt="WeChat" /></a>
  <a href="electron/assets/qq.png"><img src="https://img.shields.io/badge/QQ%20Group-Scan%20to%20join-12B7F5?style=for-the-badge" alt="QQ group" /></a>
</p>

Report problems and request features through [GitHub Issues](https://github.com/ponysb/mlimli/issues).

## License

MLI Agent is open source under the [Apache-2.0](LICENSE) license. Bundled third-party Skills, plugins, and assets retain their respective licenses and notices.
