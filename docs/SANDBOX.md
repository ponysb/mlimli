# 运行沙箱

沙箱限制模型生成的命令及其子进程能访问的文件、网络和进程。审批回答“允许执行这次调用吗”，沙箱回答“获准执行后最多能做什么”。`auto-all`、人工批准、永久允许规则都不会扩大沙箱权限。命令黑名单保留为辅助防线，真正的边界由操作系统或容器执行。

## 已接入的能力

- 默认 `workspace-write`：命令仅可修改映射的工作区及隔离临时目录。
- `read-only`：命令不能修改工作区，Agent 的 L1 工具及文件路径写入也被阻止。
- 默认禁止命令联网。模型 API、用户批准的网页查询及其他受信任宿主工具使用独立的连接，不会因此离线。
- 子进程不继承模型密钥、代理令牌、`NODE_OPTIONS` 或动态加载注入变量。Docker CLI 的宿主连接环境和容器环境独立。
- 保护现有 `.agent`、`.security`、`.codex`、`.ssh`、`.aws`、`.gnupg`；隐藏现有 `.env` / `*.env.*`、`.npmrc`、`.netrc`、私钥和工作区根 `config.json`。`.env.example` / `.sample` / `.template` 可读。
- 现有 `.git` 和 `.agents` 在命令沙箱中只读；普通项目文件保持可写。Git 提交、分支修改等需要宿主可信工作流，不能通过批准绕过。
- 文件工具验证真实路径与最近存在的父目录，阻止符号链接、junction、盘符切换、Windows 设备路径和备用数据流逃逸。硬链接可能关联未挂载的宿主文件，因此工具拒绝访问硬链接文件，命令启动前也拒绝带硬链接的工作区。
- 后端缺失、镜像缺失、策略不合法和隔离启动失败都阻止执行，不自动改用宿主 shell。
- 每次调用快照策略；文件工具使用独立异步执行上下文，不影响用户手动编辑。运行中的任务不能通过设置 API 修改策略。
- 命令取消、超时及退出时清理进程组；Docker 删除具名容器，覆盖后台子进程。命令输出和捕获内存都有上限。

## 平台实现与启用

Linux 自动使用 Bubblewrap：新 user / PID / mount / IPC / network 命名空间、移除 capabilities，挂载必要系统工具为只读，工作区映射到 `/workspace`，临时目录使用私有 tmpfs。需要系统安装 `bubblewrap` 并允许创建用户命名空间。此实现没有添加自定义 seccomp 过滤器；需要更强 syscall 限制或 CPU/内存/PID 限额时选择 Docker 后端。

macOS 自动使用系统 `/usr/bin/sandbox-exec` 和 Seatbelt profile，默认拒绝访问，只开放系统工具、工作区及本次调用的临时目录，保护路径使用显式 deny，网络默认拒绝。此后端没有容器的 CPU/内存/PID 限额，不开放整个用户主目录。

Windows 自动选择 `windows-native`，接入 Apache-2.0 开源的 [Anthropic Sandbox Runtime](https://github.com/anthropics/sandbox-runtime)，依赖锁定 `@anthropic-ai/sandbox-runtime@0.0.78`。已经核查 npm 发布包包含 x64 / arm64 的 `srt-win.exe`，不是仅根据 main 分支文档推断。该 Windows 后端仍标记 **Alpha**。不需要 Docker 或 WSL，命令继续采用原生 cmd 语法和宿主工作区路径。

Windows 桌面客户端可在 **设置 → 权限配置 → 运行沙箱 → 安装沙箱** 直接安装。程序已经随客户端依赖附带，不需要额外联网下载；安装前验证架构和锁定的 SHA-256，再请求一次 Windows 管理员授权。界面显示等待授权/安装、取消和失败状态，完成后重新检测；安装不会自动改变隔离模式、联网开关或域名白名单。

只有桌面主窗口的本地页面可以请求安装，系统安装不暴露为网页 API 或 Agent 工具。开始前检查正在运行的任务/终端，安装时持有与原生命令共用的互斥锁；重复点击不重复启动。打开设置和“重新检测”不启动安装。当前 helper 支持 Windows x64 / arm64；不支持的架构或校验失败不会显示可执行的安装按钮。浏览器版保留手动操作说明。

也可手动运行（安装器请求一次 UAC 授权）：

```powershell
node scripts/setup-windows-sandbox.mjs install
```

安装器创建专用低权限 `srt-sandbox` 账户、`sandbox-runtime-users` 组及针对该账户 SID 的 Windows Filtering Platform（WFP）出站过滤规则。凭据由上游使用机器级 DPAPI 存储并通过注册表 ACL 保护；MLI 不处理或保存该账户密码。检测接口和 Agent 命令不会隐式调用安装器。查看安装状态和卸载：

```powershell
node scripts/setup-windows-sandbox.mjs status
node scripts/setup-windows-sandbox.mjs uninstall
```

按钮接入回归覆盖 Electron IPC、本地运行时预检查及模拟的 UAC 取消结果，不触发系统账户/网络规则安装。这些测试不代表已完成真实管理员安装与安装后命令隔离实测；相关自动检查位于 `test/sandbox-setup.test.mjs`。

每次执行使用独立可信 Node broker，校验随发布包锁定的 native helper SHA-256，然后由上游进行账户及 WFP 的实际检查、添加工作区读写 ACL、敏感路径拒绝 ACL，再以沙箱账户的受限令牌和 Windows job object 启动命令。调用结束会 reset 上游策略、撤回会话 ACL。取消优先请求 broker 清理，超过 8 秒则强制结束；强制结束遗留的 ACL 由上游下次初始化恢复。沙箱账户使用自己的 profile、临时目录及 HKCU，不接收模型账户密钥。

Windows 原生后端的网络经 HTTP/SOCKS 代理控制，开启 `networkAccess` 后还需配置 `allowedDomains`（例如 `registry.npmjs.org:443`、`*.github.com`）。默认空白名单阻止所有代理请求，`strictAllowlist` 禁止动态扩大域名权限。WFP 拦截绕过代理的直接连接；系统 DNS 服务仍可能替该账户完成解析，**这不是完全无网络信息泄露的离线环境**。上游还说明共享机器上的本地账户可能观察代理凭据；此 Alpha 后端适合单用户开发环境，不承诺多租户隔离。

文件权限是 Windows ACL 模型：拒绝读取宿主用户主目录并重新授予项目目录权限，不是 Linux 空根文件系统。系统文件及其他已经向沙箱账户/Everyone 开放的目录可能可读；不要用它运行需要强多租户隔离的任务。安装于用户 profile 内的 Node、Python、Scoop 等工具通常不可访问；优先使用机器级安装。本实现不自动开放整个 profile 来解决工具缺失。

上游所有 Windows 会话使用同一个沙箱 SID，ACL 是账户权限。MLI 使用同一 Windows 用户下的独占 named pipe 作为跨运行时锁，互斥执行原生命令，并在结束清理后释放；进程崩溃时内核也会释放 pipe，避免残留 PID 锁及并发清理竞争。**不要同时在其他应用或其他 Windows 用户下使用同一个 srt-sandbox 账户运行敏感任务**；MLI 的锁不能约束它们。需要并行且彼此隔离的任务，选择独立容器/虚拟机或分别配置账户的方案。

Docker 是手动选择的可选后端，Windows 使用 Docker Desktop 的 **Linux 容器**。容器仅绑定当前工作区，不绑定用户主目录、运行时凭据或 Docker socket；文件系统默认只读，移除全部 capabilities，禁止获得新权限，限制 PID 为 128、内存为 1 GB、CPU 为 2，默认 `--network none`。Windows 容器内用户为 `1000:1000`；Unix 使用当前用户 UID/GID。始终使用 Docker 的本地 `default` context，不使用远程 context，不自动拉取镜像。

仅在选择 Docker 时，安装并启动 Docker，然后在项目源代码目录运行一次：

```powershell
node scripts/build-sandbox-image.mjs
```

这一步构建 `mli-agent-sandbox:1`，包含 Node 22、npm、Git、Python 3、ripgrep、Bash 和 CA 证书。首次构建需要联网下载基础镜像与软件包；执行任务时不会偷偷拉取镜像。Docker Desktop 的工作区文件共享必须已获准。

进入 **设置 → 权限配置 → 运行沙箱**，重新检测并保存策略。仅 Docker/Bubblewrap 的 Agent 命令使用 `/bin/sh` 与 `/workspace`，请使用 Linux 命令及工作区相对路径。Windows 原生后端使用 cmd 和真实项目路径。文件工具仍使用宿主工作区路径。选择 Docker 时 Windows 的原生 `node_modules` 可能包含不兼容 Linux 的模块，建议在容器内安装依赖；写入工作区的文件真实保留，不是自动回滚的副本。

沙箱设置保存在用户数据目录 `.security/sandbox.json`，由宿主设置入口修改并在重启后保留，不读取项目中的沙箱覆盖文件。`config.example.json` 的 `security.sandbox` 提供首次启动默认值。已有用户升级后也默认启用工作区沙箱；没有可用后端时仍能聊天及使用获准的文件工具，但命令会被阻止。关闭沙箱是单独的显式选项，关闭后的命令保留环境清理但使用宿主用户权限。

Windows 原生后端的 `networkAccess: true` 还受 `allowedDomains` 白名单约束。Docker/Bubblewrap/Seatbelt 的此开关仍是粗粒度允许其可达网络，本机服务也可能可达。其他后端不能执行域名白名单，带白名单并开启联网时会明确拒绝执行，不会静默放宽。切回关闭后后续命令重新隔离网络。

## 当前安全边界

本版本隔离的是 **Agent shell 和通过公共文件路径 API 的工具访问**，不是整个 Agent 进程。已安装插件的模块和钩子、MCP 服务器、语言服务、Office/FFmpeg 辅助进程、桌面控制、用户手动终端、附件/媒体下载仍是受信任的宿主能力。原生插件直接使用 `fs` / `child_process` 可以在宿主运行；不要把它们当成沙箱中的不可信代码。插件不能替换核心工具，公共文件路径 API 的写入/保护限制仍然生效。

`verify_document` / `verify_media` 也是受信任宿主辅助能力：输入经过文件路径 API，程序参数用数组传入，子进程使用清理过的环境和独立临时目录。文档 Chromium 使用独立隐藏会话、关闭 Node integration、开启 Chromium renderer sandbox 并拒绝外部网络；LibreOffice 使用独立 profile 和宏安全配置，FFmpeg 限制媒体协议为本地 file/pipe。这些措施不把 LibreOffice/FFmpeg 进程变成 Agent shell 的 OS 沙箱，也不承诺文档解析器漏洞隔离。远端任务不能借这些宿主工具验证远端文件。

工作区来自用户授权，隔离不防止修改普通项目文件、业务逻辑错误、恶意代码写入、内核漏洞或磁盘空间耗尽。保护命令启动时已经存在的秘密文件，不保证识别任意业务凭据或启动后被其他宿主进程新增的秘密。任务过程中不要由其他程序向同一工作区写入秘密或改变受保护路径。源码安装目录同时作为任务工作区时，普通运行时代码仍属于可编辑项目文件；生产分发应使用独立的用户工作区。

正常取消和超时会删除 Docker 容器。机器断电、运行时被强制结束或 Docker daemon 无响应时不能保证清理；容器有 `mli-agent.sandbox=true` 标签，可用 Docker 管理界面检查并移除残留容器。Windows 原生后端来自上游的独立账户、受限令牌、ACL 与 WFP 实现，不是 AppContainer；它有自己的 Alpha 限制。

下一阶段若要隔离不可信插件，需要把插件、MCP 和语言服务移出主进程，使用进程/容器 RPC 与最小能力接口；仅增加工具审批不足以形成这个边界。

## 验证

```powershell
node --test test/sandbox.test.mjs test/sandbox-http.test.mjs
```

覆盖路径逃逸、保护路径及别名、硬链接、只读工具、无后端不降级、环境清理、配置持久化、取消与超时。真实后端行为测试必须在相应平台启用，未启用会明确跳过：

```powershell
$env:MLI_SANDBOX_INTEGRATION = 'docker'
node --test test/sandbox.test.mjs
Remove-Item Env:MLI_SANDBOX_INTEGRATION
```

Linux/macOS 可设置为 `bubblewrap` / `seatbelt`，已安装原生后端的 Windows 可设置为 `windows-native`。真实测试尝试读取宿主文件和 `.env`、写入宿主文件、访问 localhost、保留后台子进程，并验证正常工作区写入和只读写入拒绝。

本次开发机尚未运行管理员安装。已实际验证发布 helper 的完整性、未安装时拒绝执行且不会写出命令目标、broker 回收及配置 API；已安装状态下的 ACL、WFP 和进程 job 隔离尚未在本机验证，不应把单元测试通过当作这些系统行为已通过验证。

## 参考依据（2026-10-03）

OpenCode 最新发布核对为 [v1.18.34](https://github.com/anomalyco/opencode/releases/tag/v1.18.34)。[权限文档](https://opencode.ai/docs/permissions/)提供 allow/ask/deny、外部目录和敏感文件规则；[该发布的 Bash 源码](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/core/src/tool/bash.ts)明确描述使用宿主用户的文件、进程和网络权限，外部路径扫描只是提示。本实现借鉴其审批结构，没有把它当作 OS 沙箱。

Pi 最新发布核对为 [v1.0.0](https://github.com/earendil-works/pi/releases/tag/v1.0.0)。[安全文档](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/security.md)说明默认使用启动用户权限；[沙箱扩展示例](https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/examples/extensions/sandbox/index.ts)通过 `@anthropic-ai/sandbox-runtime` 使用 Linux Bubblewrap / macOS Seatbelt，并支持域名代理规则。这个 Pi 示例自身仍限制 Linux/macOS，并可能在不可用时回退普通 Bash，不能把运行时新增加的 Windows 支持等同于 Pi 示例已支持 Windows。本实现直接接入运行时的 Windows 发布能力，采用后端失败就拒绝的策略。

[Codex 官方审批与安全文档](https://learn.chatgpt.com/docs/agent-approvals-security)把审批和沙箱作为独立配置，Linux 使用 Bubblewrap + seccomp，macOS 使用 Seatbelt；[Windows 官方文档](https://learn.chatgpt.com/docs/windows/windows-sandbox)介绍独立沙箱用户、ACL、受限令牌与网络约束。本实现借鉴其工作区/只读策略与防静默降级设计；Windows 使用 Anthropic 的开源运行时，没有复用或冒充 Codex 的原生实现。
