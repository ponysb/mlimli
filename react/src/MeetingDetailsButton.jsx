import React from 'react';
import { AudioLines, ArrowUpRight } from 'lucide-react';

export default function MeetingDetailsButton({ meetingId, onOpen }) {
  if (!meetingId || !onOpen) return null;
  return <button type="button" className="message-meeting-details" onClick={() => onOpen(meetingId)}><AudioLines size={15}/><span>会议详情</span><ArrowUpRight size={14}/></button>;
}
