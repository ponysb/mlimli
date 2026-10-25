import { agentManager } from './agent-manager.mjs';
import { publicExternalAgents } from './acp-client.mjs';
import { getRunContext } from './run-context.mjs';

const json = value => ({ content: JSON.stringify(value) });
const publicTask = task => ({ ...task, instruction: undefined });
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
export const agentTools = [
  {
    name: 'agent_mission', permission: 'L0',
    description: '持久保存蜂群原始目标和要求清单。大型任务派发前建立清单，任务用 requirementIds 关联；仅主 Agent 可更新。accepted 必须附真实验证证据，未验收要求会阻止最终完成。空参数读取。保留既有要求，不能静默删除。',
    parameters: schema({ goal: { type: 'string' }, requirements: { type: 'array', items: schema({ id: { type: 'string' }, text: { type: 'string' }, status: { type: 'string', enum: ['pending', 'accepted', 'blocked'] }, evidence: { type: 'string' } }, ['id', 'text', 'status']) } }),
    run(args, ctx) { return json(args.requirements ? agentManager.updateMission(ctx.session, args) : agentManager.view(ctx.session).mission); },
  },
  {
    name: 'agent_external_list', permission: 'L0',
    description: '列出用户配置的受信任外部 ACP Agent，不包含命令参数或凭据。使用 agent_spawn 的 capabilities=[read,write] 和 externalAgentId 派发；外部 Agent 使用自身沙箱，启动需要审批。',
    parameters: schema({}),
    run() { return json({ agents: publicExternalAgents(getRunContext()?.config) }); },
  },
  {
    name: 'agent_spawn', permission: 'L0',
    description: '动态创建蜂群任务 Agent：自由定义职责、范围、验收和工具能力。大型任务可设置 canDelegate=true 创建范围负责人，允许在其范围内继续派发并分层汇总；普通执行者不派生。支持依赖和分批扩展，共享工作区写入串行。负责人等待下属自动让出容量。',
    parameters: schema({ tasks: { type: 'array', minItems: 1, maxItems: 8, items: schema({ canDelegate: { type: 'boolean', description: '范围负责人可继续派发下属，默认 false' }, requirementIds: { type: 'array', items: { type: 'string' }, description: '负责的 Mission 要求 ID，下属不能超出父负责人要求' }, ref: { type: 'string', description: '本批唯一名称，可用于同批任务的 dependsOn' }, scope: { type: 'string', description: '负责的文件、资料或交付范围' }, acceptance: { type: 'string', description: '验收条件与证据要求' }, role: { type: 'string', description: '按任务自由定义职责，例如支付异常追踪、竞品定价核对' }, capabilities: { type: 'array', items: { type: 'string', enum: ['read', 'web', 'command', 'write'] }, description: '按需组合：read 文件和资料读取；web 网页读取；command 沙箱命令；write 文件修改。默认 read。工具权限与父任务授权取交集，写入仍受审批与互斥约束。' }, externalAgentId: { type: 'string', description: '可选：已配置外部 ACP Agent ID，需要 write 能力' }, title: { type: 'string' }, instruction: { type: 'string' }, context: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' }, description: '已有 taskId 或本批 ref，依赖成果自动交接' } }, ['instruction']) }, idempotencyKey: { type: 'string' } }, ['tasks']),
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
      const task = agentManager.group(ctx.session).tasks;
      const target = Object.values(task).find(t => t.agentId === args.agentId);
      if (!target || (getRunContext()?.taskId && !agentManager.isDescendant(agentManager.group(ctx.session), target, getRunContext().taskId))) throw new Error('只能停止自己负责的任务');
      return json({ stopped: agentManager.stop(args.agentId) });
    },
  },
  {
    name: 'agent_integrate', permission: 'L1',
    description: '核对下属结果后接收其隔离文件交付。需审批且只能由直接负责人调用；基线变化返回冲突，不覆盖已有修改。完成后再做集成验证。',
    parameters: schema({ taskId: { type: 'string' } }, ['taskId']),
    run(args, ctx) { return json(agentManager.integrate(ctx.session, args.taskId)); },
  },
];
agentTools.find(tool => tool.name === 'agent_spawn').parameters.properties.tasks.items.properties.writablePaths = {
  type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 128,
  description: '隔离并行文件任务可修改的具体相对路径。声明后使用独立快照，禁止 command、外部 Agent、继续派生；负责人用 agent_integrate 接收后供下游使用。省略时共享目录串行写入。',
};
