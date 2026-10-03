import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryTaskArtifact } from '../core/task-artifacts.mjs';
const files = ['tools/cut.py', 'output/report.md', 'output/transcript.txt', 'output/final.m4a', 'output/demo.pptx'].map(path => ({ path, status: 'created' }));

test('the main deliverable follows the task and does not prioritize helper scripts', () => {
  assert.equal(primaryTaskArtifact({ files, promptText: '请剪辑录音', summaryText: '交付物 output/final.m4a' }).path, 'output/final.m4a');
  assert.equal(primaryTaskArtifact({ files, promptText: '优化演示文稿 PPT' }).path, 'output/demo.pptx');
  assert.equal(primaryTaskArtifact({ files: [...files, { path: 'output/index.html' }], promptText: '做一个网站' }).path, 'output/index.html');
});

test('primary deliverables exclude deleted files, handle older summaries and preserve explicit selections', () => {
  assert.equal(primaryTaskArtifact({ files: [{ path: 'a.txt', status: 'deleted' }] }), null);
  assert.equal(primaryTaskArtifact({ artifacts: [{ path: 'report.pdf' }] }).path, 'report.pdf');
  assert.equal(primaryTaskArtifact({ files, primaryArtifact: { path: 'output/transcript.txt' } }).path, 'output/transcript.txt');
  assert.equal(primaryTaskArtifact({ files: [{ path: 'a.txt', status: 'deleted' }, { path: 'b.txt' }], primaryArtifact: { path: 'a.txt' } }).path, 'b.txt');
});
