export function deletionState(entries) {
  const ids = new Set(), prompts = new Set();
  let through = -1;
  for (const entry of entries) if (entry.type === 'entry_delete') {
    through = Math.max(through, entry.id);
    for (const id of entry.entryIds || []) ids.add(id);
    if (entry.promptTurnId) prompts.add(entry.promptTurnId);
  }
  return { ids, prompts, through, before: [...ids].reduce((value, id) => Math.min(value, id), Infinity) };
}

export function visibleSessionEntries(entries) {
  const { ids, prompts, before, through } = deletionState(entries);
  return entries.filter(entry => entry.type !== 'entry_delete' && !ids.has(entry.id) && !(entry.type === 'compaction' && entry.id > before && entry.id < through)).map(entry => prompts.has(entry.turnId) && entry.promptText ? { ...entry, promptText: '' } : entry);
}

export function deletionTargets(entries, target) {
  if (target.type === 'message' && target.role === 'user') {
    return entries.filter(entry => entry.id === target.id || target.turnId && entry.turnId === target.turnId && ['turn_start', 'task_checkpoint'].includes(entry.type)).map(entry => entry.id);
  }
  const responseTypes = new Set(['step_start', 'step_end', 'tool_start', 'tool_end', 'task_summary', 'task_checkpoint']);
  if (target.turnId) return entries.filter(entry => entry.turnId === target.turnId && (responseTypes.has(entry.type) || entry.type === 'message' && entry.role !== 'user')).map(entry => entry.id);
  const calls = new Set((target.toolCalls || []).map(call => call.id));
  return entries.filter(entry => entry.id === target.id || entry.type === 'message' && entry.role === 'tool' && calls.has(entry.toolCallId)).map(entry => entry.id);
}
