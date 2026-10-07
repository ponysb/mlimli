import fs from 'node:fs/promises';
import path from 'node:path';
import { getWorkspaceRoot } from './paths.mjs';

const EXCLUDED_DIRECTORIES = new Set([
  '.agent', '.git', '.hg', '.svn', 'node_modules', 'node_models', 'bower_components',
  '.venv', 'venv', '.virtualenv', '.virtualenvs', '__pycache__', 'site-packages',
  'dist-packages', '.tox', '.nox', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.npm', '.pnpm', '.yarn', '.cache', '.gradle',
  '.m2', '.ivy2', '.sbt', '.bloop', '.metals',
  '.cargo', '.rustup', 'target', '.nuget', 'bin', 'obj',
  '.dart_tool', '.pub-cache', 'pods', 'carthage', '.swiftpm', '.build',
  'vendor', '.bundle', '.next', '.nuxt', '.svelte-kit',
]);
const MAX_ENTRIES = 25000, MAX_DIRECTORIES = 3000, MAX_DEPTH = 32, SCAN_MS = 1500;
let cached;

async function dependencyEnvironment(directory) {
  for (const marker of ['pyvenv.cfg', 'conda-meta']) {
    try { await fs.access(path.join(directory, marker)); return true; }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) return true; }
  }
  return false;
}

async function scanWorkspace(root) {
  const entries = [], queue = [{ relative: '', depth: 0 }];
  const deadline = Date.now() + SCAN_MS;
  let scanned = 0, skipped = false, incomplete = false;
  // Breadth-first traversal keeps top-level material visible before deep trees.
  for (let index = 0; index < queue.length; index++) {
    if (index >= MAX_DIRECTORIES || Date.now() > deadline) { incomplete = true; break; }
    const current = queue[index];
    let directory;
    try { directory = await fs.opendir(path.join(root, current.relative)); }
    catch (error) { if (!index) throw error; skipped = true; continue; }
    for await (const item of directory) {
      if (++scanned > MAX_ENTRIES || Date.now() > deadline) { incomplete = true; break; }
      if (item.isSymbolicLink() || (!item.isDirectory() && !item.isFile())) continue;
      const relative = current.relative ? `${current.relative}/${item.name}` : item.name;
      if (item.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(item.name.toLowerCase()) || /(?:^|\/)pkg\/(?:mod|sumdb)(?:\/|$)/i.test(relative) || await dependencyEnvironment(path.join(root, relative))) continue;
        entries.push({ name: item.name, path: relative, type: 'directory' });
        if (current.depth < MAX_DEPTH && queue.length < MAX_DIRECTORIES) queue.push({ relative, depth: current.depth + 1 });
        else incomplete = true;
      } else entries.push({ name: item.name, path: relative, type: 'file' });
    }
    if (scanned > MAX_ENTRIES || Date.now() > deadline) break;
  }
  entries.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true }));
  return { entries, incomplete: incomplete || skipped };
}

export async function listWorkspaceReferences({ query = '', limit = 100 } = {}) {
  const root = getWorkspaceRoot();
  if (!cached || cached.root !== root || Date.now() - cached.created > 5000) {
    const record = { root, created: Date.now() };
    record.promise = scanWorkspace(root).catch(error => { if (cached === record) cached = undefined; throw error; });
    cached = record;
  }
  const index = await cached.promise;
  const search = String(query).trim().replaceAll('\\', '/').toLocaleLowerCase();
  const terms = search.split(/\s+/).filter(Boolean);
  const matched = index.entries.filter(item => terms.every(term => item.path.toLocaleLowerCase().includes(term)));
  if (search) matched.sort((a, b) => {
    const rank = item => item.name.toLocaleLowerCase() === search ? 0 : item.name.toLocaleLowerCase().startsWith(search) ? 1 : item.name.toLocaleLowerCase().includes(search) ? 2 : 3;
    return rank(a) - rank(b) || a.path.localeCompare(b.path, 'zh-CN', { numeric: true });
  });
  const count = Math.max(1, Math.min(200, Number(limit) || 100));
  return { workspace: root, entries: matched.slice(0, count), hasMore: matched.length > count, incomplete: index.incomplete };
}
