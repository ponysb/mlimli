import React from 'react';
import { AlarmClock, BookOpen, ChevronDown, Library, MessageCircle, MoreHorizontal } from 'lucide-react';

const functions = [
  { id: 'schedules', label: '定时任务', Icon: AlarmClock },
  { id: 'meetings', label: '会议记录', Icon: MessageCircle },
  { id: 'experts', label: '专家库', Icon: BookOpen },
  { id: 'library', label: '资源库', Icon: Library },
];

export default function SidebarFunctions({ view, onView }) {
  const current = functions.find(item => item.id === view);
  return <details className={`sidebar-functions ${current ? 'has-selection' : ''}`}>
    <summary><MoreHorizontal size={17}/><span>{current?.label || '更多功能'}</span><ChevronDown size={14}/></summary>
    <nav aria-label="更多功能">
      {functions.map(({ id, label, Icon }) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={event => {
        event.currentTarget.closest('details').open = false;
        onView(id);
      }}><Icon size={16}/><span>{label}</span></button>)}
    </nav>
  </details>;
}
