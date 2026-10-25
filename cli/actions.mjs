import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { reasoningChoices } from '../core/reasoning.mjs';
import { ATTACHMENT_LIMITS, attachmentMime, attachmentKind } from '../core/attachment-types.mjs';
import { safeText, hydrate } from './modern/state.mjs';

export const ACTION_COMMANDS = [
  ['continue', '从检查点继续'], ['goal', '任务目标'], ['result', '任务结果与验收'],
  ['attach', '添加附件'], ['attachments', '管理待发送附件'], ['reference', '引用文件或目录'],
  ['reasoning', '思考强度'], ['older', '更早历史'], ['rename', '重命名会话'],
  ['fork', '会话分支'], ['delete', '删除当前会话'], ['context', '上下文与文件'],
  ['channels', '连接渠道'], ['memories', '记忆'], ['schedules', '定时任务'],
  ['acp', '外部 Agent'], ['sandbox', '沙箱状态'], ['rules', '权限规则'],
  ['plugins', '插件与工具'], ['logs', '调用日志'],
  ['spawn', '派发子 Agent'], ['entry', '完整执行记录'],
  ['files', '项目文件'], ['workspace', '切换工作目录'], ['plan', '任务计划与验收'],
].map(([name, label]) => ({ value: `/${name}`, label }));

const show = (ui, title, value) => ui.choose(title, [{ label: '关闭', value: null }], { description: safeText(typeof value === 'string' ? value : JSON.stringify(value, null, 2)) });
const confirm = (ui, title, description) => ui.choose(title, [{ label: '取消', value: false }, { label: '确认', value: true }], { description });
export const attachmentKey = session => session.id || 'home';
export function pendingAttachments(ui) { return ui.attachments?.[attachmentKey(ui.session)] || []; }

export async function readAttachment(filename, cwd) {
  const file = path.resolve(cwd || process.cwd(), filename);
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    const mime = attachmentMime(file);
    const limit = attachmentKind(mime) === 'image' ? ATTACHMENT_LIMITS.imageBytes : ATTACHMENT_LIMITS.fileBytes;
    if (!stat.isFile()) throw new Error('附件必须是普通文件');
    if (stat.size > limit) throw new Error(`附件不能超过 ${limit / 1024 / 1024} MiB`);
    // Read through a bounded stream so a growing file cannot exhaust memory.
    const chunks = []; let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > limit) throw new Error('附件超过大小限制');
      chunks.push(chunk);
    }
    return { name: path.basename(file), mime, size, dataUrl: `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}` };
  } finally { await handle.close(); }
}

export async function terminalAction(ui, name, argument = '') {
  if (!ACTION_COMMANDS.some(item => item.value === name)) return false;
  const client = ui.client, session = ui.session, id = session.id;
  const request = (suffix, body, options) => client.request(`/api/session/${id}${suffix}`, body, options);
  const sessionRequired = ['/continue', '/goal', '/result', '/older', '/rename', '/fork', '/delete', '/context', '/spawn', '/entry', '/plan'];
  if (!id && sessionRequired.includes(name)) throw new Error('请先打开会话');
  if (session.running && ['/continue', '/rename', '/fork', '/delete', '/reasoning'].includes(name)) throw new Error('请先停止当前任务');
  if (name === '/continue') {
    await ui.restore(id, { preserveDraft: true });
    const recovery = ui.session.recovery;
    if (!recovery?.available) throw new Error('当前没有可恢复的检查点');
    if (await confirm(ui, '继续中断任务？', safeText(JSON.stringify({ goal: recovery.goal, unknownActions: recovery.unknownActions || [] }, null, 2))) === true) {
      await request('/resume', { checkpointId: recovery.checkpointId });
      await ui.restore(id, { preserveDraft: true });
    }
  } else if (name === '/goal') {
    const text = argument || await ui.ask('任务目标（留空完成目标）', { initial: session.goal?.text || '' });
    if (text !== null) { const result = await request('/goal', { text, status: text.trim() ? 'active' : 'completed' }); ui.session = { ...ui.session, goal: result.goal }; }
  } else if (name === '/result') {
    await ui.restore(id, { preserveDraft: true });
    await show(ui, '任务结果与验收', ui.session.summary || '当前页没有任务结果，可加载更早历史。');
  } else if (name === '/attach') {
    const filename = argument || await ui.ask('附件路径');
    if (filename) {
      const existing = pendingAttachments(ui);
      if (existing.length >= ATTACHMENT_LIMITS.count) throw new Error('每条消息最多添加 10 个附件');
      const attachment = await readAttachment(filename, ui.options.cwd);
      if (existing.reduce((sum, item) => sum + item.size, attachment.size) > ATTACHMENT_LIMITS.totalBytes) throw new Error('附件总大小不能超过 40 MiB');
      ui.attachments ||= {};
      ui.attachments[attachmentKey(session)] = [...existing, attachment];
    }
  } else if (name === '/attachments') {
    const items = pendingAttachments(ui);
    const index = await ui.choose('移除待发送附件', items.length ? items.map((item, index) => ({ label: safeText(item.name), detail: `${item.size} bytes`, value: index })) : [{ label: '没有待发送附件', value: null }]);
    if (index !== null) ui.attachments[attachmentKey(session)] = items.filter((_, i) => i !== index);
  } else if (name === '/reference') {
    const query = argument || await ui.ask('搜索文件或目录');
    if (query !== null) {
      const data = await client.request(`/api/files/references?query=${encodeURIComponent(query)}`);
      const items = data.items || data.entries || [];
      const index = await ui.choose('文件与目录', items.map((item, index) => ({ label: safeText(item.path || item.name), value: index })));
      if (index !== null && items[index]) {
        const item = items[index];
        ui.saveDraft(`${ui.draft}${ui.draft ? ' ' : ''}@${item.type === 'directory' || item.kind === 'folder' ? 'folder' : 'file'}(${JSON.stringify(item.path)}) `);
      }
    }
  } else if (name === '/reasoning') {
    await ui.refresh();
    const model = ui.info.models?.find(item => item.id === (ui.info.activeModelId || ui.info.provider?.modelId));
    if (!model) throw new Error('请先选择模型');
    const declared = reasoningChoices(model);
    const choices = declared.length ? declared : model.capabilities?.thinking ? (model.reasoningOptions?.efforts || []).map(value => ({ value, label: String(value) })) : [];
    const index = await ui.choose('思考强度', [{ label: '模型默认', value: -1 }, ...choices.map((item, index) => ({ label: safeText(item.label || item.value), value: index }))]);
    if (index !== null) {
      const reasoningSettings = index === -1 ? { mode: 'default' } : declared.length ? { value: choices[index].value } : { mode: 'effort', effort: String(choices[index].value), adapter: model.reasoningOptions?.suggested || 'auto' };
      await client.request('/api/settings', { action: 'activate_model', modelId: model.id, reasoningSettings }); await ui.refresh();
    }
  } else if (name === '/older') await ui.loadOlder();
  else if (name === '/rename') {
    const title = argument || await ui.ask('会话名称', { initial: session.title });
    if (title?.trim()) { await request('/title', { title }); await ui.restore(id, { preserveDraft: true }); }
  } else if (name === '/fork') {
    const result = await request('/fork', {}); await ui.restore(result.id);
  } else if (name === '/delete') {
    if (await confirm(ui, `删除会话 ${safeText(session.title)}？`) === true) {
      await request('', undefined, { method: 'DELETE' }); await ui.command('/new');
    }
  } else if (name === '/context') await show(ui, '上下文与文件', { context: session.context, goal: session.goal, recovery: session.recovery });
  else if (name === '/plan') await show(ui, '任务计划与验收', session.plan || session.summary?.quality?.contract || '尚未设置任务计划');
  else if (name === '/files') {
    const query = argument || await ui.ask('文件路径');
    if (query) await show(ui, safeText(query), await client.request(`/api/file?path=${encodeURIComponent(query)}`));
  } else if (name === '/workspace') {
    const { workspaces } = await client.request('/api/workspaces');
    const value = argument || await ui.choose('工作目录', workspaces.map(item => ({ label: safeText(item.path), value: item.path })));
    if (value && value !== ui.options.cwd) {
      if (session.running || (session.group?.tasks || []).some(item => ['queued', 'running', 'waiting_permission', 'waiting_input'].includes(item.status))) throw new Error('任务运行中不能切换工作目录');
      const root = path.resolve(value);
      if (await confirm(ui, '切换工作目录？', '将关闭当前会话视图，待发送附件不会转移到其他目录。') !== true) return true;
      ui.persist?.();
      ui.switchingWorkspace = true;
      try { await client.useWorkspace(root); } finally { ui.switchingWorkspace = false; }
      ui.options.cwd = root;
      ui.stateFile = ui.options.dataRoot ? path.join(ui.options.dataRoot, 'terminal', `${crypto.createHash('sha256').update(root).digest('hex').slice(0, 24)}.json`) : null;
      ui.drafts = {}; ui.attachments = {}; ui.history = [];
      if (ui.stateFile) {
        try { const saved = JSON.parse(await fs.readFile(ui.stateFile, 'utf8')); ui.drafts = saved.drafts || {}; ui.history = saved.history || []; } catch {}
      }
      await ui.command('/new'); await ui.refresh();
    }
  }
  else if (name === '/spawn') {
    const { profiles } = await client.request('/api/agent-profiles');
    const profile = await ui.choose('Agent 角色', profiles.map(item => ({ label: safeText(item.name), detail: safeText(item.description), value: item.id })));
    if (profile) {
      const instruction = await ui.ask('子任务目标、范围与验收条件');
      if (instruction?.trim()) await request('/agents', { tasks: [{ profile, instruction }] });
    }
  } else if (name === '/entry') {
    const value = argument || await ui.ask('执行记录 ID');
    if (value !== null) {
      if (!/^\d+$/.test(value)) throw new Error('需要数字记录 ID');
      await show(ui, `执行记录 ${value}`, await request(`/entries/${value}`));
    }
  }
  else if (name === '/channels') await channels(ui);
  else if (name === '/memories') await memories(ui);
  else if (name === '/schedules') await schedules(ui);
  else if (name === '/acp') await externalAgents(ui);
  else if (name === '/sandbox') {
    const status = await client.request('/api/sandbox');
    const action = await ui.choose('沙箱', [{ label: '关闭', value: null }, { label: status.policy.enabled ? '禁用沙箱' : '启用沙箱', value: 'toggle' }], { description: safeText(JSON.stringify(status, null, 2)) });
    if (action === 'toggle' && await confirm(ui, '修改沙箱策略？', status.policy.enabled ? '命令将使用宿主权限。' : '启用当前配置的沙箱策略。') === true) await client.request('/api/sandbox', { ...status.policy, enabled: !status.policy.enabled });
  }
  else if (name === '/rules') {
    const data = await client.request('/api/permissions');
    const index = await ui.choose('权限规则', (data.allow || []).map((item, index) => ({ label: safeText(`${item.tool} ${item.pattern || ''}`), value: index })));
    if (index !== null && data.allow[index] && await confirm(ui, '删除此权限规则？') === true) await client.request('/api/permissions', { allow: data.allow.filter((_, i) => i !== index) });
  } else if (name === '/plugins') await show(ui, '插件与工具', { plugins: ui.info.plugins, tools: ui.info.tools, mcp: ui.info.mcp });
  else if (name === '/logs') {
    const data = await client.request('/api/logs?limit=30');
    await show(ui, '最近调用日志', data);
  }
  ui.changed(); return true;
}

async function channels(ui) {
  const data = await ui.client.request('/api/channels');
  const choice = await ui.choose('连接渠道', [{ label: '添加渠道', value: 'new' }, ...data.channels.map(item => ({ label: safeText(item.name), detail: `${item.status} ${safeText(item.lastError)}`, value: item.id }))]);
  if (!choice) return;
  if (choice === 'new') {
    const type = await ui.choose('平台', [{ label: '飞书', value: 'feishu' }, { label: '钉钉', value: 'dingtalk' }]);
    if (!type) return;
    const name = await ui.ask('渠道名称'); if (!name) return;
    const appId = await ui.ask(type === 'feishu' ? 'App ID' : 'Client ID'); if (!appId) return;
    const secret = await ui.ask(type === 'feishu' ? 'App Secret' : 'Client Secret', { secret: true }); if (!secret) return;
    const user = await ui.ask('允许的用户 ID（逗号分隔）'); if (user === null) return;
    const chats = await ui.ask('允许的群聊 ID（逗号分隔）'); if (chats === null) return;
    await ui.client.request('/api/channels', { type, name, enabled: true, requireMention: true, allowUsers: user.split(',').map(x => x.trim()).filter(Boolean), allowChats: chats.split(',').map(x => x.trim()).filter(Boolean), credentials: type === 'feishu' ? { appId, appSecret: secret } : { clientId: appId, clientSecret: secret } });
  } else {
    const item = data.channels.find(item => item.id === choice);
    const action = await ui.choose(safeText(item.name), [{ label: '连接', value: 'connect' }, { label: '断开', value: 'disconnect' }, { label: '编辑白名单和名称', value: 'edit' }, { label: '配置与事件', value: 'detail' }, { label: '删除', value: 'delete' }]);
    if (action === 'edit') {
      const name = await ui.ask('渠道名称', { initial: item.name }); if (!name) return;
      const users = await ui.ask('用户白名单（逗号分隔）', { initial: item.allowUsers.join(',') }); if (users === null) return;
      const chats = await ui.ask('群聊白名单（逗号分隔）', { initial: item.allowChats.join(',') }); if (chats === null) return;
      await ui.client.request(`/api/channels/${choice}`, { name, allowUsers: users.split(',').map(x => x.trim()).filter(Boolean), allowChats: chats.split(',').map(x => x.trim()).filter(Boolean) }, { method: 'PATCH' });
    }
    if (['connect', 'disconnect'].includes(action)) await ui.client.request(`/api/channels/${choice}/${action}`, {});
    if (action === 'detail') await show(ui, '渠道配置与事件', { channel: item, events: data.events.filter(event => event.channelId === choice) });
    if (action === 'delete' && await confirm(ui, '删除渠道？') === true) await ui.client.request(`/api/channels/${choice}`, undefined, { method: 'DELETE' });
  }
}

async function memories(ui) {
  const { items } = await ui.client.request('/api/memories');
  const choice = await ui.choose('记忆', [{ label: '新增记忆', value: 'new' }, ...items.map(item => ({ label: safeText(item.title), detail: `${item.scope} · ${item.status}`, value: item.id }))]);
  if (!choice) return;
  if (choice === 'new') {
    const title = await ui.ask('记忆标题'); if (!title) return;
    const content = await ui.ask('记忆正文'); if (!content) return;
    const scope = await ui.choose('范围', [{ label: '当前项目', value: 'project' }, { label: '全局', value: 'global' }]);
    if (scope) await ui.client.request('/api/memories', { title, content, scope, kind: 'fact' });
  } else {
    const item = items.find(item => item.id === choice);
    const action = await ui.choose(safeText(item.title), [{ label: '关闭', value: null }, { label: '编辑', value: 'edit' }, ...(item.status === 'pending' ? [{ label: '审核启用', value: 'approve' }] : [])], { description: safeText(item.content) });
    if (action === 'approve') await ui.client.request(`/api/memories/${item.scope}/${item.id}/approve`, { expectedRevision: item.revision });
    if (action === 'edit') {
      const content = await ui.ask('记忆正文', { initial: item.content });
      if (content !== null) await ui.client.request(`/api/memories/${item.scope}/${item.id}`, { ...item, content, expectedRevision: item.revision }, { method: 'PUT' });
    }
  }
}

async function schedules(ui) {
  const { tasks, runs } = await ui.client.request('/api/schedules');
  const choice = await ui.choose('定时任务', [{ label: '新增任务', value: 'new' }, ...tasks.map(item => ({ label: safeText(item.name), detail: `${item.enabled ? '启用' : '暂停'} · ${item.lastStatus || ''}`, value: item.id }))]);
  if (!choice) return;
  if (choice === 'new') {
    const name = await ui.ask('任务名称'); if (!name) return;
    const prompt = await ui.ask('任务提示词'); if (!prompt) return;
    const type = await ui.choose('周期', [{ label: '单次', value: 'once' }, { label: '每天', value: 'daily' }, { label: '间隔', value: 'interval' }]); if (!type) return;
    const value = await ui.ask(type === 'once' ? '执行时间（含时区的 ISO 日期）' : type === 'daily' ? '每天时间 HH:MM（运行时本地时间）' : '间隔分钟'); if (!value) return;
    const schedule = type === 'once' ? { type, at: value } : type === 'daily' ? { type, time: value } : { type, minutes: Number(value) };
    await ui.client.request('/api/schedules', { name, prompt, schedule, workspacePath: ui.options.cwd, mode: 'default' });
  } else {
    const task = tasks.find(item => item.id === choice);
    const action = await ui.choose(safeText(task.name), [{ label: task.enabled ? '暂停' : '启用', value: 'toggle' }, { label: '编辑提示词', value: 'edit' }, { label: '立即执行', value: 'run' }, { label: '运行记录', value: 'runs' }, { label: '删除', value: 'delete' }], { description: safeText(task.prompt) });
    if (action === 'edit') { const prompt = await ui.ask('任务提示词', { initial: task.prompt }); if (prompt?.trim()) await ui.client.request(`/api/schedules/${choice}`, { prompt }); }
    if (action === 'toggle') await ui.client.request(`/api/schedules/${choice}`, { enabled: !task.enabled });
    if (action === 'run' && await confirm(ui, '立即执行定时任务？', safeText(task.prompt)) === true) await ui.client.request(`/api/schedules/${choice}/run`, {});
    if (action === 'runs') await show(ui, '运行记录', runs.filter(item => item.taskId === choice));
    if (action === 'delete' && await confirm(ui, '删除定时任务？') === true) await ui.client.request(`/api/schedules/${choice}`, undefined, { method: 'DELETE' });
  }
}

async function externalAgents(ui) {
  const data = await ui.client.request('/api/acp/settings');
  const choice = await ui.choose('外部 Agent', [{ label: '检测本机 ACP', value: 'discover' }, { label: '新增外部 Agent', value: 'new' }, ...data.agents.map(item => ({ label: safeText(item.name), value: item.id }))]);
  if (choice === 'discover') await show(ui, '本机 ACP 检测', await ui.client.request('/api/acp/discover', {}));
  else if (choice) {
    const item = data.agents.find(item => item.id === choice);
    const action = choice === 'new' ? 'edit' : await ui.choose('外部 Agent 配置', [{ label: '编辑', value: 'edit' }, { label: '删除', value: 'delete' }, { label: '关闭', value: null }], { description: safeText(JSON.stringify(item, null, 2)) });
    if (action === 'delete' && await confirm(ui, '删除外部 Agent？') === true) await ui.client.request('/api/acp/settings', { action: 'delete', id: choice });
    if (action === 'edit') {
      const id = item?.id || await ui.ask('配置 ID'); if (!id) return;
      const name = await ui.ask('名称', { initial: item?.name || '' }); if (!name) return;
      const command = await ui.ask('可信程序路径', { initial: item?.command || '' }); if (!command) return;
      const argsText = await ui.ask('参数（JSON 数组）', { initial: JSON.stringify(item?.args || []) }); if (argsText === null) return;
      const args = JSON.parse(argsText);
      if (!Array.isArray(args) || args.some(item => typeof item !== 'string')) throw new Error('参数须为字符串数组');
      await ui.client.request('/api/acp/settings', { action: 'save', agent: { id, name, command, args, timeoutMs: item?.timeoutMs || 120000 } });
    }
  }
}

export async function agentDetails(ui, task) {
  const snapshot = await ui.client.request(`/api/session/${task.sessionId || task.agentId}?limit=120`);
  const parts = hydrate(snapshot).parts;
  await show(ui, safeText(task.title), parts.map(part => `${part.kind} ${safeText(part.name || '')}\n${part.args ? safeText(JSON.stringify(part.args)) + '\n' : ''}${part.text || (part.summary ? JSON.stringify(part.summary) : '')}`).join('\n\n'));
}
