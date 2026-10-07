# Windows 客户端打包

## 构建

在 Windows x64 上安装 Node.js 22.12 或更新版本，然后在项目根目录执行：

```powershell
npm ci
npm test
npm run dist:win
```

一条命令自动构建并验证两套安装包，最终文件直接位于 `release/`：

不想输入命令时，也可双击项目根目录的 `build-windows.cmd`。它会检查 Node.js 版本，在依赖未安装时执行 `npm ci`，然后运行同一个双版本打包命令。

- `MoliCreation-Modern-Setup-0.3.0-x64.exe`：现代版，Electron 44.4.5，面向 Win10 / Win11 64 位。
- `MoliCreation-Legacy-Win7-Setup-0.3.0-ia32.exe`：兼容版，Electron 22.3.27，面向 Win7 SP1 32/64 位及 Win10 32 位；64 位新系统也可通过 WOW64 运行。
- `SHA256SUMS.txt`：最终安装包的 SHA-256 校验值。

`npm run dist:win:all` 是上述命令的别名。分别构建：`npm run dist:win:modern`、`npm run dist:win:legacy`。默认不生成免安装包；需要时执行 `npm run dist:win -- --portable`。

每次成功构建后替换本次构建版本的旧安装包；单独构建一版不会删除另一版。全部选定版本构建和启动验证通过后才发布，不会因为构建失败而先删除已有安装包。不会删除源码压缩包或其他非打包脚本生成的文件。中间文件放在 `node_modules/.cache/mli-windows-packaging/`，成功后自动清理，不再往 `release/` 留下时间戳目录、解包文件、blockmap、日志或测试工作区。

只生成现代调试解包目录：`npm run pack:win`；兼容版：`node scripts/package-win.mjs --legacy --dir`。调试目录或失败构建的缓存会保留，命令输出其绝对路径，供检查；它们不会进入 `release/`。首次构建可能需要下载经过官方 SHA-256 校验的 Electron 22 ia32 和 NSIS 等工具。

兼容版前端目标为 Chromium 108，补齐标准 Web API；主进程和本地服务补齐 Node 16 的 Fetch、Web Streams、FormData 与数组 API，并用旧版 ESM loader 适配下载插件。兼容依赖编译进客户端，不依赖最终用户的 Node.js 或 node_modules。

## 包含范围

构建脚本先复用客户端源码导出白名单，再只提取 Electron 入口、本地 `server.mjs`、`core/`、内置插件、安全示例配置和已编译的前端。Electron 自带运行时，最终用户不需要安装 Node.js。

安装包不包含私有 `server/`（含 `server/website/` 官网）、开发者 `config.json`、`.env`、密钥、账户会话、聊天记录或工作区。本地 `server.mjs` 属于客户端运行时，不是私有账户后台。

### 后台地址与环境配置

构建前在项目根目录的 `.env` 中配置公开账户服务（不是 `server/.env`）：

```dotenv
MLI_ACCOUNT_SERVER_URL=https://你的后台域名
MLI_ACCOUNT_ENABLED=true
MLI_AGENT_PORT=3000
```

`npm run dist:win` 会把上述三个公开字段提取为 `resources/client/client-defaults.env`，现代版和兼容版使用相同配置；后台地址禁止包含账号密码、查询参数或片段。不会复制原始 `.env`，也不会提取 `MLI_ACCOUNT_APP_SECRET`、数据库密码、JWT、模型 Key 或其他变量。安装包使用已经编译入客户端的 dotenv 解析器，包含旧版 Node 16 运行时，不依赖用户机器上的 Node.js 或 node_modules。

运行时优先级：进程环境变量 > 用户数据目录的 `.env` > 安装包内的公开默认配置 > `config.json`。只覆盖运行时的环境配置，不重写已有 `config.json` 或历史数据。升级后若内置后台地址改变，未自行覆盖的用户会使用新地址；用户 `.env` 中的覆盖配置继续保留。现代版可在 `%APPDATA%/MoliCreation/.env` 覆盖后台地址和账户开关，兼容版为 `%APPDATA%/MoliCreationLegacy/.env`；改完完全退出客户端后重新打开。不要把服务端共享密钥发给用户。

Electron 的本地端口仍由操作系统自动分配，始终绑定 `127.0.0.1`；根目录 `MLI_AGENT_PORT` 只影响源码 Web 服务。打包后的应用不会读取开发项目目录的 `.env` 或私有后台的 `server/.env`。客户端源码开源导出仅包含 `.env.example`，不包含你的 `.env` 或安装包的公开默认配置；从开源源码构建时需自行配置。

Electron 窗口入口放在 `app.asar`，本地服务和插件文件放在 `resources/client/`，保证 PowerShell、Python 等工具能使用真实文件路径。打包结果不会隐藏客户端源码。

## 运行与数据

安装包同时提供独立终端入口 `mli.cmd`，安装程序将应用目录加入当前用户 PATH。安装后打开新的 PowerShell、CMD 或 Windows Terminal 即可运行 `mli`，无需先打开桌面窗口，也无需安装 Node.js。现代版自带独立 Node 22，兼容版使用随包的 Electron Node 16；兼容系统的全屏 TUI 需要支持 ANSI 的终端。命令与跨平台打包说明见 [终端版说明](TERMINAL.md)。

首次启动会自动创建默认工作区目录：现代版为 `%APPDATA%/MoliCreation/workspace/`，兼容版为 `%APPDATA%/MoliCreationLegacy/workspace/`。已有配置不会覆盖；默认目录初始为空，不会自动生成项目入口文件。可在客户端选择自己的项目目录。

项目终端使用 xterm.js 渲染，支持 ANSI 颜色、光标、文本选择复制、命令历史和 Ctrl+C 停止。每条命令在当前工作目录启动独立的 cmd/sh 进程，输出记录连续保留；Windows 的停止操作会终止该命令的子进程树。它不是持久化 PTY 会话，跨命令的 `cd`、环境变量和需要交互输入的 REPL/TUI 不在当前支持范围。

- 用户配置与日志：`%APPDATA%/MoliCreation/config.json`、`desktop.log`。
- 兼容版使用 `%APPDATA%/MoliCreationLegacy/`，安装标识、可执行文件与快捷方式也独立，避免覆盖现代版。两套不会自动迁移或共用配置；自行选择同一工作目录时，聊天数据仍属于该工作目录，不建议同时操作同一目录。
- 账户登录凭据：同目录下的 `account-session.json`。
- 工作目录注册表：同目录下的 `.agent/workspaces.json`。
- 默认工作区：同目录下的 `workspace/`；聊天与资源保存在所选工作区内的 `.agent/`。
- 下载插件：同目录下的 `plugins/`，不写安装目录；同名用户插件优先于内置版本。

首次运行从安全示例配置创建独立配置，保留不收费的 **mock 演示模型**，不包含开发者模型凭据。未配置构建 `.env` 时不要求官方账户；如配置了公开后台 URL 与账户开关，安装包会使用该公开配置连接账户服务。接入真实服务需配置供应商或登录官方账户；不要把服务端共享密钥嵌入客户端。

同一用户数据目录的桌面与终端复用一个回环服务，端口由操作系统分配，与源码版 3000 端口互不冲突。服务就绪后才打开窗口，最后一个客户端退出才停止服务。运行任务时不能切换项目，另一个数据目录也不能同时占用同一项目。卸载默认保留用户数据。

## 验证

```powershell
npm run pack:win
npm run verify:win -- "命令输出的调试目录/win-unpacked/MoliCreation.exe"
```

正常打包命令已自动执行启动验证。手动调试可使用上述命令。验证在新的隔离数据目录中启动真实打包应用，检查实际进程架构、Electron/Node/Chromium 版本、前端挂载、本地接口、内置插件与 Logo，执行 mock 文件写入和审批，关闭并重启应用，验证配置与会话持久化、后台服务退出。不会使用真实账户或收费模型。

在 Win11 x64 上运行 Electron 22 ia32，只能证明旧运行时与 32 位进程在当前机器上工作，不能替代 Win7 SP1 或 Win10 32 位系统的真实验证。正式宣称这些系统已经验证之前，必须补充对应测试机或虚拟机的安装、卸载、网络请求、文件审批和插件测试。

添加 `--keep-open` 可保留第二次启动的窗口供人工检查；关闭窗口后测试结束。验证记录位于被测 exe 同级的新 `verification-*` 目录。测试专用 `--mli-data-dir=` 和 `--mli-smoke-report=` 参数不影响普通启动。

安装器验证可使用静默安装到独立测试目录（`/S /D=<绝对目录>`，`/D` 必须是最后一个参数）。安装验证也应使用隔离数据目录，不覆盖日常安装。

## 发布注意事项

当前产物未签名，Windows 或安全软件可能显示未知发布者提示。正式发布应使用权利人自己的代码签名证书；证书密码和私钥只存放在本机安全环境或 CI 凭据中。脚本没有关闭任何 Windows 安全保护。

Electron 22、Node 16 与 Win7 均已停止安全维护。兼容版只用于明确需要旧系统的用户，不应替代现代版；没有关闭证书校验或操作系统安全措施。外部插件工具本身可能要求更新的 Windows，兼容壳不代表这些外部工具也支持 Win7。

Python、FFmpeg、LibreOffice、Office COM、Git、MCP 外部服务以及部分 Skill 所需工具不自动捆绑，相关功能需自行安装依赖。基础聊天、文件编辑与审批不依赖这些工具。

安装包携带根 Apache-2.0 许可证及已有第三方许可声明。公开发布前仍需核对第三方插件与品牌素材的授权；Windows 打包不等于已完成许可证审核。

## Windows 自动更新

### 调用记录加载失败后无法启动

旧版会在 HTTP 主线程同步扫描整个 `.agent/api-logs.jsonl`。重复保存图片等内联媒体可能使日志达到数 GB，扫描时本地服务无法响应接口和运行时心跳，随后显示“本地服务已停止”或“运行时连接超时”；没有异常堆栈不代表服务仍能响应。

日志查询与详情读取已改为独立 Worker，支持分页结果缓存和同请求合并。逆序读取限制单条历史记录为 4 MB，超过时跳过并返回提示，原文件保留；列表统计不包含跳过的记录。新日志只限制诊断快照（每段文本及整体大小有上限），内联媒体保存省略标记，模型实际请求、响应和用量计费不受影响。重新打包可将修复带入安装版。验证：`node --test test/api-log-recovery.test.mjs`。

Windows 安装版使用 `electron-updater`，复用账户后台的「版本发布」。窗口加载完成后立即自动检查，此后每 6 小时检查；也可以在「设置 → 应用更新」手动检查。无需打开设置或手动检查，发现新版后会在侧边栏底部账户区域上方显示版本入口，悬停、聚焦或点击入口可查看更新日志。点击下载图标可下载更新，下载完成后点击重启图标，安装程序静默覆盖原目录并重新启动。普通退出不会自动安装。

Windows 源码开发模式（`npm run electron`）也支持启动和手动检查，比较的是根 `package.json` 的版本，而非 Electron 引擎版本。设置页会明确显示开发模式；发现新版后仅提示版本与更新说明，不下载或自动安装，避免覆盖源码运行环境。安装更新需使用 Setup 安装版。修改 Electron 主进程代码后必须完全退出并重启客户端。

构建自有安装包时修改根 `package.json` 的版本并执行 `npm run dist:win`。现代版和兼容版保留构建生成的 Setup 文件名，自动更新需要匹配平台的版本清单、安装包及校验值。

更新服务地址沿用 `MLI_ACCOUNT_SERVER_URL`（或已有 `config.json` 的 `account.baseUrl`），与账户登录状态和账户开关无关。主进程读取与本地服务相同的公开配置，打包时配置根 `.env` 即可。更新源分别为：

- `/api/v2/releases/updates/windows-x64/latest.yml`
- `/api/v2/releases/updates/windows-legacy-ia32/latest.yml`

只选择已发布且本地文件存在的正式 Setup 安装包。只有网盘链接、便携版、预发布版本、文件名与版本不一致的包只保留官网手动下载功能；同一资源同时配置网盘和合格的本地 Setup 包时仍支持自动更新。下架新版本会回退到上一可用版本，但客户端不会自动降级。

应用会在安装前确认本地运行任务与终端命令均已结束，并要求其他共享本地服务的终端客户端退出。确认后停止本地服务，等待进程退出，再启动安装程序；用户数据和工作区继续保留。更新器会校验下载哈希，签名包还会按照构建生成的 `app-update.yml` 校验发布者。

首次接入：旧客户端没有更新器，需要手动安装一次包含更新器的新安装版。随后发布更高版本即可自动更新。macOS、Linux 和便携版暂不使用此 Windows 更新流程。

### 更新回归测试

```powershell
npm test
node --test test/desktop-update.test.mjs
```

客户端测试限制为 4 个并发文件，避免同时启动大量 Electron、Chromium 和本地服务导致超时。更新单元测试覆盖主窗口 IPC 校验、开发/安装版本显示、并发检查和下载、失败重试、任务及共享终端阻止安装，另在两套真实 Electron 引擎中验证下载及损坏文件拒绝。

上线时检查上述两个 `latest.yml` 地址：返回 YAML/JSON 更新清单表示已发布可用安装包；JSON 404 且提示「尚未发布可自动更新的安装版」表示需发布符合文件名规则的包；HTML 404 通常表示更新接口尚未部署或被反向代理路由拦截。已安装 `0.3.0` 客户端需要更高版本才能触发更新，同版本不会重复安装。
