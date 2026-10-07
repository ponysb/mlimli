import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import { transformWithOxc } from 'vite';
import { clock, meetingDuration } from '../react/src/voice-format.mjs';

const source = readFileSync(new URL('../react/src/MeetingWorkspace.jsx', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace('export default function', 'function');
const transformed = await transformWithOxc(source, 'meeting-fixture.jsx', { jsx: { runtime: 'classic' } });
const MeetingWorkspace = new Function('React', 'icons', 'clock', `const { ArrowLeft, Check, Download, FileText, Mic, Monitor, Square, Video } = icons; ${transformed.code}; return MeetingWorkspace;`)(React, icons, clock);

test('participant names and roles sit below actions in the left panel and saved transcripts stay visible', () => {
  const markup = renderToStaticMarkup(React.createElement(MeetingWorkspace, { meeting: { id: 'saved-meeting', title: '需求评审', speechModelId: 'sensevoice', participants: { 'speaker-1': { name: '小李', role: '开发' } }, segments: [{ id: 1, text: '周五交付', speaker: 'speaker-1', start: 1 }] }, phase: 'finished', status: { model: '当前已切换的模型', models: [{ id: 'sensevoice', name: 'SenseVoice' }] }, mode: 'audio', elapsed: 35, speakers: ['speaker-1'] }));
  const controls = markup.slice(markup.indexOf('meeting-control-panel'), markup.indexOf('meeting-transcript-panel'));
  const transcript = markup.slice(markup.indexOf('meeting-transcript-panel'));
  assert.match(controls, /说话人 1姓名|说话人 1角色/);
  assert.ok(controls.indexOf('meeting-participants-section') > controls.indexOf('meeting-export-actions'));
  assert.doesNotMatch(transcript, /<input|meeting-participant/);
  assert.match(transcript, /会议逐字稿|周五交付/);
  assert.match(markup, /SenseVoice/); assert.doesNotMatch(markup, /当前已切换的模型/);
});

test('saved durations prefer the complete recording duration and support interrupted historical records', () => {
  assert.equal(meetingDuration({ durationSeconds: 40, createdAt: 1000, endedAt: 36000 }), 40);
  assert.equal(meetingDuration({ createdAt: 1000, endedAt: 36000 }), 35);
  assert.equal(meetingDuration({ segments: [{ end: 4 }, { end: 12 }] }), 12);
  assert.equal(meetingDuration({}), 0);
});
