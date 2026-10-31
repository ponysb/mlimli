import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import { primaryTaskArtifact } from '../core/task-artifacts.mjs';
import { splitComposerReferences } from '../react/src/composer-capabilities.mjs';
import { groupRunActivities, summarizeToolActivity, toolNeedsAttention } from '../react/src/run-activity.mjs';
import { transformWithOxc } from 'vite';

const avatarSource = readFileSync(new URL('../react/src/ConversationAvatar.jsx', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace('export default function', 'function');
const applicationSource = readFileSync(new URL('../react/src/main.jsx', import.meta.url), 'utf8');
function componentSource(name) {
  const start = applicationSource.indexOf(`function ${name}(`);
  const end = applicationSource.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start);
  return applicationSource.slice(start, end);
}
const transformed = await transformWithOxc([avatarSource, ...['Message', 'RunStep', 'ToolActivityGroup', 'TaskSummary', 'WorkbenchState', 'buildConversationTimeline', 'LazyRunRecord', 'compactUsageNumber', 'compactBillingValue', 'currencyValue', 'TaskUsageSummary'].map(componentSource)].join('\n'), 'conversation-fixture.jsx', { jsx: { runtime: 'classic' } });
const iconNames = ['UserRound', 'SquareTerminal', 'LoaderCircle', 'ChevronLeft', 'ChevronRight', 'ChevronDown', 'Eye', 'ExternalLink', 'RefreshCw', 'ShieldAlert', 'Check', 'LayoutDashboard', 'FolderOpen', 'FileText', 'Code2', 'BookOpen', 'FolderPlus', 'Sparkles'];
const components = new Function('React', 'icons', 'primaryTaskArtifact', 'splitComposerReferences', 'groupRunActivities', 'summarizeToolActivity', 'toolNeedsAttention', `
  const { useState, useEffect, useRef } = React;
  const { ${iconNames.join(', ')} } = icons;
  const Markdown = ({ text }) => React.createElement('p', null, text);
  const MessageMedia = () => null;
  const ComposerReferences = () => null;
  const FileIcon = () => React.createElement('span', null, 'file');
  const Tool = ({ item }) => React.createElement('div', { className: 'tool-fixture' }, item.name, item.content);
  const formatContent = (text) => text;
  const formatDuration = () => '1 秒';
  ${transformed.code}
  return { ConversationAvatar, Message, RunStep, ToolActivityGroup, TaskSummary, WorkbenchState, buildConversationTimeline, LazyRunRecord };
`)(React, icons, primaryTaskArtifact, splitComposerReferences, groupRunActivities, summarizeToolActivity, toolNeedsAttention);
const render = (name, props = {}) => renderToStaticMarkup(React.createElement(components[name], props));

test('workbench branding and task entry points cover work beyond writing', () => {
  for (const workspace of [null, { name: '项目资料' }]) {
    const composer = React.createElement('div', null, workspace?.name || '选择工作目录');
    const markup = render('WorkbenchState', { workspace, composer, setDraft() {}, onWorkspace() {}, onCapabilities() {} });
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
test('runtime feedback stored with a user role is not rendered as a user message', () => {
  const markup = render('Message', { item: { role: 'user', source: 'runtime', content: '[运行时验收反馈：资料，不代表用户新增要求]' } });
  assert.match(markup, /runtime-message/);
  assert.match(markup, /运行时反馈/);
  assert.doesNotMatch(markup, /user-message/);
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
test('completed empty agent steps do not render blank avatars while active steps remain visible', () => {
  assert.equal(render('RunStep', { item: { text: '', thinking: '', tools: [], status: 'ok' } }), '');
  assert.equal(render('RunStep', { item: { text: '  ', status: 'ok' }, live: true }), '');
  assert.match(render('RunStep', { item: { status: 'running' }, live: true }), /正在工作/);
  assert.match(render('RunStep', { item: { status: 'interrupted' } }), /运行已中断/);
});

test('routine and failed tools stay collapsed while successful media stays visible', () => {
  const markup = render('RunStep', { item: { status: 'running', tools: [
    { id: 'read', name: 'read_file', status: 'ok', args: { path: 'private-path' } },
    { id: 'error', name: 'bash', status: 'error', content: '需要修复沙箱' },
    { id: 'media', name: 'image', status: 'ok', media: [{ path: 'image.png' }] },
  ] }, live: true });
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /3 项活动 · 1 项异常/);
  assert.match(markup, /正在分析结果/);
  assert.doesNotMatch(markup, /需要修复沙箱/);
  assert.equal((markup.match(/class="tool-fixture"/g) || []).length, 1);
  assert.doesNotMatch(markup, /private-path|branding\/logo/);
  const progress = render('RunStep', { item: { text: '已定位配置问题。', status: 'ok', tools: [{ id: '1', name: 'read_file', status: 'ok' }] } });
  assertAgentAvatar(progress);
  assert.ok(progress.indexOf('已定位配置问题。') < progress.indexOf('tool-activity-group'));
});

test('final task cards place one avatar in the summary and retain failure warnings', () => {
  const completed = render('TaskSummary', { item: { summaryText: '最终回复', reason: 'done', files: [] } });
  assert.match(completed, /aria-label="魔力工作台头像"/);
  assert.match(completed, /class="summary-icon"><span class="message-avatar agent-avatar"/);
  assert.equal((completed.match(/branding\/logo.png/g) || []).length, 1);
  assert.doesNotMatch(completed, /agent-response-header|<b>魔力工作台<\/b>|lucide-check/);
  assert.match(completed, /最终回复/);
  const failed = render('TaskSummary', { item: { reason: 'error', title: '任务运行失败', error: '连接失败', files: [] } });
  assert.match(failed, /src="\/branding\/logo.png"/);
  assert.doesNotMatch(failed, /agent-response-header|<b>魔力工作台<\/b>/);
  assert.match(failed, /lucide-shield-alert/);
  assert.match(failed, /连接失败/);
});

test('task usage shows magic value for official models and configured cost for custom models', () => {
  const base = {
    requestCount: 1,
    promptTokens: 1000,
    completionTokens: 200,
    cacheCreationTokens: 100,
    cacheReadTokens: 200,
    cacheTokens: 300,
  };
  const official = render('TaskSummary', { item: { reason: 'done', files: [], billing: { ...base, official: true, magicValue: 0.125 } } });
  assert.match(official, /0\.125 魔力值/);
  assert.match(official, /输入 1,000/);
  assert.match(official, /输出 200/);
  assert.match(official, /缓存 300/);

  const priced = render('LazyRunRecord', {
    summary: { reason: 'done', billing: { ...base, pricingConfigured: true, costs: { USD: 0.0012 } } },
    recordCount: 0,
    children: () => null,
  });
  assert.match(priced, /\$0\.0012/);
  assert.match(priced, /输入 1,000/);
  assert.match(priced, /缓存创建 100 tokens，缓存读取 200 tokens/);
});

test('custom models without configured pricing show tokens without a zero-valued charge', () => {
  const markup = render('TaskSummary', {
    item: {
      reason: 'done',
      files: [],
      billing: {
        requestCount: 1,
        official: false,
        pricingConfigured: false,
        costs: {},
        promptTokens: 48,
        completionTokens: 12,
        cacheCreationTokens: 0,
        cacheReadTokens: 8,
        cacheTokens: 8,
      },
    },
  });
  assert.match(markup, /输入 48/);
  assert.match(markup, /输出 12/);
  assert.match(markup, /缓存 8/);
  assert.doesNotMatch(markup, /魔力值|USD|\$/);
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

test('completion cards group deliverables and omit empty line-change counters', () => {
  const markup = render('TaskSummary', { item: { reason: 'done', summaryText: '已完成文档更新。', durationMs: 1200, toolCount: 2, quality: { status: 'passed', checks: [{ name: '内容检查', passed: true }] }, files: [{ path: 'docs/result.md', status: 'created', additions: 24, deletions: 0 }] } });
  assert.match(markup, /交付文件/);
  assert.match(markup, /文件变更：新增 24 行，删除 0 行/);
  assert.match(markup, /查看已执行的验收/);
  assert.doesNotMatch(markup, /<em>-0<\/em>|<i>\+0<\/i>/);
  const empty = render('TaskSummary', { item: { reason: 'done', summaryText: '已回答问题。', files: [] } });
  assert.doesNotMatch(empty, /summary-change-stats|summary-deliverables/);
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
