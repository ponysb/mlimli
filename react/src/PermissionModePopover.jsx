import React, { useState } from 'react';

export function savedPermissionMode() {
  try { return localStorage.getItem('mli.permission-mode') === 'auto-all' ? 'auto-all' : 'default'; }
  catch { return 'default'; }
}
export function rememberPermissionMode(mode) {
  try { localStorage.setItem('mli.permission-mode', mode); } catch {}
}

export default function PermissionModePopover({ mode, onChange, onError }) {
  const [pending, setPending] = useState(false);
  async function toggle() {
    setPending(true);
    try { await onChange(mode === 'auto-all' ? 'default' : 'auto-all'); }
    catch (error) { onError(error); }
    finally { setPending(false); }
  }
  return <div className="mode-popover permission-popover">
    <p>{mode === 'auto-all' ? '当前为完全访问，文件修改和命令执行将自动允许。' : '当前为默认权限，只读工具和安全查询自动执行；文件修改、其他命令及敏感操作会请求你的允许。'}</p>
    <div className="permission-toggle-row"><span>允许完全访问</span><button type="button" className="permission-switch" role="switch" aria-label="允许完全访问" aria-checked={mode === 'auto-all'} disabled={pending} onClick={toggle}><span/></button></div>
  </div>;
}
