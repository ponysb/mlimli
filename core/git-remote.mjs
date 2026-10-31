export function validGitRemoteName(value) {
  const name = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) throw new Error('Git remote 名称无效');
  return name;
}

export function validateGitRemoteUrl(value) {
  const remoteUrl = String(value || '').trim();
  if (!remoteUrl || remoteUrl.length > 2000 || /[\s\x00-\x1f\x7f]/.test(remoteUrl) || remoteUrl.startsWith('-')) throw new Error('Git 地址无效');
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(remoteUrl)) {
    let parsed;
    try { parsed = new URL(remoteUrl); } catch { throw new Error('Git 地址格式无效'); }
    if (!['http:', 'https:', 'ssh:'].includes(parsed.protocol) || !parsed.hostname || parsed.password || (parsed.protocol !== 'ssh:' && parsed.username) || parsed.search || parsed.hash) throw new Error('Git 地址只支持 SSH/HTTPS，不能包含密码、HTTP 用户凭据、查询参数或片段');
    return remoteUrl;
  }
  if (/^(?:[A-Za-z0-9._-]+@)?(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\]):[A-Za-z0-9._~/-][A-Za-z0-9._~/-]*$/.test(remoteUrl)) return remoteUrl;
  throw new Error('Git 地址只支持 ssh://、https:// 或 user@host:path 格式');
}

export function redactGitRemoteUrl(value) {
  const text = String(value || '').trim();
  try {
    const parsed = new URL(text);
    parsed.password = '';
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') parsed.username = '';
    if (parsed.search) parsed.search = '?[redacted]';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    const scp = text.match(/^([^@/\s]+)@([^:/\s]+):(.*)$/);
    if (scp) return `${scp[1].split(':', 1)[0]}@${scp[2]}:${scp[3].split(/[?#]/, 1)[0]}`;
    return text.replace(/([?&][^=&#]+)=([^&#]*)/g, '$1=[redacted]').split('#', 1)[0];
  }
}

export function redactGitText(value) {
  return String(value || '').replace(/(?:https?|ssh):\/\/[^\s'"<>]+/gi, remote => redactGitRemoteUrl(remote));
}
