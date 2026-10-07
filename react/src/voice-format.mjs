export function clock(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
export function meetingDuration(meeting) {
  if (Number.isFinite(meeting.durationSeconds)) return Math.max(0, meeting.durationSeconds);
  if (meeting.endedAt && meeting.createdAt) return Math.max(0, (meeting.endedAt - meeting.createdAt) / 1000);
  return Math.max(0, ...(meeting.segments || []).map(segment => Number(segment.end) || 0));
}
