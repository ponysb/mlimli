import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryTaskArtifact } from '../core/task-artifacts.mjs';
import { discoverArtifacts } from '../core/task-summary.mjs';
const files = ['tools/cut.py', 'output/report.md', 'output/transcript.txt', 'output/final.m4a', 'output/demo.pptx'].map(path => ({ path, status: 'created' }));

test('the main deliverable follows the task and does not prioritize helper scripts', () => {
  assert.equal(primaryTaskArtifact({ files, promptText: '请剪辑录音', summaryText: '交付物 output/final.m4a' }).path, 'output/final.m4a');
  assert.equal(primaryTaskArtifact({ files, promptText: '优化演示文稿 PPT' }).path, 'output/demo.pptx');
  assert.equal(primaryTaskArtifact({ files: [...files, { path: 'output/index.html' }], promptText: '做一个网站' }).path, 'output/index.html');
});

test('video tasks select the finished MP4 rather than a mentioned preview image', () => {
  const files = ['work/final1080.png', 'work/final1080.mp4', 'tools/render.py'].map(path => ({ path, status: 'created' }));
  const summaryText = '最终文件 work/final1080.png 是预览截图，视频已经生成。';
  assert.equal(primaryTaskArtifact({ files, promptText: '用录音剪辑一个有字幕的视频', summaryText }).path, 'work/final1080.mp4');
  assert.equal(primaryTaskArtifact({ files, promptText: '还是不满意，不够卡点，我想要完整的一句话', summaryText }).path, 'work/final1080.mp4');
  assert.equal(primaryTaskArtifact({ files, promptText: '生成一张图片海报', summaryText }).path, 'work/final1080.png');
  const artifacts = discoverArtifacts(new Map(files.map(file => [file.path, {}])), '', files);
  assert.ok(artifacts.some(file => file.path === 'work/final1080.mp4'));
});

test('primary deliverables exclude deleted files, handle older summaries and preserve explicit selections', () => {
  assert.equal(primaryTaskArtifact({ files: [{ path: 'a.txt', status: 'deleted' }] }), null);
  assert.equal(primaryTaskArtifact({ artifacts: [{ path: 'report.pdf' }] }).path, 'report.pdf');
  assert.equal(primaryTaskArtifact({ files, primaryArtifact: { path: 'output/transcript.txt' } }).path, 'output/transcript.txt');
  assert.equal(primaryTaskArtifact({ files: [{ path: 'a.txt', status: 'deleted' }, { path: 'b.txt' }], primaryArtifact: { path: 'a.txt' } }).path, 'b.txt');
});
