import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import { primaryTaskArtifact } from '../core/task-artifacts.mjs';
import { splitComposerReferences } from '../react/src/composer-capabilities.mjs';
import { transformWithOxc } from 'vite';

const avatarSource = readFileSync(new URL('../react/src/ConversationAvatar.jsx', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace('export default function', 'function');
const applicationSource = readFileSync(new URL('../react/src/main.jsx', import.meta.url), 'utf8');
function componentSource(name) {
  const start = applicationSource.indexOf(`function ${name}(`);
  const end = applicationSource.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start);
  return applicationSource.slice(start, end);
}
const transformed = await transformWithOxc([avatarSource, ...['Message', 'RunStep', 'TaskSummary', 'WorkbenchState', 'buildConversationTimeline', 'LazyRunRecord'].map(componentSource)].join('\n'), 'conversation-fixture.jsx', { jsx: { runtime: 'classic' } });
const iconNames = ['UserRound', 'SquareTerminal', 'LoaderCircle', 'ChevronRight', 'ChevronDown', 'Eye', 'ExternalLink', 'RefreshCw', 'ShieldAlert', 'Check', 'LayoutDashboard', 'FolderOpen', 'FileText', 'Code2', 'BookOpen', 'FolderPlus'];
const components = new Function('React', 'icons', 'primaryTaskArtifact', 'splitComposerReferences', `
  const { useState, useEffect } = React;
  const { ${iconNames.join(', ')} } = icons;
  const Markdown = ({ text }) => React.createElement('p', null, text);
  const MessageMedia = () => null;
  const ComposerReferences = () => null;
  const FileIcon = () => React.createElement('span', null, 'file');
  const formatContent = (text) => text;
  const formatDuration = () => '1 秒';
  ${transformed.code}
  return { ConversationAvatar, Message, RunStep, TaskSummary, WorkbenchState, buildConversationTimeline, LazyRunRecord };
`)(React, icons, primaryTaskArtifact, splitComposerReferences);
const render = (name, props = {}) => renderToStaticMarkup(React.createElement(components[name], props));

test('workbench branding and task entry points cover work beyond writing', () => {
  for (const workspace of [null, { name: '项目资料' }]) {
    const markup = render('WorkbenchState', { workspace, setDraft() {}, onWorkspace() {} });
    assert.match(markup, /<h1>魔力工作台<\/h1>/);
    for (const label of ['资料整理', '文档办公', '开发项目', '写作创作']) assert.ok(markup.includes(label));
    assert.doesNotMatch(markup, /魔力创作|小说工作目录|魔力工作台工作台/);
    assert.ok(markup.includes(workspace ? '项目资料' : '选择工作目录'));
  }
});

function assertAgentAvatar(markup) {
  assert.match(markup, /aria-label="魔力工作台头像"/);
  assert.match(markup, /src="\/branding\/logo.png"/);
  assert.match(markup, /<b>魔力工作台<\/b>/);
  assert.doesNotMatch(markup, /用户头像/);
}

test('user messages have a person avatar, never the brand logo, including pending messages', () => {
  for (const optimistic of [false, true]) {
    const markup = render('Message', { item: { role: 'user', content: '用户消息', optimistic } });
    assert.match(markup, /aria-label="用户头像"/);
    assert.match(markup, /lucide-user-round/);
    assert.doesNotMatch(markup, /branding\/logo|魔力工作台头像/);
    assert.match(markup, /用户消息/);
  }
});

test('ordinary assistant messages use the existing brand avatar while tools retain their own icon', () => {
  assertAgentAvatar(render('Message', { item: { role: 'assistant', content: '回复内容' } }));
  const toolMarkup = render('Message', { item: { role: 'tool', content: '工具输出' } });
  assert.match(toolMarkup, /工具结果/);
  assert.match(toolMarkup, /lucide-square-terminal/);
  assert.doesNotMatch(toolMarkup, /branding\/logo|用户头像/);
});

test('both historical and live agent steps show the brand avatar', () => {
  for (const live of [false, true]) {
    assertAgentAvatar(render('RunStep', { item: { text: '执行说明', status: 'running' }, live }));
  }
  assertAgentAvatar(render('RunStep', { item: { status: 'running' }, live: true }));
});

test('final task cards have an agent avatar without replacing success or failure status icons', () => {
  const completed = render('TaskSummary', { item: { summaryText: '最终回复', reason: 'done', files: [] } });
  assertAgentAvatar(completed);
  assert.match(completed, /lucide-check/);
  assert.match(completed, /最终回复/);
  const failed = render('TaskSummary', { item: { reason: 'error', title: '任务运行失败', error: '连接失败', files: [] } });
  assertAgentAvatar(failed);
  assert.match(failed, /lucide-shield-alert/);
  assert.match(failed, /连接失败/);
});

test('a completed task highlights one deliverable and shows only three other files', () => {
  const item = { reason: 'done', summaryText: 'Final output', primaryArtifact: { path: 'output/final.wav' }, files: Array.from({ length: 7 }, (_, index) => ({ path: `output/file-${index}.txt`, status: 'created' })), artifacts: [{ path: 'output/final.wav' }] };
  const markup = render('TaskSummary', { item });
  assert.equal((markup.match(/class="summary-file summary-primary-file"/g) || []).length, 1);
  assert.equal((markup.match(/class="summary-file"/g) || []).length, 3);
  assert.ok(markup.indexOf('summary-primary-file') > markup.indexOf('summary-text'));
  assert.ok(markup.indexOf('summary-primary-file') < markup.indexOf('class="summary-file"'));
  assert.match(markup, /再显示 4 个文件/);
  assert.ok(!markup.includes('summary-artifacts'));
});

test('older video summaries recover the user prompt and replace an inferred screenshot', () => {
  const entries = [
    { type: 'message', role: 'user', content: [{ type: 'text', text: '请剪辑带字幕的 MP4 视频' }], turnId: 'turn-1' },
    { type: 'task_summary', turnId: 'turn-1', reason: 'done', summaryText: '最终文件 work/final1080.png，视频也已保存。', primaryArtifact: { path: 'work/final1080.png' }, files: [{ path: 'work/final1080.png', status: 'created' }, { path: 'work/final1080.mp4', status: 'created' }] },
  ];
  const summary = components.buildConversationTimeline(entries, false).find(node => node.kind === 'summary').item;
  const markup = render('TaskSummary', { item: summary });
  assert.match(markup, /打开主要成果：work\/final1080.mp4/);
  assert.doesNotMatch(markup, /打开主要成果：work\/final1080.png/);
});

test('stopped and failed tasks keep their saved output visible while completed records stay collapsed', () => {
  for (const reason of ['aborted', 'interrupted', 'error', 'budget_exceeded']) {
    const markup = render('LazyRunRecord', { summary: { reason }, recordCount: 1, children: () => React.createElement('p', null, '停止前已输出的内容') });
    assert.match(markup, /<details[^>]* open=""/);
    assert.match(markup, /停止前已输出的内容/);
  }
  const completed = render('LazyRunRecord', { summary: { reason: 'done' }, recordCount: 1, children: () => React.createElement('p', null, '完整运行记录') });
  assert.doesNotMatch(completed, / open=""|完整运行记录/);
});
