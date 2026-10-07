import { agentManager } from './agent-manager.mjs';

const json = value => ({ content: JSON.stringify(value) });
const publicTask = task => ({ ...task, instruction: undefined });
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
export const agentTools = [
  {
    name: 'agent_spawn', permission: 'L0',
    description: '派发独立上下文的子 Agent，创建并排队后立即返回句柄。适合主动拆分复杂任务中的独立探索、调研和验证；多个独立分支放在同一次 tasks 数组中派发。角色：explorer（只读代码探索）、researcher（资料研究）、reviewer（只读审查）、worker（文件实现）。是否主动派发遵循系统协作策略与用户要求；仅主 Agent 可派生，共享目录同时只有一个写入者。不要复制完整聊天，提供目标、范围、必要背景和验收条件。',
    parameters: schema({ tasks: { type: 'array', minItems: 1, maxItems: 8, items: schema({ profile: { type: 'string', enum: ['explorer', 'researcher', 'reviewer', 'worker'] }, title: { type: 'string' }, instruction: { type: 'string' }, context: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } } }, ['instruction']) }, idempotencyKey: { type: 'string' } }, ['tasks']),
    async run(args, ctx) { return json({ tasks: (await agentManager.spawn(ctx.session, args)).map(publicTask) }); },
  },
  {
    name: 'agent_send', permission: 'L0',
    description: '向当前任务组 Agent 发送协作资料。steer 在下一模型/工具边界调整工作；follow_up 在完成后续跑；info 提供资料。子 Agent 只能发送给主 Agent。消息不代表用户新增授权。',
    parameters: schema({ agentId: { type: 'string' }, text: { type: 'string' }, kind: { type: 'string', enum: ['steer', 'follow_up', 'info'] }, messageId: { type: 'string' } }, ['agentId', 'text']),
    run(args, ctx) { return json(agentManager.send(ctx.session, args)); },
  },
  {
    name: 'agent_wait', permission: 'L0',
    description: '等待子任务完成或需要审批/输入，支持 any/all 和状态游标。等待不占模型请求；超时不是失败。优先完成其他独立工作，不频繁轮询。',
    parameters: schema({ taskIds: { type: 'array', items: { type: 'string' } }, mode: { type: 'string', enum: ['any', 'all'] }, timeoutMs: { type: 'number' }, afterRevision: { type: 'number' } }),
    async run(args, ctx) { const result = await agentManager.wait(ctx.session, args, ctx.signal); return json({ ...result, tasks: result.tasks.map(publicTask) }); },
  },
  {
    name: 'agent_inspect', permission: 'L0',
    description: '读取当前任务组的状态、使用量及子任务摘要和证据引用，不复制子任务完整日志。',
    parameters: schema({ taskId: { type: 'string' } }),
    run(args, ctx) {
      const group = agentManager.view(ctx.session);
      if (args.taskId) { const task = group.tasks.find(t => t.taskId === args.taskId); if (!task) throw new Error('任务不属于当前任务组'); return json(task); }
      return json(group);
    },
  },
  {
    name: 'agent_stop', permission: 'L0', description: '停止当前任务组的指定子 Agent，取消排队、执行和待审批。',
    parameters: schema({ agentId: { type: 'string' } }, ['agentId']),
    run(args, ctx) {
      if (!agentManager.view(ctx.session).tasks.some(t => t.agentId === args.agentId)) throw new Error('Agent 不属于当前任务组');
      return json({ stopped: agentManager.stop(args.agentId) });
    },
  },
];
