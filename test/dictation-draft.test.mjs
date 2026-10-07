import assert from 'node:assert/strict';
import test from 'node:test';
import { dictationDraftUpdate } from '../react/src/dictation-draft.mjs';

test('live dictation revises its preview and commits once while retaining the original draft', () => {
  const base = '原有内容';
  const first = dictationDraftUpdate(base, '', '你好')(base);
  assert.equal(first, '原有内容 你好');
  const next = dictationDraftUpdate(base, '你好', '你好世界')(first);
  assert.equal(next, '原有内容 你好世界');
  assert.equal(dictationDraftUpdate(base, '你好世界', '你好世界。')(next), '原有内容 你好世界。');
});

test('dictation preserves added suffixes and does not overwrite a manually edited or submitted draft', () => {
  const update = dictationDraftUpdate('原文', '预览', '确认文字');
  assert.equal(update('原文 预览 用户补充'), '原文 确认文字 用户补充');
  assert.equal(update('用户改过整段'), '用户改过整段');
  assert.equal(update(''), '');
  assert.equal(dictationDraftUpdate('旧草稿', '', '识别结果')('新草稿'), '新草稿');
});
