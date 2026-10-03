import path from 'node:path';
import fs from 'node:fs';
import { formatDiagnostics, lspManager } from '../../core/lsp.mjs';
import { getWorkspaceRoot } from '../../core/paths.mjs';
import { typescriptLanguageServer } from './languages/typescript.mjs';
import { pythonLanguageServer } from './languages/python.mjs';

const OPERATIONS = [
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls',
];

function askInstall(ctx, session, definition) {
  return ctx.requestUi(session, 'confirm', {
    presentation: 'inline',
    title: `启用 ${definition.name} 代码检查`,
    text: '需要安装对应的语言服务器。',
    detail: '服务器会安装到 MLI Agent 的用户缓存，不会修改当前项目的 package.json。',
    confirmLabel: '安装并启用',
    cancelLabel: '暂不启用',
  });
}

function fileFromArgs(args) {
  const value = String(args?.path || '').trim();
  return value || null;
}

function diagnosticsForResult(result, file, diagnostics) {
  const block = formatDiagnostics(file, diagnostics);
  if (!block) return result;
  return { ...result, content: `${result.content || ''}\n\nLSP 诊断信息，请检查并修复：\n${block}`.trim() };
}

export default function setup(ctx) {
  ctx.registerLanguageServer(typescriptLanguageServer);
  ctx.registerLanguageServer(pythonLanguageServer);

  ctx.registerTool({
    name: 'lsp',
    description: '使用项目语言服务器获取代码定义、引用、类型悬停、符号和诊断信息。缺少服务器时会询问是否安装。',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: OPERATIONS, description: '要执行的 LSP 操作' },
        filePath: { type: 'string', description: '工作区内文件的相对或绝对路径' },
        line: { type: 'number', description: '行号，从 1 开始；workspaceSymbol/documentSymbol 可省略' },
        character: { type: 'number', description: '列号，从 1 开始；workspaceSymbol/documentSymbol 可省略' },
        query: { type: 'string', description: 'workspaceSymbol 的查询文本' },
      },
      required: ['operation', 'filePath'],
    },
    permission: 'L0',
    async run(args, toolCtx) {
      const operation = String(args?.operation || '');
      if (!OPERATIONS.includes(operation)) throw new Error(`不支持的 LSP 操作：${operation}`);
      const filePath = String(args?.filePath || '').trim();
      if (!filePath) throw new Error('filePath 不能为空');
      const result = await lspManager.query({
        ...args,
        operation,
        filePath,
        session: toolCtx.session,
        askInstall: ({ definition }) => askInstall(ctx, toolCtx.session, definition),
        signal: toolCtx.signal,
      });
      return { content: result == null || (Array.isArray(result) && result.length === 0) ? '没有找到结果。' : JSON.stringify(result, null, 2), data: result };
    },
  });

  ctx.registerTool({
    name: 'lsp_status',
    description: '查看当前工作区已注册和已连接的语言服务器状态。',
    parameters: { type: 'object', properties: {} },
    permission: 'L0',
    async run() { return { content: JSON.stringify(lspManager.status(), null, 2), data: lspManager.status() }; },
  });

  ctx.on('process_tool_result', async ({ session, tool, args, result, signal }) => {
    if (!['write_file', 'edit_file'].includes(tool.name) || result?.status === 'error' || result?.status === 'denied') return result;
    const relative = fileFromArgs(args);
    if (!relative) return result;
    const file = path.resolve(getWorkspaceRoot(), relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return result;
    try {
      const checked = await lspManager.touch(file, {
        session,
        signal,
        askInstall: ({ definition }) => askInstall(ctx, session, definition),
      });
      return checked.available ? diagnosticsForResult(result, relative, checked.diagnostics) : result;
    } catch {
      // LSP must never turn a successful file write into a failed tool result.
      return result;
    }
  });

  ctx.registerCleanup(() => lspManager.dispose());
}
