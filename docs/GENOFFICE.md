# GenOffice 本地编辑

桌面标准版在 DOCX、XLSX、PPTX、PDF 预览工具栏提供「编辑」，使用独立 WebContentsView 嵌入 GenOffice。返回预览会先执行上游保存检查，再重新加载工作区文件。退出应用、关闭窗口和安装更新也执行保存检查。

浏览器版保留现有预览与批注；Electron 22 兼容版不支持嵌入编辑。此阶段是本地文件编辑，不包含多人实时协同。四种嵌入编辑器右下角提供工作台 Agent 协作浮窗，通过受限 IPC 转发到现有会话，沿用工作台模型配置。发送前需先保存文档，Agent 读取磁盘上的文件；Agent 修改后需返回预览并重新打开编辑器加载新版本。嵌入编辑器不挂载上游 Friday 助手，相关工具栏与选区 AI 入口已移除，避免与工作台模型配置重复。

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

可按模块构建 `npm run build:office -- docs slides pdf`；各模块依赖共享的 docs 主进程设置通道，因此发行包需同时包含 docs。构建产物位于 `resources/genoffice`，作为桌面组件包随安装包复制，不会将开发用 node_modules 放进安装包。`npm run verify:office` 会校验四个编辑器、WASM、组件平台/架构以及 XLSX 原生文件；Windows 和 macOS 打包在校验失败时直接停止，禁止发布半成品。

Web 资源可跨平台共用，但 XLSX 原生引擎必须在目标系统和架构上构建，不能把单一二进制用于所有系统。发布矩阵为 Windows x64、macOS x64、macOS arm64，各自在对应构建机生成组件包；Electron 22/Windows 兼容版和当前 Linux 终端版不包含嵌入编辑器。

## 许可证

GenOffice 根目录为 Apache-2.0，保留原 LICENSE、NOTICE（如有）与 Unicode 许可。`ee/` 单独授权，本集成不引用它。第三方字体、PDF、WASM 等依赖仍受各自许可证约束；发行时须连同构建生成的依赖许可文件分发。依赖清单以 vendor 内的 package-lock.json 和 Cargo.lock 为准。

## 验证

`node --test test/genoffice.test.mjs` 验证文件路径边界；四种编辑器实际运行可用：

```sh
MLI_OFFICE_FIXTURES=/path/to/fixture-workspace node node_modules/electron/cli.js test/fixtures/genoffice-smoke.cjs
```

夹具目录应含 document.docx、workbook.xlsx、slides.pptx、report.pdf；脚本复制到临时工作区，不修改原文件。
