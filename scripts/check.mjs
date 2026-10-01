// scripts/check.mjs —— 语法 + 单元/集成自检（不启动 HTTP、不连真实模型）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { APP_ROOT, setWorkspaceRoot, resolveInWorkspace, resolveReadable } from '../core/paths.mjs';
import { readZip, writeZip } from '../plugins/office/lib/zip.mjs';
import { xlsxWrite, xlsxRead, xlsxSetCells, docxExtractText, docxReplace } from '../plugins/office/lib/ooxml.mjs';
import { setConfig, publicSettings, applyCatalogPatch, usageNumbers, usageCost } from '../core/llm.mjs';
import { parseOpenAIStream, parseResponsesStream, parseAnthropicStream } from '../core/stream.mjs';
import { loadAll, getTools, getTool, expandSlash, getSkills } from '../core/plugins.mjs';
import { authorize, resolveRequest, ruleMatch, pendingRequest } from '../core/permissions.mjs';
import { onEvent } from '../core/events.mjs';
import { DENY_PATTERNS } from '../core/tools.mjs';
import { Session } from '../core/session.mjs';
import { copyWorkspaceItem, createWorkspaceItem, deleteWorkspaceItem, listDirectory, moveWorkspaceItem, readWorkspaceFile, renameWorkspaceItem, writeWorkspaceFile } from '../core/workspace-files.mjs';
import { addAsset, assetDataUrl, deleteAsset, listAssets } from '../core/assets.mjs';
import { summarizeChanges, workspaceSnapshot } from '../core/task-summary.mjs';
import { deleteMemory, getMemory, listMemories, saveMemory } from '../core/memory.mjs';
import { buildSystemPrompt } from '../core/prompts.mjs';

let failed = 0;
function ok(name) { console.log(`  ✓ ${name}`); }
function fail(name, err) { failed++; console.error(`  ✗ ${name}: ${err?.message ?? err}`); }

async function syntaxCheck() {
  const files = [];
  function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules' || f.name === '.agent') continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.mjs')) files.push(p);
    }
  }
  walk(APP_ROOT);
  for (const f of files) {
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['--check', f], { windowsHide: true });
      let err = '';
      child.stderr.on('data', (d) => { err += d; });
      child.on('close', (code) => resolve({ code, err, f }));
    });
    if (r.code !== 0) fail(`syntax ${path.relative(APP_ROOT, f)}`, new Error(r.err.trim()));
  }
  if (!failed) ok(`syntax ${files.length} files`);
}

async function main() {
  console.log('\nMLI Agent 自检\n');

  await syntaxCheck();

  try {
    const entries = [{ name: 'a.txt', data: Buffer.from('hello 中文') }, { name: 'dir/b.xml', data: Buffer.from('<x/>') }];
    const buf = writeZip(entries);
    const back = readZip(buf);
    if (back.length !== 2) throw new Error('entry count');
    if (back.find((e) => e.name === 'a.txt').data.toString() !== 'hello 中文') throw new Error('roundtrip data');
    ok('zip roundtrip');
  } catch (e) { fail('zip roundtrip', e); }

  try {
    const xbuf = xlsxWrite([{ name: '数据', rows: [['姓名', '分数'], ['张三', 90], ['李四', 80]] }]);
    const sheets = xlsxRead(xbuf);
    if (sheets[0].name !== '数据') throw new Error('sheet name');
    if (sheets[0].rows[1][0] !== '张三') throw new Error(`read cell ${JSON.stringify(sheets[0].rows)}`);
    const edited = xlsxSetCells(xbuf, '数据', { B2: 95, C1: '备注' });
    const after = xlsxRead(edited.buffer);
    if (String(after[0].rows[1][1]) !== '95') throw new Error(`set B2 got ${after[0].rows[1][1]}`);
    if (after[0].rows[0][2] !== '备注') throw new Error('set C1');
    ok('xlsx write/read/set_cells');
  } catch (e) { fail('xlsx write/read/set_cells', e); }

  try {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello {{NAME}}</w:t></w:r></w:p></w:body></w:document>`;
    const docx = writeZip([{ name: 'word/document.xml', data: Buffer.from(xml) }]);
    if (!docxExtractText(docx).includes('Hello {{NAME}}')) throw new Error('extract');
    const r = docxReplace(docx, { '{{NAME}}': 'Ada' });
    if (!docxExtractText(r.buffer).includes('Hello Ada')) throw new Error('replace');
    if (r.count !== 1) throw new Error('count');
    ok('docx extract/replace');
  } catch (e) { fail('docx extract/replace', e); }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-ws-'));
  setWorkspaceRoot(tmp);
  try {
    const inside = resolveInWorkspace('sub/a.txt', { write: true });
    if (!inside.startsWith(tmp)) throw new Error('inside');
    let threw = false;
    try { resolveInWorkspace('..\\..\\Windows\\System32\\cmd.exe', { write: true }); } catch { threw = true; }
    if (!threw) throw new Error('expected jail on ..');
    threw = false;
    try { resolveInWorkspace('C:\\\\temp\\\\x', { write: true }); } catch { threw = true; }
    if (!threw) throw new Error('expected jail on abs outside');
    ok('path jail');
  } catch (e) { fail('path jail', e); }

  try {
    createWorkspaceItem('', 'src', 'directory');
    createWorkspaceItem('src', 'draft.txt', 'file');
    writeWorkspaceFile('src/draft.txt', 'hello workspace');
    if (readWorkspaceFile('src/draft.txt').content !== 'hello workspace') throw new Error('write/read mismatch');
    renameWorkspaceItem('src/draft.txt', 'note.txt');
    createWorkspaceItem('', 'archive', 'directory');
    moveWorkspaceItem('src/note.txt', 'archive');
    const names = listDirectory('archive').entries.map((x) => x.name);
    if (!names.includes('note.txt')) throw new Error('move missing');
    const copied = copyWorkspaceItem('archive/note.txt', 'archive');
    if (copied.name !== 'note copy.txt' || readWorkspaceFile(copied.path).content !== 'hello workspace') throw new Error('copy missing');
    let protectedDir = false;
    try { listDirectory('.agent'); } catch { protectedDir = true; }
    if (!protectedDir) throw new Error('.agent should be hidden');
    fs.writeFileSync(path.join(tmp, 'preview.xlsx'), xlsxWrite([{ name: '预览', rows: [['A', 'B'], [1, 2]] }]));
    const preview = readWorkspaceFile('preview.xlsx');
    if (preview.kind !== 'spreadsheet' || String(preview.sheets[0].rows[1][1]) !== '2') throw new Error('xlsx preview failed');
    deleteWorkspaceItem('archive');
    if (fs.existsSync(path.join(tmp, 'archive'))) throw new Error('delete failed');
    ok('workspace file management');
  } catch (e) { fail('workspace file management', e); }

  try {
    const before = workspaceSnapshot();
    fs.writeFileSync(path.join(tmp, 'summary-test.txt'), 'one\ntwo\n', 'utf8');
    const created = summarizeChanges(before);
    if (!created.some((item) => item.path === 'summary-test.txt' && item.status === 'created' && item.additions === 3)) throw new Error('created file summary');
    const asset = addAsset({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=', title: '测试图片' });
    if (!listAssets().some((item) => item.id === asset.id) || !assetDataUrl(asset.id).startsWith('data:image/png;base64,')) throw new Error('asset roundtrip');
    deleteAsset(asset.id);
    ok('assets and task summary');
  } catch (e) { fail('assets and task summary', e); }

  try {
    const memory = saveMemory({ title: '测试约定', content: '修改后运行 npm test。', tags: ['verification'], source: 'self-check' });
    if (!getMemory(memory.id)?.content.includes('npm test') || !listMemories().some((item) => item.id === memory.id)) throw new Error('memory roundtrip');
    const prompt = buildSystemPrompt({ tools: [{ name: 'list_memories' }], skills: [{ name: 'demo', description: 'demo skill' }], mode: 'default', desktopEnabled: false });
    const sections = ['# Identity', '# Agent 工作机制', '# 工具协议', '# 安全与权限', '# Skill Instructions', '# 项目记忆目录', '# 当前会话状态', '# 当前任务'];
    let cursor = -1;
    for (const section of sections) { const next = prompt.indexOf(section); if (next <= cursor) throw new Error(`prompt layer order: ${section}`); cursor = next; }
    if (!prompt.includes(memory.id) || !prompt.includes('调用 read_memory 获取正文')) throw new Error('memory catalog missing from prompt');
    deleteMemory(memory.id);
    if (getMemory(memory.id)) throw new Error('memory delete failed');
    ok('layered prompt and project memory');
  } catch (e) { fail('layered prompt and project memory', e); }

  try {
    const source = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-session-source-'));
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-session-target-'));
    setWorkspaceRoot(source);
    const session = Session.create('迁移测试');
    session.append({ type: 'message', role: 'user', content: '保留这条消息' });
    const saved = session.saveAttachments([{ name: 'pixel.png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }]);
    session.append({ type: 'message', role: 'user', content: [{ type: 'text', text: '看图' }, ...saved] });
    session.setMode('auto-all');
    session.moveToWorkspace(target);
    if (Session.load(session.id)) throw new Error('source still contains session');
    setWorkspaceRoot(target);
    const moved = Session.load(session.id);
    if (!moved || moved.title !== '迁移测试' || moved.mode !== 'auto-all' || !moved.messages().some((m) => m.content === '保留这条消息') || !moved.messages().some((m) => Array.isArray(m.content) && m.content.some((part) => part.type === 'image' && part.dataUrl.startsWith('data:image/png;base64,')))) throw new Error('moved session incomplete');
    ok('session workspace migration');
  } catch (e) { fail('session workspace migration', e); }

  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-session-replay-'));
    setWorkspaceRoot(root);
    const session = Session.create('运行过程回放');
    const turnId = 'turn-test';
    session.append({ type: 'message', role: 'user', content: '检查项目', turnId });
    session.append({ type: 'turn_start', turnId, prompt: '检查项目', startedAt: 1000 });
    session.append({ type: 'step_start', turnId, step: 0, startedAt: 1100 });
    session.append({ type: 'message', role: 'assistant', text: '我先读取文件。', toolCalls: [{ id: 'call-1', name: 'read_file', args: { path: 'README.md' } }], turnId, step: 0 });
    session.append({ type: 'tool_start', turnId, step: 0, callId: 'call-1', name: 'read_file', args: { path: 'README.md' }, startedAt: 1200 });
    session.append({ type: 'message', role: 'tool', toolCallId: 'call-1', content: 'ok', status: 'ok', turnId, step: 0 });
    session.append({ type: 'tool_end', turnId, step: 0, callId: 'call-1', name: 'read_file', status: 'ok', content: 'ok', startedAt: 1200, finishedAt: 1300, durationMs: 100 });
    session.append({ type: 'step_end', turnId, step: 0, text: '我先读取文件。', thinking: '先了解结构', status: 'ok', durationMs: 250 });
    session.append({ type: 'turn_end', turnId, reason: 'done', durationMs: 500, stepCount: 1, toolCount: 1 });
    session.append({ type: 'task_summary', turnId, reason: 'done', title: '任务已完成', durationMs: 500, stepCount: 1, toolCount: 1, files: [] });
    const loaded = Session.load(session.id);
    const types = loaded.snapshot().entries.map((entry) => entry.type);
    for (const type of ['turn_start', 'step_start', 'tool_start', 'tool_end', 'step_end', 'turn_end', 'task_summary']) if (!types.includes(type)) throw new Error(`missing ${type}`);
    const messages = loaded.messages();
    if (messages.length !== 3 || messages.some((message) => message.type?.startsWith('step_') || message.type?.startsWith('tool_'))) throw new Error('runtime entries leaked into model context');
    ok('session runtime timeline replay');
  } catch (e) { fail('session runtime timeline replay', e); }

  try {
    if (!DENY_PATTERNS.some((re) => re.test('format c:'))) throw new Error('format');
    if (!DENY_PATTERNS.some((re) => re.test('rm -rf /'))) throw new Error('rm');
    ok('bash denylist');
  } catch (e) { fail('bash denylist', e); }

  try {
    if (!ruleMatch({ tool: 'bash', pattern: 'git *' }, 'bash', 'git status')) throw new Error('glob');
    if (ruleMatch({ tool: 'bash', pattern: 'git *' }, 'bash', 'rm -rf')) throw new Error('non match');
    ok('permission glob rules');
  } catch (e) { fail('permission glob rules', e); }

  try {
    const skillDir = path.join(getWorkspaceRootForCheck(), 'skills', 'demo');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: demo-skill\ndescription: test skill\n---\n\nFollow this guide.', 'utf8');
    setConfig({ provider: { type: 'openai', baseUrl: 'http://127.0.0.1:1/v1', model: 'test', contextWindow: 32000 }, mcp: { servers: [] } });
    const info = await loadAll();
    const names = getTools().map((t) => t.name);
    for (const n of ['read_file', 'write_file', 'bash', 'grep', 'find', 'web_fetch', 'mcp', 'office_read', 'office_edit']) {
      if (!names.includes(n)) throw new Error(`missing tool ${n} (have ${names.join(',')})`);
    }
    if (!getSkills().some((s) => s.path.includes('office'))) throw new Error('office skill missing');
    if (!getSkills().some((s) => s.name === 'demo-skill')) throw new Error('workspace skill missing');
    const skillResult = await getTool('read_skill').run({ name: 'demo-skill' });
    if (!skillResult.content.includes('Follow this guide.')) throw new Error('read_skill failed');
    const help = expandSlash('/help');
    if (help.kind !== 'help') throw new Error('help');
    const report = expandSlash('/report 季度总结');
    if (report.kind !== 'expand' || !report.text.includes('季度总结')) throw new Error('slash expand');
    ok(`plugins load (${info.tools.length} tools)`);
  } catch (e) { fail('plugins load', e); }

  try {
    const settings = publicSettings();
    if (settings.protocols.map((x) => x.id).join(',') !== 'openai-chat,openai-responses,anthropic') throw new Error('protocol catalog');
    if (settings.providers.length !== 2 || settings.providers[0].id !== 'mli-managed' || settings.models.length !== 1) throw new Error('legacy migration');
    const sse = (frames) => new Response(frames.map((x) => `data: ${JSON.stringify(x)}\n\n`).join(''), { status: 200 });
    const collect = async (iter) => { const rows = []; for await (const item of iter) rows.push(item); return rows; };
    const openai = await collect(parseOpenAIStream(sse([{ choices: [{ delta: { content: 'ok' } }] }, { usage: { prompt_tokens: 1, completion_tokens: 2 }, choices: [] }])));
    if (!openai.some((x) => x.type === 'text_delta' && x.text === 'ok')) throw new Error('openai chat stream');
    const responses = await collect(parseResponsesStream(sse([{ type: 'response.output_text.delta', delta: 'ok' }, { type: 'response.completed', response: { usage: { input_tokens: 1, output_tokens: 2 } } }])));
    if (!responses.some((x) => x.type === 'text_delta' && x.text === 'ok')) throw new Error('responses stream');
    const anthropic = await collect(parseAnthropicStream(sse([{ type: 'message_start', message: { usage: { input_tokens: 1 } } }, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }, { type: 'message_delta', usage: { output_tokens: 2 } }, { type: 'message_stop' }])));
    if (!anthropic.some((x) => x.type === 'text_delta' && x.text === 'ok')) throw new Error('anthropic stream');
    const cached = await collect(parseAnthropicStream(sse([{ type: 'message_start', message: { usage: { input_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 } } }, { type: 'message_delta', usage: { output_tokens: 4 } }, { type: 'message_stop' }])));
    const counts = usageNumbers(cached.find((item) => item.type === 'usage')?.usage, {}, '');
    if (counts.promptTokens !== 10 || counts.cacheCreationTokens !== 2 || counts.cacheReadTokens !== 3) throw new Error('anthropic cache usage');
    const inclusiveCounts = usageNumbers({ prompt_tokens: 10, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 3 } }, {}, '');
    if (inclusiveCounts.promptTokens !== 10 || inclusiveCounts.cacheReadTokens !== 3) throw new Error('openai cache usage');
    const pricing = { inputPer1M: 5, outputPer1M: 10, cacheCreationPer1M: 6, cacheReadPer1M: 1, cacheCreationEnabled: true, cacheReadEnabled: true };
    if (usageCost({ promptTokens: 1e6, completionTokens: 1e6, cacheCreationTokens: 2e5, cacheReadTokens: 3e5 }, pricing) !== 14) throw new Error('cache price calculation');
    if (usageCost({ promptTokens: 1e6, completionTokens: 1e6, cacheCreationTokens: 2e5, cacheReadTokens: 3e5 }, { ...pricing, cacheCreationEnabled: false, cacheReadEnabled: false }) !== 15) throw new Error('disabled cache price calculation');
    ok('model protocols and config migration');
  } catch (e) { fail('model protocols and config migration', e); }

  try {
    setConfig({ providers: [{ id: 'p1', name: 'P1', protocol: 'openai-chat', baseUrl: 'http://localhost/v1' }, { id: 'p2', name: 'P2', protocol: 'anthropic', baseUrl: 'http://localhost/v1' }], models: [{ id: 'm1', providerId: 'p1', name: 'M1', model: 'm1' }, { id: 'm2', providerId: 'p2', name: 'M2', model: 'm2' }], activeModelId: 'm1' });
    applyCatalogPatch({ action: 'save_model', model: { id: 'm1', providerId: 'p1', name: 'M1', model: 'm1', pricing: { inputPer1M: 5, outputPer1M: 10, cacheCreationPer1M: 6, cacheReadPer1M: 1, cacheCreationEnabled: true, cacheReadEnabled: true } }, activate: false });
    if (publicSettings().models.find((model) => model.id === 'm1')?.pricing.cacheReadPer1M !== 1) throw new Error('cache price persistence');
    applyCatalogPatch({ action: 'delete_model', modelId: 'm1' });
    if (publicSettings().activeModelId !== 'm2') throw new Error('active model fallback failed');
    applyCatalogPatch({ action: 'delete_provider', providerId: 'p2' });
    const after = publicSettings();
    if (after.providers.some((p) => p.id === 'p2') || after.models.some((m) => m.providerId === 'p2')) throw new Error('provider cascade delete failed');
    ok('model catalog delete and fallback');
  } catch (e) { fail('model catalog delete and fallback', e); }

  try {
    const session = { id: 'test', mode: 'default', desktopEnabled: false };
    const unsub = onEvent((evt) => {
      if (evt.type === 'permission_request') {
        if (pendingRequest(session.id)?.reqId !== evt.request.reqId) throw new Error('pending permission not recoverable');
        resolveRequest(evt.request.reqId, 'allow');
      }
    });
    const r0 = await authorize({ session, tool: getTool('read_file'), args: { path: 'a' }, timeoutMs: 1000 });
    if (!r0.ok) throw new Error('L0 should auto');
    const r1 = await authorize({ session, tool: getTool('write_file'), args: { path: 'a.txt', content: 'hi' }, timeoutMs: 3000 });
    if (!r1.ok || r1.decision !== 'allow') throw new Error(`L1 ${r1.decision} ${r1.reason}`);
    const r3 = await authorize({ session, tool: getTool('screenshot') ?? { name: 'screenshot', permission: 'L3', capability: 'desktop' }, args: {}, timeoutMs: 500 });
    if (r3.ok) throw new Error('desktop L3 should block when disabled');
    unsub();
    ok('permission protocol');
  } catch (e) { fail('permission protocol', e); }

  try {
    resolveReadable(path.join(APP_ROOT, 'plugins', 'office', 'skills', 'office-guide.md'));
    ok('readable plugin skills');
  } catch (e) { fail('readable plugin skills', e); }

  console.log(failed ? `\n失败 ${failed} 项\n` : '\n全部通过\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

function getWorkspaceRootForCheck() { return resolveInWorkspace('.'); }
