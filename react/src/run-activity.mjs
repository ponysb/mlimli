// Presentation only: keep stored events and tool results intact.
export function groupRunActivities(nodes) {
  const grouped = [];
  for (const node of nodes) {
    if (node.kind !== 'step') { grouped.push(node); continue; }
    if (!node.text?.trim() && !node.thinking?.trim() && !node.tools?.length && !node.retry && !['running', 'interrupted', 'error'].includes(node.status)) continue;
    const previous = grouped[grouped.length - 1];
    const activityOnly = !node.text?.trim() && !node.retry && (node.tools?.length || node.status === 'running');
    if (activityOnly && previous?.kind === 'step' && previous.turnId === node.turnId && !previous.retry && !['error', 'interrupted'].includes(previous.status)) {
      grouped[grouped.length - 1] = {
        ...previous,
        tools: previous.tools,
        thinking: [previous.thinking, node.thinking].filter(Boolean).join('\n\n'),
        status: node.status,
        live: previous.live || node.live,
      };
      grouped[grouped.length - 1].tools.push(...(node.tools || []));
    } else grouped.push({ ...node, tools: [...(node.tools || [])] });
  }
  return grouped;
}

export function toolActivityKind(name = '') {
  if (/^(read_file|read_attachment|read_skill|read_memory|read_team_memory|read_asset)$/.test(name)) return 'read';
  if (/^(write_file|edit_file|apply_patch)$/.test(name)) return 'edit';
  if (/^(bash|exec_command|shell)$/.test(name)) return 'command';
  if (/^(grep|find|web_fetch|open_url)$/.test(name) || /search/.test(name)) return 'search';
  return 'other';
}

export function toolNeedsAttention(tool) {
  // Failed activities stay inside the collapsed group, including their media.
  return !['error', 'denied', 'interrupted'].includes(tool.status) &&
    (Boolean(tool.sandboxBypassed) || Boolean(tool.media?.length));
}

export function summarizeToolActivity(tools) {
  const counts = { read: 0, edit: 0, command: 0, search: 0, other: 0 };
  for (const tool of tools) counts[toolActivityKind(tool.name)]++;
  const running = tools.findLast(tool => tool.status === 'running');
  const problems = tools.filter(tool => ['error', 'denied', 'interrupted'].includes(tool.status)).length;
  const labels = [];
  if (counts.read) labels.push(`读取 ${counts.read} 项资料`);
  if (counts.edit) labels.push(`编辑 ${counts.edit} 次文件`);
  if (counts.command) labels.push(`运行 ${counts.command} 条命令`);
  if (counts.search) labels.push(`查询 ${counts.search} 次`);
  if (counts.other) labels.push(`调用 ${counts.other} 次其他工具`);
  const kind = running ? toolActivityKind(running.name) : Object.keys(counts).find(kind => counts[kind]) || 'other';
  const current = { read: '读取资料', edit: '编辑文件', command: '运行命令', search: '查询资料', other: '使用工具' }[kind];
  return {
    kind, running: Boolean(running), problems,
    label: running ? `正在${current}` : `已${labels.join('、')}`,
    detail: `${tools.length} 项活动${problems ? ` · ${problems} 项异常` : ''}`,
  };
}
