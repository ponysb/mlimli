export function resolveResourceCover(value, baseUrl) {
  if (typeof value !== 'string' || !/^\/uploads\/resource-covers\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(value)) return null;
  try { return new URL(baseUrl.replace(/\/$/, '') + value).href; } catch { return null; }
}
