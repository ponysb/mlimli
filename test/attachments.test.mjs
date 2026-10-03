import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setWorkspaceRoot } from '../core/paths.mjs';
import { Session } from '../core/session.mjs';
import { attachmentMime, nativeAttachment } from '../core/attachment-types.mjs';
import { attachmentText, readAttachedDocument } from '../core/attachment-content.mjs';
import { buildRequest } from '../core/llm.mjs';
import { writeZip } from '../plugins/office/lib/zip.mjs';

const input = (name, data = 'hello attachment', mime = 'application/octet-stream') => ({ name, dataUrl: `data:${mime};base64,${Buffer.from(data).toString('base64')}` });
function workspace(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-attachments-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  setWorkspaceRoot(root);
  return root;
}
function pdfFixture() {
  const text = 'BT /F1 12 Tf 30 100 Td (Hello attachment PDF) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
  let body = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

test('mixed attachments preserve original bytes, editable workspace copies and queue replay', context => {
  const root = workspace(context), session = Session.create('attachments');
  const queued = session.enqueue('modify these files', [input('说明.md', '# 原始资料'), input('sample.m4a', Buffer.from([0, 1, 2]))]);
  assert.deepEqual(queued.attachments.map(part => part.type), ['file', 'audio']);
  for (const part of queued.attachments) assert.ok(fs.existsSync(path.join(root, part.workspacePath)));
  const document = queued.attachments[0];
  fs.writeFileSync(path.join(root, document.workspacePath), 'edited copy');
  assert.equal(fs.readFileSync(session.attachment(document.attachmentId).path, 'utf8'), '# 原始资料');
  session.append({ type: 'message', role: 'user', content: [{ type: 'text', text: queued.text }, ...queued.attachments], queuedId: queued.queueId });
  const restored = Session.load(session.id);
  assert.equal(restored.queued().length, 0);
  assert.ok(restored.messages()[0].content[1].fallbackText.includes('# 原始资料'));
  assert.ok(restored.messages()[0].content[1].reference.includes(document.workspacePath));
  const fork = restored.fork();
  assert.equal(Buffer.from(fork.messages()[0].content[1].dataUrl.split(',')[1], 'base64').toString(), '# 原始资料');
});

test('arbitrary and empty files are accepted without leaking bytes into unsupported model inputs', context => {
  workspace(context); const session = Session.create('binary');
  const attachments = session.saveAttachments([input('data.bin', Buffer.from([0, 255, 10])), input('empty.txt', '')]);
  session.append({ type: 'message', role: 'user', content: attachments });
  const { body } = buildRequest({ protocol: 'openai-chat', baseUrl: 'http://localhost' }, { model: 'text', capabilities: { image: false } }, session.messages(), '', [], false);
  assert.ok(body.messages[0].content.every(part => part.type === 'text'));
  assert.ok(body.messages[0].content[0].text.includes('read_attachment'));
  assert.ok(!JSON.stringify(body).includes('base64'));
});

test('context estimation and unsupported model requests do not read binary snapshots', context => {
  workspace(context); const session = Session.create('lazy payload');
  const parts = session.saveAttachments([input('input.pdf', pdfFixture())]);
  session.append({ type: 'message', role: 'user', content: parts });
  const snapshot = session.attachment(parts[0].attachmentId).path;
  const read = context.mock.method(fs, 'readFileSync');
  session.contextStats();
  const messages = session.messages();
  const serialized = JSON.stringify(messages);
  const request = buildRequest({ protocol: 'openai-chat', baseUrl: 'http://localhost' }, { model: 'text', capabilities: { pdf: false } }, messages, '', [], false);
  assert.ok(!serialized.includes('base64'));
  assert.ok(!JSON.stringify(request).includes('base64'));
  assert.ok(!read.mock.calls.some(call => call.arguments[0] === snapshot));
  const native = buildRequest({ protocol: 'openai-chat', baseUrl: 'http://localhost' }, { model: 'pdf', capabilities: { pdf: true } }, messages, '', [], false);
  assert.ok(native.body.messages[0].content.some(part => part.type === 'file' && part.file.file_data.startsWith('data:application/pdf;base64,')));
  assert.equal(read.mock.calls.filter(call => call.arguments[0] === snapshot).length, 1);
});

test('attachment validation is atomic and rejects oversize, malformed and escaping input', context => {
  const root = workspace(context), session = Session.create('limits');
  assert.throws(() => session.saveAttachments([input('ok.txt'), { name: 'bad.txt', dataUrl: 'data:text/plain;base64,***' }]), /格式/);
  assert.ok(!fs.existsSync(path.join(root, 'attachments')));
  assert.throws(() => session.saveAttachments(Array.from({ length: 11 }, () => input('a.txt'))), /10/);
  assert.throws(() => session.saveAttachments([input('huge.txt', Buffer.alloc(25 * 1024 * 1024 + 1))]), /25 MB/);
  const sanitized = session.saveAttachments([input('../../outside.txt'), input('CON.txt')]);
  assert.equal(sanitized[0].name, 'outside.txt'); assert.equal(sanitized[1].name, '_CON.txt');
  assert.ok(!fs.existsSync(path.join(root, '..', 'outside.txt')));
});

test('attachment imports cannot follow a workspace directory link outside the workspace', context => {
  const root = workspace(context), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-outside-'));
  context.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, 'attachments'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => Session.create('link').saveAttachments([input('file.txt')]), /路径越界/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('moving a session preserves editable attachment copies in the target workspace', context => {
  const root = workspace(context), target = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-attachment-target-'));
  context.after(() => fs.rmSync(target, { recursive: true, force: true }));
  const session = Session.create('move');
  const attachments = session.saveAttachments([input('a.txt', 'original')]);
  session.append({ type: 'message', role: 'user', content: attachments });
  fs.writeFileSync(path.join(root, attachments[0].workspacePath), 'modified');
  session.moveToWorkspace(target); setWorkspaceRoot(target);
  const restored = Session.load(session.id);
  assert.equal(fs.readFileSync(path.join(target, attachments[0].workspacePath), 'utf8'), 'modified');
  assert.equal(Buffer.from(restored.messages()[0].content[0].dataUrl.split(',')[1], 'base64').toString(), 'original');
});

test('model request formats route PDF, images and audio only through supported modalities', () => {
  const parts = [{ type: 'file', name: 'a.pdf', mime: 'application/pdf', dataUrl: 'data:application/pdf;base64,cGRm', reference: 'PDF path', fallbackText: 'read PDF with tools' }, { type: 'image', name: 'a.png', mime: 'image/png', dataUrl: 'data:image/png;base64,aW1n', fallbackText: 'image path' }, { type: 'audio', name: 'a.wav', mime: 'audio/wav', dataUrl: 'data:audio/wav;base64,YXVkaW8=', fallbackText: 'transcription required' }];
  const request = (protocol, capabilities) => buildRequest({ protocol, baseUrl: 'http://localhost' }, { model: 'test', capabilities }, [{ role: 'user', content: parts }], '', [], false).body;
  const chat = request('openai-chat', { image: true, pdf: true, audio: true }).messages[0].content;
  assert.equal(chat.find(part => part.type === 'file').file.filename, 'a.pdf');
  assert.deepEqual(chat.find(part => part.type === 'input_audio').input_audio, { data: 'YXVkaW8=', format: 'wav' });
  assert.ok(chat.some(part => part.type === 'image_url'));
  const responses = request('openai-responses', { image: false, pdf: true, audio: true }).input[0].content;
  assert.ok(responses.some(part => part.type === 'input_file' && part.filename === 'a.pdf'));
  assert.ok(!responses.some(part => part.type === 'input_image' || part.type === 'input_audio'));
  const anthropic = request('anthropic', { pdf: true, image: false }).messages[0].content;
  assert.equal(anthropic.find(part => part.type === 'document').source.media_type, 'application/pdf');
  const textOnly = request('openai-chat', { image: false }).messages[0].content;
  assert.ok(textOnly.every(part => part.type === 'text'));
  assert.ok(!JSON.stringify(textOnly).includes('base64'));
  assert.equal(nativeAttachment('file', 'text/plain', 'a.txt', { file: true }, 'openai-chat'), false);
  assert.equal(nativeAttachment('file', 'text/plain', 'a.txt', { file: true }, 'openai-responses'), true);
  assert.equal(nativeAttachment('video', 'video/mp4', 'a.mp4', { video: true }, 'openai-chat'), false);
  assert.equal(attachmentMime('a.m4a', ''), 'audio/mp4');
});

test('text and DOCX extraction is bounded and binary bytes are not decoded as text', () => {
  assert.ok(attachmentText(Buffer.from('x'.repeat(15000)), 'a.txt').includes('内容已截取'));
  assert.equal(attachmentText(Buffer.from([0, 255, 16]), 'a.bin'), '');
  assert.equal(attachmentText(Buffer.from([255, 240, 128]), 'a.bin'), '');
  const docx = writeZip([{ name: 'word/document.xml', data: Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Document content</w:t></w:r></w:p></w:body></w:document>') }]);
  assert.ok(attachmentText(docx, 'a.docx').includes('Document content'));
});

test('PDF fallback tool extracts actual text and validates page ranges and workspace paths', async context => {
  const root = workspace(context); fs.writeFileSync(path.join(root, 'input.pdf'), pdfFixture());
  const content = await readAttachedDocument('input.pdf');
  assert.ok(content.includes('Hello attachment PDF'), content);
  await assert.rejects(readAttachedDocument('input.pdf', { offset: 2 }), /页码/);
  await assert.rejects(readAttachedDocument(path.join(root, '..', 'outside.pdf')), /路径不可读/);
});
