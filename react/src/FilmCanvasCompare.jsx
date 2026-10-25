import React, { useEffect, useRef } from 'react';
import { Focus, MessageSquare, Star, X } from 'lucide-react';

export default function FilmCanvasCompare({ nodes, Media, onClose, onFavorite, onReference, onLocate }) {
  const panel = useRef(null);
  useEffect(() => { const previous = document.activeElement; panel.current?.focus(); return () => previous?.focus(); }, []);
  return <div className="fc-preview-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} tabIndex={-1} className="fc-compare" role="dialog" aria-modal="true" aria-label="结果比较" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const buttons = [...panel.current.querySelectorAll('button, video, audio')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><strong>结果比较 <small>{nodes.length}</small></strong><button title="关闭比较" aria-label="关闭比较" onClick={onClose}><X size={18}/></button></header>
      <div className="fc-compare-grid" style={{ '--compare-count': nodes.length }}>
        {nodes.map(node => <article key={node.id}>
          <div className="fc-compare-media"><Media data={node.data} large/></div>
          <div className="fc-compare-caption"><strong>{node.data.title || '未命名结果'}</strong><button title={node.data.favorite ? '取消优选' : '标记优选'} aria-label={`${node.data.favorite ? '取消优选' : '标记优选'} ${node.data.title}`} aria-pressed={Boolean(node.data.favorite)} onClick={() => onFavorite(node.id)}><Star size={16} fill={node.data.favorite ? 'currentColor' : 'none'}/></button></div>
          <dl><dt>模型</dt><dd>{node.data.model || '未记录'}</dd><dt>提示词</dt><dd>{node.data.text || '未记录'}</dd>{node.data.params && <><dt>参数</dt><dd><pre>{JSON.stringify(node.data.params, null, 2)}</pre></dd></>}</dl>
          <footer><button onClick={() => onReference(node.id)}><MessageSquare size={14}/>继续创作</button><button title="定位节点" aria-label={`定位 ${node.data.title}`} onClick={() => onLocate(node.id)}><Focus size={15}/></button></footer>
        </article>)}
      </div>
    </section>
  </div>;
}
