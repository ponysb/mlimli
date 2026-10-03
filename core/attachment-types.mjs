export const ATTACHMENT_LIMITS = { count: 10, imageBytes: 10 * 1024 * 1024, fileBytes: 25 * 1024 * 1024, totalBytes: 40 * 1024 * 1024 };
const MIMES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', zip: 'application/zip',
};
export function attachmentMime(name, mime = '') {
  const extension = String(name || '').split('.').at(-1).toLowerCase();
  return MIMES[extension] || (mime && mime !== 'application/octet-stream' ? mime.split(';')[0].toLowerCase() : 'application/octet-stream');
}
export function attachmentKind(mime) {
  return mime?.startsWith('image/') ? 'image' : mime?.startsWith('audio/') ? 'audio' : mime?.startsWith('video/') ? 'video' : 'file';
}
export function nativeAttachment(kind, mime, name, capabilities = {}, protocol = 'openai-chat') {
  if (kind === 'image') return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime) && capabilities.image !== false;
  if (kind === 'audio') return capabilities.audio === true && protocol === 'openai-chat' && ['audio/wav', 'audio/mpeg'].includes(mime);
  if (mime === 'application/pdf') return (capabilities.pdf === true || capabilities.file === true) && ['openai-chat', 'openai-responses', 'anthropic'].includes(protocol);
  return kind === 'file' && capabilities.file === true && protocol === 'openai-responses' && /\.(txt|md|json|html?|xml|js|ts|py|java|c|cpp|cs|go|rs|rb|sh|css|yaml|yml|docx?|pptx?|xlsx?|csv|tsv|rtf|odt)$/i.test(name || '');
}
