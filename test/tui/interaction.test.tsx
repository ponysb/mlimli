import { afterEach, describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/solid';
import { App } from '../../cli/modern/app';
import { TuiController } from '../../cli/modern/controller.mjs';
import { emptySession } from '../../cli/modern/state.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import launcher from '../../electron/runtime.cjs';
import { RuntimeClient } from '../../cli/client.mjs';

const cleanups: (() => void)[] = [];
afterEach(async () => {
  // Allow parser worker callbacks to settle before destroying their native renderer.
  await Bun.sleep(75);
  for (const cleanup of cleanups.splice(0)) cleanup();
});
async function screen(width = 90, height = 30) {
  const calls: any[] = [];
  const client = { async request(url: string, body?: any) {
    calls.push({ url, body });
    if (url === '/api/info') return { models: [{ id: 'mock', name: '本地测试模型' }], activeModelId: 'mock' };
    if (url === '/api/sessions') return { sessions: [{ id: 'history', title: '测试会话' }] };
    if (url === '/api/session' && body) return { id: 'created', title: body.title };
    if (url === '/api/session/created' || url === '/api/session/history') return { id: url.split('/').at(-1), title: '测试会话', entries: [], running: false };
    return {};
  } };
  const controller = new TuiController(client, { cwd: 'C:\\Projects\\工作区' });
  controller.connected = true;
  controller.ready = true;
  controller.info = { models: [{ id: 'mock', name: '本地测试模型' }], activeModelId: 'mock' };
  let refs: any;
  const setup = await testRender(() => <App controller={controller} onReady={value => { refs = value; }} />, { width, height, kittyKeyboard: true });
  cleanups.push(() => { controller.close(); setup.renderer.destroy(); });
  await setup.flush();
  return { ...setup, controller, calls, refs };
}

describe('OpenTUI input modes', () => {
  test('home accepts Chinese and sends only after Enter', async () => {
    const s = await screen();
    expect(s.captureCharFrame()).toContain('魔力工作台');
    expect(s.calls).toHaveLength(0);
    await s.mockInput.typeText('你好');
    await s.flush();
    expect(s.refs.editor.plainText).toBe('你好');
    s.mockInput.pressEnter();
    await s.waitFor(() => s.calls.some(item => item.url.endsWith('/message')));
    expect(s.calls.find(item => item.url.endsWith('/message')).body.text).toBe('你好');
    expect(s.controller.session.id).toBe('created');
    await s.waitFor(() => !s.controller.busy);
    await s.flush();
    expect(s.captureCharFrame()).toContain('● 就绪');
  });
  test('slash completion opens a searchable model dialog and restores focus', async () => {
    const s = await screen();
    await s.mockInput.typeText('/mo');
    await s.flush();
    expect(s.captureCharFrame()).toContain('/model');
    s.mockInput.pressEnter();
    await s.waitFor(() => s.controller.dialog !== null);
    await s.flush();
    expect(s.captureCharFrame()).toContain('本地测试模型');
    expect(s.captureCharFrame().split('\n').filter(line => line.includes('│')).length).toBeLessThan(15);
    await s.mockInput.typeText('不存在');
    await s.flush();
    expect(s.captureCharFrame()).toContain('没有匹配项');
    s.mockInput.pressEscape();
    await s.flush();
    await s.mockInput.typeText('继续');
    expect(s.refs.editor.plainText).toBe('继续');
  });
  test('palette preserves draft and cursor; clicking transcript does not steal typing', async () => {
    const s = await screen();
    await s.mockInput.typeText('abcd');
    s.mockInput.pressArrow('left');
    s.mockInput.pressKey('p', { ctrl: true });
    await s.waitFor(() => s.controller.dialog !== null);
    await s.flush();
    s.mockInput.pressEscape();
    await s.flush();
    await s.mockInput.typeText('X');
    expect(s.refs.editor.plainText).toBe('abcXd');
    s.controller.session = { ...emptySession('test'), title: '会话', parts: [{ id: 'm', kind: 'user', text: '已有消息' }] };
    s.controller.changed();
    await s.flush();
    await s.mockMouse.click(5, 4);
    await s.mockInput.typeText('Y');
    expect(s.refs.editor.plainText).toContain('XY');
  });
  test('multiline paste is draft; modal password never renders plaintext', async () => {
    const s = await screen();
    await s.mockInput.pasteBracketedText('中文\n/exit');
    await s.flush();
    expect(s.refs.editor.plainText).toBe('中文\n/exit');
    expect(s.calls).toHaveLength(0);
    const password = s.controller.ask('密码', { secret: true });
    await s.flush();
    await s.mockInput.typeText('private-value');
    await s.flush();
    expect(s.captureCharFrame()).not.toContain('private-value');
    expect(s.captureCharFrame()).toContain('*************');
    s.mockInput.pressEnter();
    expect(await password).toBe('private-value');
    await s.flush();
    expect(s.refs.editor.plainText).toBe('中文\n/exit');
  });
  test('approval takes input; permanent rule needs confirmation; external resolution dismisses it', async () => {
    const s = await screen();
    await s.mockInput.typeText('保留草稿');
    s.controller.session = { ...emptySession('test'), running: true, permission: { reqId: 'r', tool: 'bash', summary: 'echo hi', levelLabel: '系统执行', rememberPattern: 'echo hi' } };
    s.controller.changed();
    await s.flush();
    s.mockInput.pressArrow('right');
    s.mockInput.pressArrow('right');
    s.mockInput.pressArrow('right');
    s.mockInput.pressEnter();
    await s.waitFor(() => s.controller.dialog !== null);
    expect(s.calls.some(item => item.url.includes('/permission/'))).toBe(false);
    s.controller.event({ type: 'permission_resolved', sessionId: 'test', reqId: 'r', seq: 1 });
    await s.flush();
    expect(s.controller.dialog).toBeNull();
    await s.mockInput.typeText('！');
    expect(s.refs.editor.plainText).toBe('保留草稿！');
  });
  test('Ctrl+C clears draft and double Escape aborts an active task', async () => {
    const s = await screen();
    let exits = 0;
    s.controller.onExit = () => exits++;
    await s.mockInput.typeText('draft');
    s.mockInput.pressCtrlC();
    expect(s.refs.editor.plainText).toBe('');
    expect(exits).toBe(0);
    s.controller.session = { ...emptySession('test'), running: true };
    s.controller.changed();
    s.mockInput.pressEscape();
    expect(s.calls).toHaveLength(0);
    s.mockInput.pressEscape();
    await s.waitFor(() => s.calls.some(item => item.url.endsWith('/abort')));
  });
  test('resize keeps a persistent editor and draft on a narrow screen', async () => {
    const s = await screen();
    await s.mockInput.typeText('输入保持不变');
    const editor = s.refs.editor;
    s.resize(38, 16);
    await s.flush();
    expect(s.refs.editor).toBe(editor);
    expect(s.captureCharFrame()).toContain('输入保持不变');
    expect(s.captureCharFrame()).toContain('魔力工作台');
    s.resize(120, 36);
    await s.flush();
    expect(editor.plainText).toBe('输入保持不变');
  });
  test('plugin completion sends to the Agent and narrow dialogs remain operable', async () => {
    const s = await screen(38, 16);
    s.controller.info.commands = [{ name: '/report', description: '生成报告' }];
    await s.mockInput.typeText('/rep');
    await s.flush();
    expect(s.captureCharFrame()).toContain('/report');
    s.mockInput.pressEnter();
    await s.waitFor(() => s.calls.some(item => item.url.endsWith('/message')));
    expect(s.calls.find(item => item.url.endsWith('/message')).body.text).toBe('/report');
    await s.waitFor(() => !s.controller.busy);
    const chosen = s.controller.choose('选择一个长名称模型', [{ label: '测试模型ABCDEFGHIJKLMNOPQRSTUVWXYZ', detail: '服务商说明', value: 'chosen' }]);
    await s.flush();
    expect(s.captureCharFrame()).toContain('选择一个长名称模型');
    s.mockInput.pressEnter();
    expect(await chosen).toBe('chosen');
  });
  test('tool expansion survives text deltas and scrolling preserves the viewport', async () => {
    const s = await screen();
    s.controller.session = { ...emptySession('test'), title: '执行任务', running: true };
    s.controller.event({ type: 'tool_call', sessionId: 'test', turnId: 't', seq: 1, call: { id: 'c', name: 'bash', args: { command: 'echo output' } } });
    s.controller.event({ type: 'tool_output', sessionId: 'test', seq: 2, name: 'bash', text: 'visible tool output' });
    await s.flush();
    const toolRow = s.captureCharFrame().split('\n').findIndex(row => row.includes('bash'));
    await s.mockMouse.click(4, toolRow);
    await s.flush();
    expect(s.captureCharFrame()).toContain('visible tool output');
    s.controller.event({ type: 'message_start', sessionId: 'test', turnId: 't', step: 1, seq: 3 });
    s.controller.event({ type: 'text_delta', sessionId: 'test', turnId: 't', step: 1, seq: 4, text: 'streamed answer' });
    await s.waitForFrame(frame => frame.includes('streamed answer'));
    expect(s.captureCharFrame()).toContain('visible tool output');
    expect(s.captureCharFrame()).toContain('streamed answer');
    s.controller.event({ type: 'text_delta', sessionId: 'test', turnId: 't', step: 1, seq: 5, text: '\n' + Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n') });
    await s.flush();
    const scroll = s.renderer.root.findDescendantById('transcript') as any;
    scroll.scrollTo(0);
    await s.flush();
    const top = scroll.scrollTop;
    s.controller.event({ type: 'text_delta', sessionId: 'test', turnId: 't', step: 1, seq: 6, text: '\nnew tail' });
    await s.flush();
    expect(scroll.scrollTop).toBe(top);
  });
});

test('rendered TUI completes a real runtime task with approval and restores it', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-modern-tui-'));
  const workspace = path.join(directory, 'project');
  fs.mkdirSync(workspace);
  const runtime = await launcher.acquireRuntime({ executable: process.env.MLI_TEST_NODE, runtimeRoot: path.resolve(import.meta.dir, '../..'), dataRoot: path.join(directory, 'data'), environment: { MLI_ACCOUNT_ENABLED: 'false', MLI_AGENT_WORKSPACE: workspace } });
  const client = new RuntimeClient(runtime.url);
  await client.useWorkspace(workspace);
  const controller = new TuiController(client, { cwd: workspace, dataRoot: path.join(directory, 'data') });
  const s = await testRender(() => <App controller={controller} />, { width: 100, height: 32, kittyKeyboard: true });
  const wait = async (predicate: () => boolean) => {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await Bun.sleep(25); }
    throw new Error('Runtime integration timed out');
  };
  try {
    await controller.start();
    await wait(() => controller.connected);
    await s.mockInput.typeText('写一个 hello.txt');
    s.mockInput.pressEnter();
    await wait(() => !!controller.session.permission);
    const snapshot = await client.request(`/api/session/${controller.session.id}`);
    expect(snapshot.activeStep.text).toContain('创建文件');
    expect(snapshot.eventSeq).toBeGreaterThan(0);
    await controller.restore(controller.session.id, { preserveDraft: true });
    await s.flush();
    expect(s.captureCharFrame()).toContain('执行审批');
    s.mockInput.pressArrow('right');
    s.mockInput.pressEnter();
    await wait(() => fs.existsSync(path.join(workspace, 'hello.txt')) && !controller.session.running);
    await s.flush();
    expect(s.captureCharFrame()).toContain('已完成');
    expect(controller.session.parts.filter((part: any) => part.kind === 'tool')).toHaveLength(1);
    const id = controller.session.id;
    await controller.command('/new');
    expect(controller.session.id).toBeNull();
    await controller.restore(id);
    await s.flush();
    expect(controller.session.parts.filter((part: any) => part.kind === 'tool')).toHaveLength(1);
    expect(s.captureCharFrame()).toContain('hello.txt');
  } finally {
    controller.close();
    s.renderer.destroy();
    await runtime.release();
    for (let i = 0; i < 200; i++) {
      try { process.kill(runtime.pid, 0); } catch { break; }
      await Bun.sleep(25);
    }
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(directory, { recursive: true, force: true }); break; }
      catch (error) { if (i === 9) throw error; await Bun.sleep(100); }
    }
  }
}, 15000);
