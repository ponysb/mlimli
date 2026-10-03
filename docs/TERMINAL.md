# Terminal Edition

Windows and macOS installers include both the desktop app and the `mli` command.
Linux packages contain the TUI/CLI, compatible plugins and a bundled Node.js runtime.
Released packages do not require a separate Node.js or Bun installation or a frontend build.
Modern TUI uses OpenTUI + Solid in a compiled Bun program; Node runs the shared Agent core.
Win7/ia32 keeps the Terminal Kit interface for compatibility.

## Development

```sh
npm ci
npm run test:tui
npm run tui
npm run cli -- exec --auto "Create hello.txt"
```

The source CLI uses the installed desktop app's user data directory; source `npm start`
continues to use repository configuration. Use `--data-dir PATH` for isolated configuration
and `--cwd PATH` for a project. Safe mock configuration initializes new directories;
existing configuration is never overwritten.

## Commands

```sh
mli
mli --cwd /srv/project
mli --resume
mli --resume SESSION_ID
mli config
mli models
mli model MODEL_ID
mli login
mli logout
mli exec "Check the project"
mli exec --auto --json "Create hello.txt"
mli serve
mli --connect http://127.0.0.1:PORT
```

Modern development builds the native TUI on first launch and rebuilds it when its source
changes. `npm run build:tui` also builds it explicitly. If lifecycle scripts were blocked
during installation, run `node node_modules/bun/install.js` once.

The home composer is centered. A session is created only when the first message is sent.
In a session the composer stays at the bottom. Drafts and cursor positions are preserved
across dialogs and session changes, and stored per project in the shared data directory.
The transcript renders streaming Markdown, collapsible thinking and tool results,
and permission previews. Scrolling up disengages automatic following.

Enter sends; Shift+Enter, Alt+Enter or Ctrl+J inserts a newline. Page Up/Down scrolls.
Up/Down recalls history at the input boundaries; Ctrl+Up/Down recalls it explicitly.
Typing `/` shows live completion; arrows choose, Tab inserts, Enter executes, Esc closes.
Ctrl+P opens the searchable command palette. Model and session dialogs also support search.
Ctrl+O expands/collapses tool output. Clicking a tool or thinking label toggles it individually.
Ctrl+C clears a nonempty draft; with an empty draft it exits. Double Esc within five seconds
interrupts a running task. Ctrl+D or `/exit` exits. Approval owns the composer area;
arrows or Tab select the decision, Enter confirms. Permanent rules require a second
confirmation showing the stored pattern. Plugin questions use the dialog input mode.

`/help` opens the command menu. Local commands: `/new`, `/resume`, `/model`,
`/config`, `/mode`, `/expert`, `/skills`, `/login`, `/logout`, `/compact`, `/stop`, `/exit`.
Other plugin slash commands run through the Agent. Credentials are masked in input forms.
Keys can use `MLI_API_KEY` instead of storage.

Legacy Terminal Kit keeps its original keys: Ctrl+C cancels, Ctrl+D exits,
and `/` opens a menu after Enter. Set `MLI_TUI_LEGACY=1` to select this fallback explicitly.

Non-interactive execution writes assistant text to stdout and operational output to stderr.
`--json` writes one event per line to stdout. Exit codes: 0 completed, 1 failed,
2 requires approval/input, 130 cancelled. `--auto` explicitly enables L1/L2 auto approval
for that session; sensitive tools and plugin questions still require interaction.

## Shared Runtime

Desktop and terminal clients share configuration, accounts, user plugins and project
`.agent/` sessions. One managed runtime per user data directory is discovered locally.
Clients hold renewable leases; the runtime stops when the last client leaves.
Crashed client leases expire after 90 seconds. `mli serve` holds a lease until interrupted.
For long SSH tasks use tmux or screen. History recovery does not restart interrupted tools.

The core currently has one active project per runtime. Switching projects during tasks is
blocked. A terminal bound to a previous project refuses further requests when another
client switches projects. Simultaneous projects require separate `--data-dir` directories.
A project lock prevents two managed runtimes from writing the same project.

Data directories:

- Windows: `%APPDATA%/MoliCreation` (legacy: `MoliCreationLegacy`).
- macOS: `~/Library/Application Support/MoliCreation`.
- Linux: `$XDG_CONFIG_HOME/MoliCreation` or `~/.config/MoliCreation`.

`--connect` accepts loopback HTTP origins only. The local service executes commands and
must not be exposed to the Internet.

## Packaging

```sh
npm run dist:win:modern
npm run dist:win:legacy
npm run dist:mac -- --arch arm64
npm run dist:mac -- --arch x64
npm run dist:linux -- --arch x64
npm run dist:linux -- --arch arm64
```

Modern Windows, macOS and Linux bundles contain the compiled TUI, relocatable OpenTUI
native/parser assets, third-party licenses, and Node 22.22.0, downloaded from nodejs.org
and verified against the official SHA-256 manifest. Legacy Windows uses its bundled
Electron Node 16 runtime with compatibility shims. Terminal Kit supports Node 16.
Legacy Windows fullscreen TUI requires an ANSI-capable terminal.
OpenTUI native packages are verified against npm registry integrity before cross compilation.
Build-only OpenTUI/Solid/Bun dependencies are excluded from installed node_modules.

Windows NSIS installs `mli.cmd` next to the executable and adds its installation directory
to the current user's PATH. Open a new terminal after installation. Uninstall removes only
that PATH entry and preserves user data. Portable packages support `./mli.cmd` directly.

macOS builds require a macOS host. PKG installs in `/Applications` and links
`/usr/local/bin/mli` to the bundled launcher. It refuses to replace an unrelated command.
Configure Developer ID signing/notarization through electron-builder for distribution.

Linux outputs `release/mli-VERSION-linux-ARCH.tar.gz` and a SHA-256 file. Extract to a
permanent directory, then run `sh install.sh`; it links `mli` into `~/.local/bin`.
Set `MLI_BIN_DIR` to choose another directory. The installer reports whether PATH needs
updating. Linux archives exclude Electron, the web build, private services and user data.
Bundled Node requires glibc Linux; Alpine/musl is not supported.

The interaction design was studied against
[OpenCode 8bb2ccf](https://github.com/anomalyco/opencode/tree/8bb2ccf82944eaec6c40b0bcdd03886bbfe86ef2/packages/tui).
The MLI core, HTTP API and configuration remain shared with the desktop application.

Office conversion needs LibreOffice on Linux; media tools need FFmpeg. Desktop automation
is Windows-only. External API/OAuth capabilities depend on configured plugins.
