# GenOffice 本地编辑

桌面标准版在 DOCX、XLSX、PPTX、PDF 预览工具栏提供「编辑」，使用独立 WebContentsView 嵌入 GenOffice。返回预览会先执行上游保存检查，再重新加载工作区文件。退出应用、关闭窗口和安装更新也执行保存检查。

浏览器版保留现有预览与批注；Electron 22 兼容版不支持嵌入编辑。此阶段是本地文件编辑，不包含多人实时协同。四种嵌入编辑器右下角提供工作台 Agent 协作浮窗，通过受限 IPC 转发到现有会话，沿用工作台模型配置。顶部提供独立保存按钮。选中文档内容后，协作浮窗会保留选区，可清除选区或关闭“附带可见截图”。Word 发送节点范围及片段结构，Excel 发送工作表/区域、最多 20 行×10 列的值/公式/样式样本，PPT 发送页码及对象 ID/类型/边界，PDF 发送页码、文本及页面相对坐标。截图通过图片附件通路发送；PPT 在系统显示表面不可用时自动从自身画布导出同一区域，无需关闭截图。截图只覆盖可见部分，最长边限制为 1800 像素；大选区结构会明确标记截取。未选择内容时只发送文件路径和用户要求。发送前需先保存文档，Agent 读取磁盘上的文件；Agent 修改后需返回预览并重新打开编辑器加载新版本。嵌入编辑器不挂载上游 Friday 助手，相关工具栏与选区 AI 入口已移除，避免与工作台模型配置重复。

## 构建

源码固定为 `cheney-plus/happyoffice` 提交 `d9b77caf8a0f0cd7d536b1f549346db69a537044`，目录 `vendor/genoffice`；上游项目 https://github.com/genspark-ai/genoffice 。未使用 happy-friday-lite 的业务代码。

客户端源码导出不包含 vendor 和二进制资源；构建编辑器前需从上述提交恢复 vendor 源码并应用下述兼容修改。

本地兼容修改：Slides Vite 配置对 React/React DOM 去重；剪贴板格式探测兼容新 Electron。构建脚本将 PDF WASM 路径改为相对于模块目录，便于安装包移动。

需要 Node.js >=22.12、npm，以及构建 XLSX 引擎的 Rust/Cargo 和本机编译工具。

```sh
cd vendor/genoffice
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts
cd ../..
npm run build:office
npm run build:web
npm run electron
```

可按模块构建 `npm run build:office -- docs slides pdf`；各模块依赖共享的 docs 主进程设置通道，因此发行包需同时包含 docs。构建产物位于 `resources/genoffice`，作为桌面组件包随安装包复制，不会将开发用 node_modules 放进安装包。`npm run verify:office` 会校验四个编辑器、WASM、组件平台/架构以及 XLSX 原生文件；Windows 和 macOS 打包在校验失败时直接停止，禁止发布半成品。`npm run electron` 启动前会运行 `scripts/ensure-genoffice.mjs`：它先检查当前平台，再从 `.cache/genoffice/<platform>-<arch>` 恢复已构建组件；缓存不存在时才在本机安装 `vendor/genoffice` 的 npm 依赖并构建 Rust XLSX 引擎。每个平台与架构首次构建一次，后续启动复用缓存。

Web 资源可跨平台共用，但 XLSX 原生引擎必须在目标系统和架构上构建，不能把单一二进制用于所有系统。发布矩阵为 Windows x64、macOS x64、macOS arm64，各自在对应构建机生成组件包；Electron 22/Windows 兼容版和当前 Linux 终端版不包含嵌入编辑器。

### 平台切换与自动依赖准备

直接运行 `yarn electron` 或 `npm run electron`。启动前先检查组件清单，并真正启动 XLSX 引擎验证加载器和通信协议。已有当前平台组件时直接使用；否则保存原平台组件，从 `.cache/genoffice/<platform>-<arch>` 切换；缺少有效缓存才安装当前平台 npm 依赖并构建。构建和切换使用临时目录及进程锁，失败时保留原组件。中断后的无效缓存和失效锁会在下次启动恢复。

Windows 构建会读取原生文件实际架构，避免仅修改 `BUILD.json` 掩盖架构错误。MSVC 构建显式使用上游静态 CRT 配置；已有 LLVM MinGW 引擎如依赖 `libunwind.dll`，会自动获取 LLVM MinGW `20261020` 官方归档中的对应架构运行库，校验固定 SHA-256，缓存并随组件保留许可证。只在首次缺失运行库时联网下载，归档约 84 MB，不修改系统 PATH 或安装全局工具链。

当前 MLI 仓库和固定源码分支没有发布可直接下载的编辑器组件包；上游完整 GenOffice 安装程序不能直接替代本项目经过适配的嵌入组件。因此，**全新平台既无缓存也无本地 XLSX release 引擎时，仍需要 Rust/Cargo 和本机编译工具**。这与 npm 可自动下载平台包是两回事；后续要实现全新机器完全免编译，需要为适配后的组件建立按版本、平台和架构发布的预编译下载源。已有缓存的日常平台切换不需要重复编译。修改编辑器源码后使用 `npm run build:office` 显式重建；缓存用于平台恢复，不用于检测源码是否更新。

## 许可证

GenOffice 根目录为 Apache-2.0，保留原 LICENSE、NOTICE（如有）与 Unicode 许可。`ee/` 单独授权，本集成不引用它。第三方字体、PDF、WASM 等依赖仍受各自许可证约束；发行时须连同构建生成的依赖许可文件分发。依赖清单以 vendor 内的 package-lock.json 和 Cargo.lock 为准。

## 验证

`node --test test/genoffice.test.mjs test/genoffice-prepare.test.mjs` 验证文件路径边界、保存协调、平台缓存切换与刷新、构建失败保护、并发锁及原生架构。四种编辑器实际运行可用以下命令验证：

```sh
MLI_OFFICE_FIXTURES=/path/to/fixture-workspace node node_modules/electron/cli.js test/fixtures/genoffice-smoke.cjs
```

夹具目录应含 document.docx、workbook.xlsx、slides.pptx、report.pdf；脚本复制到临时工作区，不修改原文件。

2026-10-31 Windows x64 本机验证：13 项测试通过；四个组件构建完成，原生引擎协议检查与 `yarn electron` 启动通过。XLSX 编辑器已实际显示工作簿并通过选区结构检查，但完整冒烟在 Agent 截图捕获步骤失败（“当前文档截图不可用”），未验证后续保存步骤。macOS/Linux 本轮未进行真机验证。
