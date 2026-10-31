// Runtime helpers exported by pi that do not require pi's session or TUI runtime.
export const isToolCallEventType = (name, event) => event?.toolName === name;
export const isToolResultEventType = (name, event) => event?.toolName === name;
export const StringEnum = (values, options = {}) => ({ type: 'string', enum: [...values], ...options });
export const truncateHead = (text, options = {}) => truncate(text, options, false);
export const truncateTail = (text, options = {}) => truncate(text, options, true);
function truncate(text, { maxLines = 2000, maxBytes = 50000 } = {}, tail) {
  const all = String(text).split('\n'); const selected = tail ? all.slice(-maxLines) : all.slice(0, maxLines);
  let content = selected.join('\n');
  while (Buffer.byteLength(content) > maxBytes) content = tail ? content.slice(1) : content.slice(0, -1);
  return { content, truncated: content !== String(text), totalLines: all.length, outputLines: content.split('\n').length, totalBytes: Buffer.byteLength(String(text)), outputBytes: Buffer.byteLength(content) };
}
export const defineTool = definition => definition;
