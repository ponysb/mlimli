import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_ROOT } from './paths.mjs';

const file = path.join(DATA_ROOT, 'voice-profiles.json');
export function voiceProfiles({ includeEmbeddings = false } = {}) {
  let profiles;
  try { profiles = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw new Error('全局声纹库无法读取，原文件已保留'); }
  if (!Array.isArray(profiles)) throw new Error('全局声纹库格式无效');
  return includeEmbeddings ? profiles : profiles.map(({ embedding, ...profile }) => profile);
}
function write(profiles) {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(profiles), { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
export function rememberVoice({ name, role = '', embedding }) {
  const label = String(name || '').trim().slice(0, 80);
  if (!label) throw new Error('请先填写说话人姓名');
  if (!Array.isArray(embedding) || embedding.length < 64 || embedding.length > 1024 || !embedding.every(Number.isFinite)) throw new Error('尚无可保存的声纹，请等待一段完整发言');
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  if (norm < 1e-8) throw new Error('声纹无效，请录制更清晰的发言');
  const profiles = voiceProfiles({ includeEmbeddings: true });
  let profile = profiles.find(item => item.name === label);
  if (!profile) {
    if (profiles.length >= 100) throw new Error('声纹库最多保存 100 人，请删除不再使用的记录');
    profile = { id: crypto.randomUUID(), createdAt: Date.now() }; profiles.push(profile);
  }
  Object.assign(profile, { name: label, role: String(role).trim().slice(0, 80), embedding: embedding.map(value => value / norm), updatedAt: Date.now() });
  write(profiles);
  const { embedding: ignored, ...publicProfile } = profile; return publicProfile;
}
export function updateVoice(id, { name, role }) {
  const profiles = voiceProfiles({ includeEmbeddings: true }), profile = profiles.find(item => item.id === id);
  if (!profile) throw new Error('声纹记录不存在');
  const label = String(name || '').trim().slice(0, 80);
  if (!label) throw new Error('姓名不能为空');
  if (profiles.some(item => item.id !== id && item.name === label)) throw new Error('该姓名已存在，请使用可区分的名称');
  Object.assign(profile, { name: label, role: String(role || '').trim().slice(0, 80), updatedAt: Date.now() });
  write(profiles); return voiceProfiles();
}
export function forgetVoice(id) { const profiles = voiceProfiles({ includeEmbeddings: true }); write(profiles.filter(profile => profile.id !== id)); return voiceProfiles(); }
