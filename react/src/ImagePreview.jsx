import React, { useEffect, useRef, useState } from 'react';
import { Download, Eraser, FlipHorizontal2, Maximize, RotateCcw, RotateCw, Scaling, WandSparkles, ZoomIn, ZoomOut } from 'lucide-react';
import { AnnotationSurface, usePreviewAnnotations } from './PreviewAnnotations.jsx';
import './image-preview.css';

export default function ImagePreview({ src, name }) {
  const viewport = useRef(null), canvas = useRef(null);
  const [image, setImage] = useState(null), [error, setError] = useState('');
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(null), [rotation, setRotation] = useState(0), [flip, setFlip] = useState(false);
  const annotations = usePreviewAnnotations();
  useEffect(() => {
    const img = new Image(); let disposed = false;
    setImage(null); setError(''); setZoom(null); setRotation(0); setFlip(false);
    img.onload = () => { if (!disposed) setImage(img); };
    img.onerror = () => { if (!disposed) setError('图片加载失败'); };
    img.src = src;
    return () => { disposed = true; };
  }, [src]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width:entry.contentRect.width, height:entry.contentRect.height }));
    observer.observe(viewport.current); return () => observer.disconnect();
  }, []);
  const quarter = rotation % 180 !== 0;
  const width = image ? quarter ? image.naturalHeight : image.naturalWidth : 1;
  const height = image ? quarter ? image.naturalWidth : image.naturalHeight : 1;
  const fit = Math.min(1, Math.max(.01, (size.width - 48) / width), Math.max(.01, (size.height - 48) / height));
  const scale = zoom ?? fit;
  useEffect(() => {
    if (!image || !canvas.current) return;
    const target = canvas.current;
    target.width = width; target.height = height;
    const ctx = target.getContext('2d');
    ctx.translate(width / 2, height / 2); ctx.rotate(rotation * Math.PI / 180); ctx.scale(flip ? -1 : 1, 1);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  }, [image, width, height, rotation, flip]);
  const locked = !!annotations?.notes.length;
  function tool(label, Icon, action, disabled = false) {
    return <button type="button" aria-label={label} disabled={disabled} onClick={action}><Icon size={17}/><span role="tooltip">{label}</span></button>;
  }
  return <div className="image-workspace">
    <div className="image-tools" role="toolbar" aria-label="图片操作">
      {tool('缩小', ZoomOut, () => setZoom(Math.max(.05, scale / 1.25)), scale <= .05)}
      <button className="image-zoom" onClick={() => setZoom(scale === 1 ? null : 1)} aria-label="切换原始尺寸">{Math.round(scale * 100)}%</button>
      {tool('放大', ZoomIn, () => setZoom(Math.min(4, scale * 1.25)), scale >= 4)}
      {tool('适应窗口', Maximize, () => setZoom(null))}<i/>
      {tool(locked ? '清除批注后旋转' : '向左旋转', RotateCcw, () => setRotation(value => (value + 270) % 360), locked)}
      {tool(locked ? '清除批注后旋转' : '向右旋转', RotateCw, () => setRotation(value => (value + 90) % 360), locked)}
      {tool(locked ? '清除批注后翻转' : '水平翻转', FlipHorizontal2, () => setFlip(value => !value), locked)}<i/>
      {tool('移除背景 · Agent', WandSparkles, () => annotations?.request('请移除这张图片的背景，保留主体并另存为透明 PNG。'))}
      {tool('擦除区域 · Agent', Eraser, () => { annotations?.request('请擦除批注指定的区域，保持其余内容自然衔接，另存为新图片。'); annotations?.startSelection(); })}
      {tool('调整尺寸 · Agent', Scaling, () => annotations?.request('请调整这张图片的尺寸，保持比例并另存为新图片。目标尺寸：'))}<i/>
      <a href={src} download={name} aria-label="下载原图"><Download size={17}/><span role="tooltip">下载原图</span></a>
    </div>
    <div className="image-viewport" ref={viewport} onWheel={event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom(Math.max(.05, Math.min(4, scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))); } }}>
      {error ? <div role="alert">{error}</div> : image ? <div className="image-scroll-stage" style={{ minWidth:width * scale + 48, minHeight:height * scale + 48 }}><AnnotationSurface id="image" label="图片" context={`${name}；显示旋转 ${rotation} 度；水平翻转：${flip ? '是' : '否'}`} style={{ width:width * scale, height:height * scale }}><canvas ref={canvas} role="img" aria-label={name} style={{ width:'100%', height:'100%' }}/></AnnotationSurface></div> : <div className="file-empty">正在加载图片…</div>}
    </div>
  </div>;
}
