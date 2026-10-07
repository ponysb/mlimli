// Speech assets are downloaded by the local client. Keeping this helper as a
// pass-through avoids accidentally routing model traffic through the account server.
export function speechDownloadServer() { return ''; }
export function speechDownloadUrl(url) { return url; }
export function speechSourceUrl(url) { return url; }
