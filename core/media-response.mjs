import fs from 'node:fs';

export function serveMedia(req, res, filePath, mime, extraHeaders = {}) {
  const size = fs.statSync(filePath).size;
  const headers = { 'content-type': mime, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', ...extraHeaders };
  let start = 0, end = size - 1;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    }
    if (!match || !(match[1] || match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}`, 'content-length': 0 }); res.end(); return true;
    }
    headers['content-range'] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(req.headers.range ? 206 : 200, { ...headers, 'content-length': Math.max(0, end - start + 1) });
  if (!size) { res.end(); return true; }
  const stream = fs.createReadStream(filePath, { start, end });
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
  return true;
}
