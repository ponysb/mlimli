import fs from 'node:fs';
import path from 'node:path';

function validate(group, root, id) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const validId = value => typeof value === 'string' && /^[\w-]+$/.test(value);
  const statuses = new Set(['queued', 'running', 'waiting_children', 'waiting_permission', 'waiting_input', 'completed', 'failed', 'cancelled', 'budget_exceeded', 'interrupted']);
  if (!object(group) || group.rootSessionId !== id || typeof group.workspaceRoot !== 'string' || !object(group.tasks) || !object(group.inbox) || !object(group.idempotency) || !Number.isFinite(group.revision) || Object.keys(group.tasks).length > 10000) throw new Error('蜂群持久状态格式无效，不能自动恢复');
  for (const [key, task] of Object.entries(group.tasks)) {
    if (!object(task) || task.taskId !== key || !validId(key) || !validId(task.agentId) || !validId(task.sessionId) || !validId(task.parentSessionId) || !statuses.has(task.status) || !Array.isArray(task.dependsOn) || task.dependsOn.some(id => !Object.hasOwn(group.tasks, id))) throw new Error('蜂群任务状态格式无效，不能自动恢复');
  }
  relocate(group, root);
  return group;
}

function relocatedPath(value, previousRoot, root) {
  if (typeof value !== 'string') return value;
  const paths = path.win32.isAbsolute(previousRoot) ? path.win32 : path.posix;
  if (!paths.isAbsolute(previousRoot) || !paths.isAbsolute(value)) return value;
  const relative = paths.relative(previousRoot, value);
  if (relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) return value;
  return path.resolve(root, ...relative.split(paths.sep).filter(Boolean));
}

function relocate(group, root) {
  const previousRoot = group.workspaceRoot;
  if (path.resolve(previousRoot) === path.resolve(root)) return;
  const move = value => relocatedPath(value, previousRoot, root);
  group.workspaceRoot = path.resolve(root);
  if (group.runtimePolicy) group.runtimePolicy.executionRoot = move(group.runtimePolicy.executionRoot);
  for (const task of Object.values(group.tasks)) {
    task.executionRoot = move(task.executionRoot);
    if (task.workspace) {
      task.workspace.directory = move(task.workspace.directory);
      task.workspace.root = move(task.workspace.root);
      task.workspace.sourceRoot = move(task.workspace.sourceRoot);
    }
  }
}

export function readSwarmGroup(root, id) {
  const directory = path.join(root, '.agent', 'task-groups');
  if (!/^[\w-]+$/.test(id)) throw new Error('无效任务组 ID');
  try { return validate(JSON.parse(fs.readFileSync(path.join(directory, `${id}.json`), 'utf8')), root, id); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    const lines = fs.readFileSync(path.join(directory, `${id}.jsonl`), 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let parsed; try { parsed = JSON.parse(lines[i]); } catch { continue; }
      return validate(parsed, root, id);
    }
    throw new Error('蜂群状态已损坏，不能自动恢复');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return null;
}

export function writeSwarmGroup(group) {
  const directory = path.join(group.workspaceRoot, '.agent', 'task-groups');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${group.rootSessionId}.json`), temporary = `${file}.tmp`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(group)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  if (process.platform !== 'win32') {
    const dir = fs.openSync(directory, 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  }
}

export function listSwarmGroups(root) {
  try { return [...new Set(fs.readdirSync(path.join(root, '.agent', 'task-groups')).filter(name => /^[\w-]+\.jsonl?$/.test(name)).map(name => name.replace(/\.jsonl?$/, '')))]; }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
