import React from 'react';
import { Film, Focus, X } from 'lucide-react';
import { referenceRoles, validReferenceRole } from './film-canvas-model.mjs';

export default function FilmCanvasReferences({ nodes, roles, setRoles, includeUpstream, setIncludeUpstream, total, mediaUrl, kindOf, onLocate, onRemove, onClear }) {
  return <div className="fc-references fc-reference-list">
    <header><span>引用 · {nodes.length}</span><button onClick={onClear}>清空</button></header>
    {nodes.map(node => <div key={node.id}>
      {mediaUrl(node.data) && kindOf(node.data) === 'image' ? <img src={mediaUrl(node.data)} alt=""/> : <span className="fc-reference-icon"><Film size={13}/></span>}
      <span title={node.data.title}>{node.data.title || '节点'}</span>
      <select aria-label={`${node.data.title || '节点'}的引用用途`} value={roles[node.id] || (node.type === 'prompt' ? '提示词' : '参考')} onChange={event => setRoles(value => ({ ...value, [node.id]: event.target.value }))}>
        {referenceRoles.map(role => <option key={role} disabled={!validReferenceRole(node, role)}>{role}</option>)}
      </select>
      <button title="定位引用" aria-label={`定位引用 ${node.data.title}`} onClick={() => onLocate(node.id)}><Focus size={13}/></button>
      <button title="移除引用" aria-label={`移除引用 ${node.data.title}`} onClick={() => onRemove(node.id)}><X size={13}/></button>
    </div>)}
    <label className="fc-upstream"><input type="checkbox" checked={includeUpstream} onChange={event => setIncludeUpstream(event.target.checked)}/>包含上游素材<span>{total} 个节点</span></label>
  </div>;
}
