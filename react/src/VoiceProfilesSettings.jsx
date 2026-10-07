import { confirmAction } from './ActionPopover.jsx';
import React, { useEffect, useState } from 'react';
import { Mic, RefreshCw, Save, Trash2 } from 'lucide-react';
import './voice-input.css';

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '声纹配置失败'); return data;
}
export default function VoiceProfilesSettings({ revision = 0 }) {
  const [profiles, setProfiles] = useState([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  async function refresh() { try { const data = await api('/api/speech/profiles'); setProfiles(data.profiles); setError(''); } catch (e) { setError(e.message); } }
  useEffect(() => { refresh(); }, [revision]);
  function edit(id, field, value) { setProfiles(items => items.map(item => item.id === id ? { ...item, [field]: value } : item)); }
  async function save(profile) {
    setBusy(true); setError('');
    try { const data = await api(`/api/speech/profiles/${profile.id}`, { method: 'PATCH', body: JSON.stringify({ name: profile.name, role: profile.role }) }); setProfiles(data.profiles); setNotice('全局声纹资料已保存，下次会议会自动使用'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function remove(profile) {
    if (!await confirmAction(`忘记“${profile.name}”的全局声纹？已有会议记录会保留。`, { confirmLabel: '忘记' })) return;
    setBusy(true); setError('');
    try { const data = await api(`/api/speech/profiles/${profile.id}`, { method: 'DELETE' }); setProfiles(data.profiles); setNotice('已忘记该声纹'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="section-block voice-profile-settings"><div className="section-head"><div><h2><Mic size={18}/>全局声纹库</h2><p>不填写姓名也会自动区分说话人 1、2、3。在会议面板识别出发言者后，填写姓名并点击“记住到全局”。</p></div><button title="刷新声纹库" aria-label="刷新声纹库" disabled={busy} onClick={refresh}><RefreshCw size={15}/></button></div><p className="voice-hint">保存的是本机声纹、姓名和角色；下次会议匹配成功会自动填入。编号仍按本次会议生成。匹配不确定时使用编号，声纹资料不会发送给大模型。</p>{profiles.map(profile => <div className="voice-profile-row" key={profile.id}><input aria-label="声纹姓名" value={profile.name} onChange={e => edit(profile.id, 'name', e.target.value)} maxLength={80}/><input aria-label={`${profile.name}全局角色`} value={profile.role} placeholder="角色 / 职务" onChange={e => edit(profile.id, 'role', e.target.value)} maxLength={80}/><button className="secondary-action" disabled={busy} onClick={() => save(profile)}><Save size={14}/>保存</button><button className="icon-button" title={`忘记 ${profile.name}`} aria-label={`忘记 ${profile.name}`} disabled={busy} onClick={() => remove(profile)}><Trash2 size={15}/></button></div>)}{!profiles.length && <div className="empty-list">尚未保存声纹。可以先开会，识别后再记住姓名。</div>}{notice && <p className="voice-notice" role="status">{notice}</p>}{error && <p className="voice-error" role="alert">{error}</p>}</section>;
}
