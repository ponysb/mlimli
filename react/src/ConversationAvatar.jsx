import React from 'react';
import { UserRound } from 'lucide-react';

export default function ConversationAvatar({ role = 'assistant' }) {
  const user = role === 'user';
  return <span className={`message-avatar ${user ? 'user-avatar' : 'agent-avatar'}`} role="img" aria-label={user ? '用户头像' : '魔力工作台头像'}>
    {user ? <UserRound size={18} strokeWidth={1.7} aria-hidden="true"/> : <img src="/branding/logo.png" alt="" aria-hidden="true"/>}
  </span>;
}
