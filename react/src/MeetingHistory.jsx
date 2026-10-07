import React, { useEffect, useState } from 'react';
import { AudioLines, ChevronRight, LoaderCircle, RefreshCw, Search, Trash2 } from 'lucide-react';
import { clock, meetingDuration } from './voice-format.mjs';
import './voice-input.css';

export default function MeetingHistory({ workspace, get, onOpen }) {
  const [meetings, setMeetings] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [query, setQuery] = useState(''), [deleting, setDeleting] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    get('/api/speech/meetings').then(data => { if (alive) setMeetings(data.meetings || []); }).catch(reason => { if (alive) setError(reason.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workspace?.path, revision]);
  const items = meetings.filter(item => (!item.workspace || item.workspace === workspace?.path) && item.title.toLowerCase().includes(query.trim().toLowerCase()));
  async function removeMeeting(event, item) {
    event.stopPropagation();
    if (deleting || !window.confirm(`确定删除“${item.title}”吗？录音和逐字稿将永久删除，已生成的会议纪要会话会保留。`)) return;
    setDeleting(item.id); setError('');
    try {
      const response = await fetch(`/api/speech/sessions/${item.id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setMeetings(value => value.filter(meeting => meeting.id !== item.id));
    } catch (reason) { setError(reason.message); }
    finally { setDeleting(''); }
  }
  return <div className="meeting-history-page">
    <header><div><h1>会议记录</h1><span>{workspace?.name || '当前项目'}</span></div><button className="icon-button" title="刷新会议记录" aria-label="刷新会议记录" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? <LoaderCircle size={16} className="spin"/> : <RefreshCw size={16}/>}</button></header>
    <label className="meeting-history-search"><Search size={15}/><input aria-label="搜索会议" placeholder="搜索会议" value={query} onChange={event => setQuery(event.target.value)}/></label>
    {error && <p className="voice-error" role="alert">{error}</p>}
    <div className="meeting-history-list">{items.map(item => <div className="meeting-history-row" key={item.id}><button className="meeting-history-open" onClick={() => onOpen(item.id)}><AudioLines size={18}/><span><b>{item.title}</b><small>{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.endedAt || Number.isFinite(item.durationSeconds) ? clock(meetingDuration(item)) : '时长未记录'} · {item.segmentCount || 0} 段发言</small></span><small>{item.state === 'recording' ? '录制中' : item.state === 'interrupted' ? '已中断' : '已结束'}</small><ChevronRight size={15}/></button><button className="meeting-history-delete" title="删除会议记录" aria-label={`删除会议记录 ${item.title}`} disabled={deleting === item.id} onClick={event => removeMeeting(event, item)}>{deleting === item.id ? <LoaderCircle size={15} className="spin"/> : <Trash2 size={15}/>}</button></div>)}</div>
    {!loading && !items.length && <p className="meeting-history-empty">{query ? '没有匹配的会议' : '暂无会议记录'}</p>}
  </div>;
}
