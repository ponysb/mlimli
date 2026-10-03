import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, GitBranch, LoaderCircle, Network, Plus, Send, X } from 'lucide-react';
import { CaptureUpdateAction, Excalidraw, MainMenu, convertToExcalidrawElements, exportToBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './whiteboard.css';

// Fonts are served locally in development and copied into the production build.
window.EXCALIDRAW_ASSET_PATH = '/whiteboard-assets/';

function template(kind, offset) {
  const prefix = `diagram-${crypto.randomUUID()}`;
  const node = (id, text, x, y, type = 'rectangle', color = '#e8f3ed') => ({
    type, id: `${prefix}-${id}`, x: x + offset, y, width: 170, height: 70,
    strokeColor: '#345448', backgroundColor: color, fillStyle: 'solid', roughness: 0,
    strokeWidth: 2, label: { text, fontFamily: 2, fontSize: 20 },
  });
  const arrow = (id, start, end, x, y, dx, dy) => ({
    type: 'arrow', id: `${prefix}-${id}`, x: x + offset, y, points: [[0, 0], [dx, dy]],
    start: { id: `${prefix}-${start}` }, end: { id: `${prefix}-${end}` },
    strokeColor: '#698279', strokeWidth: 2, roughness: 0, endArrowhead: kind === 'mindmap' ? null : 'arrow',
  });
  const skeleton = kind === 'mindmap' ? [
    node('root', '中心主题', 280, 250, 'ellipse', '#d9e8fb'),
    node('a', '分支一', 30, 80), node('b', '分支二', 530, 80, 'rectangle', '#fff0d7'),
    node('c', '分支三', 30, 430, 'rectangle', '#f4e7f1'), node('d', '分支四', 530, 430),
    arrow('ra', 'root', 'a', 300, 255, -110, -105), arrow('rb', 'root', 'b', 430, 255, 120, -105),
    arrow('rc', 'root', 'c', 300, 315, -110, 115), arrow('rd', 'root', 'd', 430, 315, 120, 115),
  ] : [
    node('start', '开始', 280, 40, 'ellipse', '#d9e8fb'), node('step', '处理任务', 280, 180),
    node('decision', '是否完成？', 280, 330, 'diamond', '#fff0d7'),
    node('end', '完成', 540, 330, 'ellipse'),
    arrow('a', 'start', 'step', 365, 110, 0, 70), arrow('b', 'step', 'decision', 365, 250, 0, 80),
    arrow('c', 'decision', 'end', 450, 365, 90, 0),
  ];
  return convertToExcalidrawElements(skeleton, { regenerateIds: false });
}

function readDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(blob);
  });
}

function CloseConfirmation({ onCancel, onKeep, onSave }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => { previous?.isConnected && previous.focus?.(); };
  }, []);
  function keyDown(event) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.current.querySelectorAll('button')];
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
  }
  return <div className="whiteboard-confirm-layer" onKeyDown={keyDown}><section ref={dialog} className="whiteboard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="whiteboard-close-title" aria-describedby="whiteboard-close-description">
    <h3 id="whiteboard-close-title">关闭白板？</h3>
    <p id="whiteboard-close-description">草稿会在本次打开的应用中保留。刷新或退出应用前，请保存可编辑文件。</p>
    <div className="whiteboard-confirm-actions"><button onClick={onCancel}>继续编辑</button><button onClick={onSave}><Download size={15}/>保存文件并关闭</button><button className="whiteboard-confirm-primary" onClick={onKeep}>保留草稿并关闭</button></div>
  </section></div>;
}

export default function WhiteboardDialog({ initialData, onDraftChange, onClose, onSend }) {
  const api = useRef(null), dialog = useRef(null);
  const initial = useRef(initialData || { elements: [], appState: { viewBackgroundColor: '#ffffff', currentItemFontFamily: 2, currentItemRoughness: 0, exportBackground: true }, files: {} });
  const [ready, setReady] = useState(false), [hasContent, setHasContent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { previous?.isConnected && previous.focus?.(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      const elements = api.current?.getSceneElements();
      if (elements?.length) api.current.scrollToContent(elements, { fitToContent: true, viewportZoomFactor: 0.8 });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready]);
  function change(elements, appState, files) {
    setHasContent(elements.some((element) => !element.isDeleted));
    onDraftChange({ elements, files, appState: { ...appState, collaborators: new Map() } });
  }
  function insert(kind) {
    if (!api.current) return;
    const current = api.current.getSceneElements();
    const offset = current.length ? Math.max(...current.map((element) => element.x + element.width)) + 120 : 0;
    const elements = template(kind, offset);
    api.current.updateScene({ elements: [...current, ...elements], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    api.current.scrollToContent(elements, { fitToContent: true });
    setError('');
  }
  function addNode() {
    const editor = api.current;
    if (!editor) return;
    const appState = editor.getAppState(), zoom = appState.zoom.value;
    const x = appState.width / (2 * zoom) - appState.scrollX - 85;
    const y = appState.height / (2 * zoom) - appState.scrollY - 35;
    const elements = convertToExcalidrawElements([{ type: 'rectangle', x, y, width: 170, height: 70, roughness: 0, backgroundColor: '#e8f3ed', fillStyle: 'solid', label: { text: '新节点', fontFamily: 2, fontSize: 20 } }]);
    editor.updateScene({ elements: [...editor.getSceneElements(), ...elements], appState: { selectedElementIds: { [elements[0].id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }
  function saveSource() {
    const editor = api.current; if (!editor) return false;
    const source = serializeAsJSON(editor.getSceneElements(), editor.getAppState(), editor.getFiles(), 'local');
    const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `白板-${Date.now()}.excalidraw`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  function requestClose() {
    if (busy) return;
    if (api.current?.getSceneElements().length) setConfirmClose(true);
    else onClose();
  }
  function keepAndClose() {
    const editor = api.current;
    if (editor) change(editor.getSceneElements(), editor.getAppState(), editor.getFiles());
    onClose();
  }
  function saveAndClose() {
    try { if (saveSource()) keepAndClose(); }
    catch (reason) { setConfirmClose(false); setError(reason.message || '白板保存失败，请重试'); }
  }
  async function send() {
    const editor = api.current; if (!editor || busy || !editor.getSceneElements().length) return;
    setBusy(true); setError('');
    try {
      const blob = await exportToBlob({ elements: editor.getSceneElements(), appState: { ...editor.getAppState(), exportBackground: true, exportWithDarkMode: false }, files: editor.getFiles(), mimeType: 'image/png', exportPadding: 32, maxWidthOrHeight: 2400 });
      if (blob.size > 10 * 1024 * 1024) throw new Error('白板图片超过 10 MB，请减少图片或拆分内容');
      await onSend(await readDataUrl(blob));
    } catch (reason) { setError(reason.message || '白板图片导出失败，请重试'); }
    finally { setBusy(false); }
  }
  function keyDown(event) {
    // Keep focus inside the modal without interfering with Excalidraw shortcuts.
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((item) => item.getClientRects().length);
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return createPortal(<div className="whiteboard-layer"><section ref={dialog} tabIndex={-1} inert={confirmClose} className="whiteboard-dialog" role="dialog" aria-modal={!confirmClose} aria-label="白板" onKeyDown={keyDown}>
    <header className="whiteboard-header"><h2>白板</h2><div className="whiteboard-template-actions"><button disabled={!ready || busy} onClick={() => insert('mindmap')}><GitBranch size={16}/>思维导图</button><button disabled={!ready || busy} onClick={() => insert('flowchart')}><Network size={16}/>流程图</button><button disabled={!ready || busy} onClick={addNode} title="添加节点"><Plus size={17}/></button></div><div className="whiteboard-header-actions"><button onClick={saveSource} disabled={!ready || busy || !hasContent} title="保存可编辑白板" aria-label="保存可编辑白板"><Download size={17}/></button><button onClick={requestClose} disabled={busy} title="关闭白板" aria-label="关闭白板"><X size={18}/></button></div></header>
    <div className="whiteboard-editor"><Excalidraw initialData={initial.current} langCode="zh-CN" theme="light" handleKeyboardGlobally={false} excalidrawAPI={(value) => { api.current = value; setReady(true); }} onChange={change} UIOptions={{ canvasActions: { toggleTheme: false, export: false, saveAsImage: false } }}><MainMenu><MainMenu.DefaultItems.LoadScene/><MainMenu.DefaultItems.SaveToActiveFile/><MainMenu.DefaultItems.ClearCanvas/><MainMenu.DefaultItems.ChangeCanvasBackground/></MainMenu></Excalidraw></div>
    <footer className="whiteboard-footer"><span role="alert">{error}</span><button className="whiteboard-send" disabled={!ready || !hasContent || busy} onClick={send}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>}添加到输入框</button></footer>
  </section>{confirmClose && <CloseConfirmation onCancel={() => setConfirmClose(false)} onKeep={keepAndClose} onSave={saveAndClose}/>}</div>, document.body);
}
