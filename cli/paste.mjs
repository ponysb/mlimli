import { StringDecoder } from 'node:string_decoder';

// Only intercept bracketed paste; Terminal Kit remains responsible for key parsing.
export function installPasteHandler(term, insert) {
  const original = term.onStdin;
  const decoder = new StringDecoder('utf8');
  const start = '\x1b[200~', end = '\x1b[201~';
  let buffer = '', pasted = '', inside = false, timer;
  const forward = text => { if (text) original(Buffer.from(text)); };
  function consume() {
    clearTimeout(timer);
    while (buffer) {
      const marker = inside ? end : start;
      const position = buffer.indexOf(marker);
      if (position !== -1) {
        if (inside) {
          pasted += buffer.slice(0, position);
          insert(pasted);
          pasted = '';
        } else forward(buffer.slice(0, position));
        buffer = buffer.slice(position + marker.length);
        inside = !inside;
        continue;
      }
      let suffix = 0;
      for (let size = 1; size < marker.length; size++) if (buffer.endsWith(marker.slice(0, size))) suffix = size;
      const text = buffer.slice(0, buffer.length - suffix);
      buffer = suffix ? buffer.slice(-suffix) : '';
      if (inside) {
        pasted = (pasted + text).slice(0, 1000000);
      } else forward(text);
      if (buffer && !inside) timer = setTimeout(() => { const remaining = buffer; buffer = ''; forward(remaining); }, 30);
      break;
    }
  }
  term.onStdin = chunk => {
    const text = decoder.write(chunk);
    if (!inside && !buffer && text.length > 1 && /[\r\n]/.test(text) && !text.includes('\x1b')) { insert(text); return; }
    buffer += text;
    consume();
  };
  term.raw('\x1b[?2004h');
  return () => {
    clearTimeout(timer);
    term.stdin.removeListener('data', term.onStdin);
    term.onStdin = original;
    term.raw('\x1b[?2004l');
  };
}
