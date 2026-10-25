const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'budget_exceeded', 'interrupted']);

export function prepareTaskDependencies(inputs, existing, ids) {
  const refs = new Map();
  inputs.forEach((input, index) => {
    if (input.ref == null) return;
    if (typeof input.ref !== 'string' || !/^[a-zA-Z][\w-]{0,63}$/.test(input.ref) || refs.has(input.ref) || Object.hasOwn(existing, input.ref)) throw new Error('批内任务 ref 必须唯一且为有效名称');
    refs.set(input.ref, ids[index]);
  });
  const dependencies = inputs.map(input => {
    const values = input.dependsOn || [];
    if (!Array.isArray(values) || values.some(id => typeof id !== 'string' || (!Object.hasOwn(existing, id) && !refs.has(id)))) throw new Error('依赖必须是已有 taskId 或本批任务 ref');
    return [...new Set(values.map(id => refs.get(id) || id))];
  });
  const graph = new Map(Object.values(existing).map(task => [task.taskId, task.dependsOn || []]));
  ids.forEach((id, index) => graph.set(id, dependencies[index]));
  const visiting = new Set(), visited = new Set();
  const visit = id => {
    if (visiting.has(id)) throw new Error('任务依赖不能形成循环或依赖自身');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) || []) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  ids.forEach(visit);
  return dependencies;
}

export function taskQueueReason(task, tasks, writerBusy = false) {
  if (task.status !== 'queued') return null;
  const dependencies = (task.dependsOn || []).map(id => tasks[id]);
  if (dependencies.some(dep => !dep || (TERMINAL.has(dep.status) && dep.status !== 'completed'))) return 'dependency_failed';
  if (dependencies.some(dep => dep.status !== 'completed')) return 'dependencies';
  if (dependencies.some(dep => dep.delivery && dep.delivery.status !== 'integrated')) return 'delivery';
  if (!task.readOnly && !task.writablePaths && writerBusy) return 'workspace_writer';
  return 'capacity';
}
