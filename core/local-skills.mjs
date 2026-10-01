import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { agentDataDir } from './paths.mjs';

function skillsDir() { return path.join(agentDataDir(), 'skills'); }

export function saveLocalSkill(value) {
  const name = String(value?.name || '').trim().slice(0, 80);
  const description = String(value?.description || '').trim().slice(0, 300);
  const content = String(value?.content || '').trim().slice(0, 30000);
  if (!name || !content) throw new Error('Skill 名称和内容不能为空');
  const id = value.id || `local-${crypto.randomUUID()}`;
  if (!/^local-[\da-f-]+$/.test(id)) throw new Error('Skill ID 无效');
  const dir = path.join(skillsDir(), id);
  if (value.id && !fs.existsSync(dir)) throw new Error('只能编辑本地 Skill');
  fs.mkdirSync(dir, { recursive: true });
  const meta = { id, name, description };
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content);
  return { ...meta, content, path: path.join(dir, 'SKILL.md'), source: 'workspace' };
}

export function listLocalSkills() {
  if (!fs.existsSync(skillsDir())) return [];
  return fs.readdirSync(skillsDir(), { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^local-[\da-f-]+$/.test(entry.name)).flatMap((entry) => {
    try {
      const dir = path.join(skillsDir(), entry.name);
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'skill.json'), 'utf8'));
      return [{ ...meta, content: fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), path: path.join(dir, 'SKILL.md'), source: 'workspace', local: true }];
    } catch { return []; }
  });
}

export function deleteLocalSkill(id) {
  const item = listLocalSkills().find((skill) => skill.id === id);
  if (!item) throw new Error('只能删除本地 Skill');
  fs.unlinkSync(path.join(skillsDir(), id, 'SKILL.md'));
  fs.unlinkSync(path.join(skillsDir(), id, 'skill.json'));
  fs.rmdirSync(path.join(skillsDir(), id));
}
