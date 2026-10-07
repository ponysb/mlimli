import test from 'node:test';
import assert from 'node:assert/strict';
import { composerTrigger, capabilityItems, insertCapability, splitComposerReferences, joinComposerReferences } from '../react/src/composer-capabilities.mjs';
import { expandComposerReferences } from '../core/composer-references.mjs';

test('composer triggers follow the caret and exclude emails, paths and completed references', () => {
  assert.deepEqual(composerTrigger('请参考 @章节'), { symbol: '@', query: '章节', start: 4, end: 7 });
  assert.equal(composerTrigger('user@example.com'), null);
  assert.equal(composerTrigger('https://example.com'), null);
  assert.equal(composerTrigger('@file("带空格/章节.md")'), null);
  assert.equal(composerTrigger('/repo/path'), null);
  assert.equal(composerTrigger('hello /help tail', 11).query, 'help');
});

test('selected references preserve surrounding draft and escape file paths', () => {
  const text = '请参考 @doc 修改', trigger = composerTrigger(text, 8);
  const result = insertCapability(text, trigger, { kind: 'file', path: '中文/带 "引号" 的文件.md' });
  assert.equal(result.text, '请参考 @file("中文/带 \\"引号\\" 的文件.md")  修改');
  assert.equal(result.text.slice(result.caret), ' 修改');
  const expert = insertCapability('@专家 后文', composerTrigger('@专家 后文', 3), { kind: 'expert' });
  assert.equal(expert.text, ' 后文');
});

test('capability catalog deduplicates skills and uses only installed capabilities', () => {
  assert.deepEqual(capabilityItems(null), [], 'initial render has no loaded configuration');
  const items = capabilityItems({ localSkills: [{ name: 'office' }], plugins: { skills: [{ name: 'office' }], plugins: [{ name: 'documents', tools: ['write_doc'] }] }, experts: [{ id: 'editor', name: '编辑' }], commands: [{ name: '/help' }] });
  assert.equal(items.filter(item => item.kind === 'skill').length, 1);
  assert.equal(items.find(item => item.kind === 'command').name, '/help');
  assert.equal(items.find(item => item.kind === 'expert').id, 'editor');
  const computer = capabilityItems({ plugins: { plugins: [{ name: 'computer-use', displayName: 'computer use' }] } })[0];
  assert.equal(computer.displayName, 'computer use');
  assert.equal(insertCapability('@computer', composerTrigger('@computer'), computer).text, '@plugin("computer-use") ');
});

test('reference tags roundtrip escaped paths without changing the ordinary draft', () => {
  const references = [{ kind: 'folder', path: '输出/带 "引号" 的目录' }, { kind: 'file', path: 'C:\\docs\\文稿.md' }, { kind: 'skill', name: '写作检查' }];
  const draft = '请处理资料\n  保留这一行的缩进';
  const serialized = joinComposerReferences(draft, references);
  const parsed = splitComposerReferences(serialized);
  assert.equal(parsed.text, draft);
  assert.equal(parsed.references[0].name, '带 "引号" 的目录');
  assert.equal(parsed.references[1].name, '文稿.md');
  assert.equal(joinComposerReferences(parsed.text, parsed.references), serialized);
  assert.equal(splitComposerReferences(joinComposerReferences('', references)).text, '');
  assert.equal(splitComposerReferences('@folder("输出") @folder("输出")').references.length, 1);
  assert.equal(splitComposerReferences('普通消息 @unknown("test")').text, '普通消息 @unknown("test")');
  assert.equal(insertCapability('压缩 /压缩 后继续', composerTrigger('压缩 /压缩 后继续', 6), { kind: 'compact' }).text, '压缩  后继续');
});

test('explicit references resolve registered skills and tools without inlining files or skill content', () => {
  const result = expandComposerReferences('处理 @file("large.png") @folder("docs") @skill("office") @plugin("documents") @skill("missing")', { skills: [{ name: 'office', content: 'SECRET_BODY'.repeat(1000) }], plugins: [{ name: 'documents', tools: ['write_doc'] }] });
  assert.ok(result.includes('read_skill'));
  assert.ok(result.includes('write_doc'));
  assert.ok(result.includes('missing'));
  assert.ok(!result.includes('SECRET_BODY'));
  assert.ok(result.length < 1200);
  assert.equal(expandComposerReferences('普通消息'), '普通消息');
});
