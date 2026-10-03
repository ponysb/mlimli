const extension = file => String(file.path).split('.').at(-1).toLowerCase();
const deliverables = new Set(['html', 'htm', 'pdf', 'pptx', 'ppt', 'docx', 'xlsx', 'm4a', 'mp3', 'wav', 'mp4', 'webm', 'mov']);

export function primaryTaskArtifact({ primaryArtifact, files = [], artifacts = [], summaryText = '', promptText = '' } = {}) {
  const deleted = new Set(files.filter(file => file.status === 'deleted').map(file => file.path));
  const candidates = new Map();
  for (const file of [...files, ...artifacts]) {
    if (!file?.path || deleted.has(file.path)) continue;
    candidates.set(file.path, { ...candidates.get(file.path), ...file });
  }
  if (primaryArtifact?.path && !deleted.has(primaryArtifact.path)) return { ...candidates.get(primaryArtifact.path), ...primaryArtifact };
  const score = file => {
    const ext = extension(file), name = file.path.split('/').at(-1);
    let value = deliverables.has(ext) ? 40 : ['md', 'txt', 'csv'].includes(ext) ? 12 : 0;
    if (/^(?:输出|output|outputs|dist|deliverables)\//i.test(file.path)) value += 20;
    if (/(?:^|\/)(?:tools?|tests?|scripts?|assets|attachments|node_modules|\.agent)\//i.test(file.path)) value -= 45;
    if (/最终|成品|流畅版|(?:^|[._-])final(?:[._-]|$)/i.test(name)) value += 25;
    if (/^index\.html?$/i.test(name)) value += 30;
    if (summaryText.includes(file.path) || summaryText.includes(name)) value += 30;
    const mention = summaryText.indexOf(file.path) >= 0 ? summaryText.indexOf(file.path) : summaryText.indexOf(name);
    if (mention >= 0 && /主要(?:成果|文件)|交付(?:物|文件)|成品|最终(?:文件|版本)/.test(summaryText.slice(Math.max(0, mention - 70), mention))) value += 30;
    if (/ppt|幻灯片|演示文稿/i.test(promptText) && ['pptx', 'ppt'].includes(ext)) value += 60;
    if (/录音|剪辑|音频|m4a|mp3/i.test(promptText) && ['m4a', 'mp3', 'wav', 'mp4'].includes(ext)) value += 50;
    if (/网页|网站|html/i.test(promptText) && ['html', 'htm'].includes(ext)) value += 50;
    return value;
  };
  return [...candidates.values()].sort((a, b) => score(b) - score(a) || a.path.localeCompare(b.path))[0] || null;
}
