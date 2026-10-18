const compact = document.querySelector('.compact-view');
const expanded = document.querySelector('.expanded-view');
const timers = [...document.querySelectorAll('.timer')];
const statuses = [...document.querySelectorAll('.status')];
const transcript = document.querySelector('.transcript');
const levels = [...document.querySelectorAll('.levels')];
const stopButtons = [...document.querySelectorAll('.stop-button')];

function clock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function render(state = {}) {
  timers.forEach(item => { item.textContent = clock(state.elapsed); });
  const label = state.phase === 'starting' ? '准备录制…' : state.phase === 'stopping' ? '正在保存…' : state.phase === 'save-error' ? '等待重试保存' : state.speaking ? '正在记录发言…' : '聆听中…';
  statuses.forEach(item => { item.textContent = label; });
  transcript.textContent = state.transcript || '正在等待发言';
  transcript.classList.toggle('empty', !state.transcript);
  levels.forEach(item => item.classList.toggle('idle', !state.speaking || state.phase !== 'recording'));
  stopButtons.forEach(item => { item.disabled = state.phase === 'stopping'; item.classList.toggle('saving', state.phase === 'stopping'); item.title = state.phase === 'stopping' ? '正在保存录音' : '结束录制'; });
  setExpanded(state.expanded === true);
}

function setExpanded(value) {
  compact.hidden = value;
  expanded.hidden = !value;
}

document.querySelector('.expand-button').addEventListener('click', () => window.desktop.meetingRecordingAction('expand'));
document.querySelector('.collapse-button').addEventListener('click', () => window.desktop.meetingRecordingAction('collapse'));
document.querySelector('.restore-button').addEventListener('click', () => window.desktop.meetingRecordingAction('restore'));
stopButtons.forEach(button => button.addEventListener('click', () => {
  if (button.disabled) return;
  const parts = timers[0]?.textContent.split(':').map(Number) || [0, 0];
  render({ phase: 'stopping', elapsed: (parts[0] || 0) * 60 + (parts[1] || 0), transcript: transcript.textContent });
  window.desktop.meetingRecordingAction('finish').catch(() => render({ phase: 'recording' }));
}));
window.desktop.onMeetingRecordingStateChanged(render);
window.desktop.onMeetingRecordingLayoutChanged(({ expanded: value }) => setExpanded(value));
window.desktop.getMeetingRecordingState().then(render);
