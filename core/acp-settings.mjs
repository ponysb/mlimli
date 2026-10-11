import { externalAgents } from './acp-client.mjs';

export function acpSettings(config) {
  return externalAgents(config).map(({ env, ...agent }) => ({ ...agent, envKeys: Object.keys(env) }));
}

export function updateAcpSettings(config, body) {
  const agents = externalAgents(config);
  if (body.action === 'delete') {
    if (!agents.some(agent => agent.id === body.id)) throw new Error('Agent 不存在');
    return { ...config.acp, agents: agents.filter(agent => agent.id !== body.id) };
  }
  if (body.action !== 'save' || !body.agent || typeof body.agent !== 'object') throw new Error('无效的 ACP 配置操作');
  const previous = agents.find(agent => agent.id === body.agent.id);
  const candidate = { ...body.agent, env: body.agent.env === undefined ? previous?.env || {} : body.agent.env };
  const validated = externalAgents({ acp: { agents: [candidate] } })[0];
  const updated = previous ? agents.map(agent => agent.id === validated.id ? validated : agent) : [...agents, validated];
  return { ...config.acp, agents: externalAgents({ acp: { agents: updated } }) };
}
