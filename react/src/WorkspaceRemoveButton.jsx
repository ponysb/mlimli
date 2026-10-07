import React, { useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { confirmAction } from './ActionPopover.jsx';
import './workspace-remove-confirm.css';

export default function WorkspaceRemoveButton({ workspace, onRemove }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  async function remove(event) {
    if (open || busy) return;
    setOpen(true);
    const accepted = await confirmAction(`移除“${workspace.name}”？`, { anchor: event.currentTarget, description: '本地文件和会话记录将保留。', confirmLabel: '移除' });
    setOpen(false);
    if (!accepted) return;
    setBusy(true);
    try { await onRemove(workspace); }
    finally { setBusy(false); }
  }
  return <button className="project-remove" title={`移除工作目录 ${workspace.name}`} aria-label={`移除工作目录 ${workspace.name}`} aria-haspopup="dialog" aria-expanded={open} disabled={busy} onClick={remove}>{busy ? <LoaderCircle className="spin" size={14}/> : <X size={14}/>}</button>;
}
