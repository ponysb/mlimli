import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setWorkspaceRoot } from '../core/paths.mjs';
import { saveExpert, getExpert, deleteExpert } from '../core/experts.mjs';
import { saveLocalSkill, listLocalSkills, deleteLocalSkill } from '../core/local-skills.mjs';
import { getSkills } from '../core/plugins.mjs';

test('自建专家和 Skill 仅写入本地工作区且可编辑删除', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mli-library-'));
  setWorkspaceRoot(directory);
  try {
    const expert = saveExpert({ name: '测试专家', prompt: '本地提示词', tags: ['测试'] });
    assert.equal(getExpert(expert.id).prompt, '本地提示词');
    saveExpert({ ...expert, prompt: '更新后的提示词' });
    assert.equal(getExpert(expert.id).prompt, '更新后的提示词');
    const skill = saveLocalSkill({ name: '测试 Skill', description: '本地', content: '# 指南\n仅保存在项目里' });
    assert.ok(getSkills().some((item) => item.name === skill.name));
    assert.equal(listLocalSkills()[0].content, '# 指南\n仅保存在项目里');
    deleteExpert(expert.id);
    deleteLocalSkill(skill.id);
    assert.equal(getExpert(expert.id), null);
    assert.equal(listLocalSkills().length, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
