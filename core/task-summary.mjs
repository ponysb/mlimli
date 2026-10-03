import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot } from './paths.mjs';

const SKIP = new Set(['.agent', '.git', 'node_modules']);
const MAX_FILES = 10000;
const MAX_DIFF_BYTES = 1024 * 1024;

function walk(root, dir, output) {
  if (output.size >= MAX_FILES) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (output.size >= MAX_FILES) break;
    if (SKIP.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, abs, output);
    else if (entry.isFile()) {
      try {
        const stat = fs.statSync(abs), relative = path.relative(root, abs).replaceAll('\\', '/');
        const record = { path: relative, size: stat.size, modified: stat.mtimeMs };
        if (stat.size <= MAX_DIFF_BYTES) {
          const buffer = fs.readFileSync(abs);
          if (!buffer.subarray(0, 8192).includes(0)) record.lines = buffer.toString('utf8').split(/\r?\n/);
        }
        output.set(relative, record);
      } catch { /* 文件可能在扫描过程中变化 */ }
    }
  }
}

export function workspaceSnapshot() { const output = new Map(); walk(getWorkspaceRoot(), getWorkspaceRoot(), output); return output; }

function lineCounts(before = [], after = []) {
  const counts = new Map();
  for (const line of before) counts.set(line, (counts.get(line) || 0) + 1);
  let additions = 0;
  for (const line of after) { const count = counts.get(line) || 0; if (count) counts.set(line, count - 1); else additions++; }
  const deletions = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return { additions, deletions };
}

export function summarizeChanges(before, after = workspaceSnapshot()) {
  const paths = new Set([...before.keys(), ...after.keys()]), files = [];
  for (const filePath of paths) {
    const oldItem = before.get(filePath), newItem = after.get(filePath);
    if (!oldItem && newItem) files.push({ path: filePath, status: 'created', ...lineCounts([], newItem.lines) });
    else if (oldItem && !newItem) files.push({ path: filePath, status: 'deleted', ...lineCounts(oldItem.lines, []) });
    else if (oldItem.size !== newItem.size || oldItem.modified !== newItem.modified) files.push({ path: filePath, status: 'modified', ...lineCounts(oldItem.lines, newItem.lines) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function discoverArtifacts(after, summaryText, changedFiles = []) {
  const previewable = /\.(?:html?|pdf|svg|png|jpe?g|webp|m4a|mp3|wav|mp4|webm|mov|docx|xlsx|pptx|md|txt|csv)$/i;
  const changed = new Set(changedFiles.filter((file) => file.status !== 'deleted').map((file) => file.path));
  return [...after.keys()].filter((filePath) => previewable.test(filePath) &&
    (changed.has(filePath) || String(summaryText).includes(filePath) || String(summaryText).includes(path.posix.basename(filePath))))
    .slice(0, 12).map((filePath) => ({ path: filePath, type: path.extname(filePath).slice(1).toLowerCase() }));
}
