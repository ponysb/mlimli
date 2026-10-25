import React, { useEffect, useRef, useState } from 'react';
import { Eraser, Paintbrush, X } from 'lucide-react';

export default function FilmCanvasEdit({ node, url, onClose, onPrepare }) {
  const video = node.data.kind === 'video' || String(node.data.mime).startsWith('video/');
  const [mode, setMode] = useState(video ? 'clip' : 'crop'), [description, setDescription] = useState(''), [range, setRange] = useState({ x: 0, y: 0, width: 100, height: 100, start: 0, end: 5 });
  const [brush, setBrush] = useState(24), [erasing, setErasing] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1024, height: 1024 }), [duration, setDuration] = useState(86400), [hasMask, setHasMask] = useState(false);
  const canvas = useRef(null), drawing = useRef(false), panel = useRef(null), lastPoint = useRef(null);
  useEffect(() => { const previous = document.activeElement; panel.current?.focus(); return () => previous?.focus(); }, []);
  function paint(event) {
    if (!drawing.current) return;
    const rect = canvas.current.getBoundingClientRect(), context = canvas.current.getContext('2d');
    context.globalCompositeOperation = erasing ? 'destination-out' : 'source-over'; context.fillStyle = '#fff';
    const point = { x: (event.clientX - rect.left) * dimensions.width / rect.width, y: (event.clientY - rect.top) * dimensions.height / rect.height };
    context.strokeStyle = '#fff'; context.lineWidth = brush * 2; context.lineCap = 'round';
    if (lastPoint.current) { context.beginPath(); context.moveTo(lastPoint.current.x, lastPoint.current.y); context.lineTo(point.x, point.y); context.stroke(); }
    context.beginPath(); context.arc(point.x, point.y, brush, 0, Math.PI * 2); context.fill(); lastPoint.current = point;
  }
  function endPaint() {
    drawing.current = false; lastPoint.current = null;
    const pixels = canvas.current.getContext('2d').getImageData(0, 0, dimensions.width, dimensions.height).data;
    setHasMask(pixels.some((value, index) => index % 4 === 3 && value > 0));
  }
  const field = (key, label, max = 100) => <label>{label}<input type="number" min="0" max={max} step={video ? 0.1 : 1} value={range[key]} onChange={event => setRange(value => ({ ...value, [key]: Math.max(0, Math.min(max, Number(event.target.value))) }))}/></label>;
  return <div className="fc-preview-overlay"><section ref={panel} tabIndex={-1} className="fc-edit" role="dialog" aria-modal="true" aria-label="素材编辑" style={{ '--edit-media-width': `${65 * dimensions.width / dimensions.height}dvh` }} onKeyDown={event => {
    event.stopPropagation(); if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') {
      const controls = [...panel.current.querySelectorAll('button:not(:disabled),input,textarea,select,video')], first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header><strong>{node.data.title}</strong><button title="关闭编辑" aria-label="关闭编辑" onClick={onClose}><X size={18}/></button></header>
    <div className="fc-edit-body"><div className="fc-edit-media" style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}>{video ? <video src={url} controls onLoadedMetadata={event => { const media = event.currentTarget; setDimensions({ width: media.videoWidth || 1024, height: media.videoHeight || 1024 }); if (Number.isFinite(media.duration)) { setDuration(media.duration); setRange(value => ({ ...value, end: Math.min(value.end, media.duration) })); } }}/> : <img src={url} alt={node.data.title} onLoad={event => { const image = event.currentTarget, scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight)); setDimensions({ width: Math.max(1, Math.round(image.naturalWidth * scale)), height: Math.max(1, Math.round(image.naturalHeight * scale)) }); }}/>}<canvas ref={canvas} width={dimensions.width} height={dimensions.height} hidden={mode !== 'mask'} onPointerDown={event => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); paint(event); }} onPointerMove={paint} onPointerUp={endPaint} onPointerCancel={endPaint}/>{mode === 'crop' && <div className="fc-crop-region" style={{ left: `${range.x}%`, top: `${range.y}%`, width: `${Math.min(range.width, 100 - range.x)}%`, height: `${Math.min(range.height, 100 - range.y)}%` }}/>}</div>
    <div className="fc-edit-settings"><select aria-label="编辑方式" value={mode} onChange={event => setMode(event.target.value)}>{video ? <option value="clip">片段</option> : <><option value="crop">裁剪</option><option value="mask">局部重绘</option></>}</select>
      {mode === 'crop' && <div className="fc-edit-fields">{field('x', '左侧 %')}{field('y', '顶部 %')}{field('width', '宽度 %')}{field('height', '高度 %')}</div>}
      {mode === 'mask' && <><label>画笔<input type="range" min="4" max="80" value={brush} onChange={event => setBrush(Number(event.target.value))}/></label><button aria-label={erasing ? '切换画笔' : '切换橡皮擦'} title={erasing ? '画笔' : '橡皮擦'} onClick={() => setErasing(value => !value)}>{erasing ? <Paintbrush size={16}/> : <Eraser size={16}/>}</button><button onClick={() => { canvas.current.getContext('2d').clearRect(0, 0, dimensions.width, dimensions.height); setHasMask(false); }}>清空蒙版</button></>}
      {(mode === 'clip' || video) && <div className="fc-edit-fields">{field('start', '开始（秒）', duration)}{field('end', '结束（秒）', duration)}</div>}
      <textarea aria-label="编辑需求" placeholder="描述修改需求…" value={description} onChange={event => setDescription(event.target.value)}/>
      <button disabled={mode === 'mask' && !hasMask || mode === 'crop' && (!range.width || !range.height || range.x >= 100 || range.y >= 100) || video && range.end <= range.start} onClick={() => onPrepare({ mode: video ? 'clip' : mode, ...range, width: Math.min(range.width, 100 - range.x), height: Math.min(range.height, 100 - range.y), description, mask: mode === 'mask' ? canvas.current.toDataURL('image/png') : undefined })}>交给 Agent 编辑</button>
    </div></div></section></div>;
}
