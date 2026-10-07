import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookOpen, ChevronRight, File, Folder, LoaderCircle, Minimize2, Package, Paperclip, Pencil, Search, Sparkles, Terminal, X } from 'lucide-react';
import { capabilityItems, composerTrigger, insertCapability, joinComposerReferences, splitComposerReferences, referenceToken } from './composer-capabilities.mjs';
import ComposerReferences from './ComposerReferences.jsx';
import './composer-input.css';

const icons = { file: File, folder: Folder, browse: Folder, skill: BookOpen, plugin: Package, expert: Sparkles, command: Terminal, upload: Paperclip, board: Pencil, compact: Minimize2 };

export default function ComposerInput({ value: serializedValue, onChange: onSerializedChange, onPaste, onSend, disabled, attachmentLoading, placeholder, info, workspace, running, onExpert, onUpload, onBoard, onCompact, canCompact, compacting }) {
  const { text: value, references } = useMemo(() => splitComposerReferences(serializedValue), [serializedValue]);
  const onChange = text => onSerializedChange(joinComposerReferences(text, references));
  const input = useRef(null), fileSearchInput = useRef(null), root = useRef(null), popup = useRef(null), list = useRef(null), requestId = useRef(0);
  const pendingCaret = useRef(null);
  const dismissed = useRef(null);
  const [placement, setPlacement] = useState({});
  const [fileRevision, setFileRevision] = useState(0);
  const [fileSearch, setFileSearch] = useState(''), [fileStatus, setFileStatus] = useState({});
  const [trigger, setTrigger] = useState(null), [index, setIndex] = useState(0), [directory, setDirectory] = useState(null), [files, setFiles] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const capabilities = useMemo(() => capabilityItems(info), [info]);
  const query = trigger?.query.toLocaleLowerCase() || '';
  const rows = useMemo(() => {
    if (!trigger) return [];
    if (directory !== null) {
      return files.map(item => ({ ...item, key: `${item.type}:${item.path}`, kind: item.type === 'directory' ? 'folder' : 'file', group: '文件和文件夹', description: item.path }));
    }
    const actions = [
      { key: 'browse', kind: 'browse', name: '文件和文件夹', description: workspace?.name || '工作目录', group: '添加' },
      { key: 'upload', kind: 'upload', name: '本地附件', description: '', group: '添加' },
      { key: 'board', kind: 'board', name: '画板', description: '', group: '添加' },
      { key: 'compact', kind: 'compact', name: compacting ? '正在压缩上下文' : '压缩上下文', description: !canCompact ? '当前没有可压缩的会话' : running ? '停止任务后可压缩' : '保留目标和近期记录', group: '会话' },
    ];
    const items = trigger.symbol === '/' ? [...capabilities.filter(item => item.kind === 'command'), ...actions, ...capabilities.filter(item => item.kind !== 'command')] : [...actions, ...capabilities.filter(item => item.kind !== 'command'), ...capabilities.filter(item => item.kind === 'command')];
    return items.filter(item => !query || `${item.name} ${item.displayName || ''} ${item.description || ''} ${item.group}`.toLocaleLowerCase().includes(query.replace(/^\//, '')));
  }, [trigger, directory, files, query, capabilities, workspace, compacting, canCompact, running]);

  function close() { dismissed.current = { text: value, caret: input.current?.selectionStart }; setTrigger(null); setDirectory(null); setError(''); }
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !input.current) return;
    const caret = Math.min(value.length, pendingCaret.current);
    pendingCaret.current = null;
    input.current.focus();
    input.current.setSelectionRange(caret, caret);
  });
  useLayoutEffect(() => { if (directory !== null) fileSearchInput.current?.focus(); }, [directory]);
  function updateTrigger(text, caret) {
    if (dismissed.current?.text === text && dismissed.current.caret === caret) return;
    const next = composerTrigger(text, caret);
    setTrigger(next); setIndex(0);
    if (!next || next.symbol !== trigger?.symbol || next.start !== trigger?.start) { setDirectory(null); setError(''); }
  }
  useLayoutEffect(() => {
    if (!value) close();
    else if (trigger && value.slice(trigger.start, trigger.end) !== trigger.symbol + trigger.query) close();
  }, [value]);
  useEffect(() => { close(); }, [workspace?.id]);
  useEffect(() => {
    if (!trigger) return;
    const dismiss = event => { if (!root.current?.contains(event.target) && !popup.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [Boolean(trigger)]);
  useLayoutEffect(() => {
    if (!trigger) return;
    const position = () => {
      const rect = input.current.getBoundingClientRect(), width = Math.min(460, rect.width, innerWidth - 16);
      setPlacement({ position: 'fixed', left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), bottom: innerHeight - rect.top + 8, width, maxHeight: Math.max(0, Math.min(440, rect.top - 16)) });
    };
    position(); window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [Boolean(trigger)]);
  useEffect(() => { setIndex(0); }, [directory, query, fileSearch, files]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);
  useEffect(() => {
    const id = ++requestId.current;
    if (!trigger || !workspace) return;
    const search = directory !== null ? fileSearch : query;
    if (directory === null && !query) { setFiles([]); setLoading(false); setFileStatus({}); return; }
    setLoading(true); setError(''); setFiles([]); setFileStatus({});
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(`/api/files/references?query=${encodeURIComponent(search)}`, { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '文件加载失败');
      if (id === requestId.current) { setFiles(data.entries || []); setFileStatus({ hasMore: data.hasMore, incomplete: data.incomplete }); }
    }).catch(reason => { if (!controller.signal.aborted && id === requestId.current) setError(reason.message); }).finally(() => { if (id === requestId.current) setLoading(false); }), search ? 120 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [Boolean(trigger), directory, query, fileSearch, workspace?.id, fileRevision]);

  const results = directory === null && query ? [...rows, ...files.map(item => ({ ...item, key: `${item.type}:${item.path}`, kind: item.type === 'directory' ? 'folder' : 'file', group: '文件和文件夹', description: item.path }))] : rows;
  function change(text, caret) {
    pendingCaret.current = caret;
    onChange(text);
  }
  function browse() {
    change(value.slice(0, trigger.start) + trigger.symbol + value.slice(trigger.end), trigger.start + 1);
    setTrigger({ ...trigger, query: '', end: trigger.start + 1 }); setDirectory(''); setFileSearch(''); setFiles([]); setIndex(0);
  }
  function choose(item) {
    if (!item) return;
    if (item.kind === 'browse') { browse(); return; }
    if (item.kind === 'expert' && running) return;
    if (item.kind === 'compact' && (!canCompact || running || compacting)) return;
    const reference = ['file', 'folder', 'skill', 'plugin'].includes(item.kind);
    if (reference && references.length >= 20 && !references.some(entry => entry.key === referenceToken(item))) { setError('最多引用 20 项'); return; }
    const inserted = insertCapability(value, trigger, reference ? { kind: 'expert' } : item);
    if (reference) {
      const next = splitComposerReferences(referenceToken(item)).references[0];
      pendingCaret.current = inserted.caret;
      onSerializedChange(joinComposerReferences(inserted.text, [...references, next]));
    } else change(inserted.text, inserted.caret);
    close();
    if (item.kind === 'expert') onExpert(item);
    if (item.kind === 'upload') onUpload();
    if (item.kind === 'board') onBoard();
    if (item.kind === 'compact') onCompact();
  }
  function keyDown(event) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (trigger) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); input.current?.focus(); return; }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setIndex(n => (n + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, results.length)) % Math.max(1, results.length)); return; }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') { event.preventDefault(); choose(results[index]); return; }
    }
    if (event.key === 'Backspace' && !value && references.length) { event.preventDefault(); onSerializedChange(joinComposerReferences('', references.slice(0, -1))); return; }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!attachmentLoading && !compacting) onSend(); }
  }
  return <div className="composer-input" ref={root}>
    <ComposerReferences items={references} onRemove={key => onSerializedChange(joinComposerReferences(value, references.filter(item => item.key !== key)))}/>
    {trigger && createPortal(<div className="capability-popover" ref={popup} style={placement} aria-label="引用与能力菜单">
      <header>{directory !== null ? <><button title="返回" aria-label="返回能力菜单" onMouseDown={event => event.preventDefault()} onClick={() => { setDirectory(null); input.current?.focus(); }}><ArrowLeft size={15}/></button><span>{workspace?.name || '工作目录'}</span></> : <><Search size={14}/><span>{query || (trigger.symbol === '/' ? '命令与能力' : '添加引用')}</span></>}<button title="关闭菜单" aria-label="关闭引用菜单" onClick={() => { close(); input.current?.focus(); }}><X size={14}/></button></header>
      {directory !== null && <div className="capability-file-search"><Search size={14}/><input ref={fileSearchInput} aria-label="搜索工作目录文件" aria-autocomplete="list" aria-controls="composer-capabilities" aria-activedescendant={results[index] ? `composer-capability-${index}` : undefined} placeholder="搜索文件或文件夹" value={fileSearch} onChange={event => setFileSearch(event.target.value)} onKeyDown={event => { if (['Escape', 'ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key)) { keyDown(event); event.stopPropagation(); } }}/></div>}
      <div className="capability-list" role="listbox" id="composer-capabilities" aria-label="可引用能力" ref={list}>
        {results.map((item, i) => { const Icon = icons[item.kind], unavailable = item.kind === 'expert' && running || item.kind === 'compact' && (!canCompact || running || compacting); return <React.Fragment key={item.key}>{(i === 0 || results[i - 1].group !== item.group) && <div className="capability-group">{item.group}</div>}<div className={`capability-option ${i === index ? 'active' : ''} ${unavailable ? 'unavailable' : ''}`} role="option" title={item.path} id={`composer-capability-${i}`} aria-selected={i === index} aria-disabled={unavailable} onMouseEnter={() => setIndex(i)} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}><Icon size={17}/><span className={`capability-label ${['file', 'folder'].includes(item.kind) ? 'capability-file-label' : ''}`}><b>{item.displayName || item.name}</b>{item.description && <small>{item.description}</small>}{item.kind === 'expert' && unavailable && <small>会话运行中</small>}</span>{item.kind === 'browse' && <ChevronRight size={15}/>}</div></React.Fragment>; })}
        {loading && <div className="capability-status"><LoaderCircle className="spin" size={14}/>加载文件…</div>}
        {fileStatus.hasMore && !loading && <div className="capability-status">结果较多，请缩小搜索范围</div>}
        {fileStatus.incomplete && !loading && <div className="capability-status">部分目录未能扫描</div>}
        {error && <div className="capability-status" role="alert">{error}<button onClick={() => setFileRevision(revision => revision + 1)}>重试</button></div>}
        {!results.length && !loading && <div className="capability-status">没有匹配项</div>}
      </div>
    </div>, document.body)}
    <textarea ref={input} value={value} aria-label="会话输入" aria-autocomplete="list" aria-controls={trigger ? 'composer-capabilities' : undefined} aria-expanded={Boolean(trigger)} aria-activedescendant={trigger && results[index] ? `composer-capability-${index}` : undefined} onPaste={onPaste} onChange={event => { dismissed.current = null; onChange(event.target.value); updateTrigger(event.target.value, event.target.selectionStart); }} onSelect={event => updateTrigger(event.target.value, event.target.selectionStart)} onKeyDown={keyDown} placeholder={placeholder} disabled={disabled}/>
  </div>;
}
