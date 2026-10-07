import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import './action-popover.css';

let present, trigger;
const visibilityListeners = new Set();
let visible = false;

function publishVisibility(value) {
  visible = value;
  for (const listener of visibilityListeners) listener(value);
}

export function useActionPopoverOpen() {
  const [open, setOpen] = useState(visible);
  useEffect(() => { visibilityListeners.add(setOpen); setOpen(visible); return () => visibilityListeners.delete(setOpen); }, []);
  return open;
}

function request(options) {
  if (!present) return Promise.resolve(options.input ? null : false);
  const anchor = options.anchor || trigger || document.activeElement;
  const rect = anchor?.getBoundingClientRect();
  return new Promise(resolve => present({ ...options, anchor, rect, resolve }));
}

export const confirmAction = (message, options = {}) => request({ message, confirmLabel: '删除', destructive: true, ...options });
export const promptAction = (message, initial = '', options = {}) => request({ message, initial, input: true, confirmLabel: '确定', ...options });

export default function ActionPopoverHost() {
  const [item, setItem] = useState(null), [placement, setPlacement] = useState(null), [value, setValue] = useState('');
  const pending = useRef(null), popup = useRef(null), input = useRef(null);
  function finish(result, restoreFocus = true) {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    setItem(null); setPlacement(null); publishVisibility(false);
    current.resolve(result);
    if (restoreFocus && current.anchor?.isConnected) current.anchor.focus?.({ preventScroll: true });
  }
  useLayoutEffect(() => {
    const capture = event => { trigger = event.target.closest?.('button, [role="button"], [tabindex], a, input') || event.target; };
    const show = next => {
      if (pending.current) pending.current.resolve(pending.current.input ? null : false);
      pending.current = next; setPlacement(null); setValue(next.initial || ''); setItem(next); publishVisibility(true);
    };
    present = show;
    document.addEventListener('click', capture, true);
    document.addEventListener('keydown', capture, true);
    return () => {
      if (present === show) present = null;
      document.removeEventListener('click', capture, true);
      document.removeEventListener('keydown', capture, true);
      if (pending.current) pending.current.resolve(pending.current.input ? null : false);
      pending.current = null; publishVisibility(false);
    };
  }, []);
  useLayoutEffect(() => {
    if (!item) return;
    const position = () => {
      const bounds = window.visualViewport;
      const viewportWidth = bounds?.width || innerWidth, viewportHeight = bounds?.height || innerHeight;
      const offsetLeft = bounds?.offsetLeft || 0, offsetTop = bounds?.offsetTop || 0;
      const width = Math.min(item.input ? 272 : 232, viewportWidth - 16);
      const rect = item.anchor?.isConnected ? item.anchor.getBoundingClientRect() : item.rect;
      const height = popup.current.getBoundingClientRect().height;
      const anchorRect = rect?.width ? rect : { left: offsetLeft + viewportWidth / 2, right: offsetLeft + viewportWidth / 2, top: offsetTop + viewportHeight / 2, bottom: offsetTop + viewportHeight / 2, width: 0 };
      const left = Math.max(offsetLeft + 8, Math.min(anchorRect.right - width, offsetLeft + viewportWidth - width - 8));
      const above = anchorRect.bottom + height + 8 > offsetTop + viewportHeight - 8;
      const top = Math.max(offsetTop + 8, Math.min(above ? anchorRect.top - height - 8 : anchorRect.bottom + 8, offsetTop + viewportHeight - height - 8));
      setPlacement({ left, top, width, maxHeight: viewportHeight - 16, '--confirm-arrow-left': `${Math.max(12, Math.min(width - 12, anchorRect.left + anchorRect.width / 2 - left))}px`, '--confirm-arrow-top': above ? 'auto' : '-5px', '--confirm-arrow-bottom': above ? '-5px' : 'auto', '--confirm-arrow-rotate': above ? '225deg' : '45deg' });
    };
    const outside = event => { if (!popup.current?.contains(event.target)) finish(item.input ? null : false, false); };
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(item.input ? null : false); }
      if (event.key === 'Tab') {
        const controls = [...popup.current.querySelectorAll('input, button')];
        const next = controls[(controls.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
        event.preventDefault(); next?.focus();
      }
    };
    position();
    const observer = new ResizeObserver(position); observer.observe(popup.current);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
      document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true);
    };
  }, [item]);
  useLayoutEffect(() => {
    if (!item || !placement) return;
    if (item.input) { input.current?.focus({ preventScroll: true }); input.current?.select(); }
    else popup.current?.querySelector('.action-popover-cancel')?.focus({ preventScroll: true });
  }, [item, Boolean(placement)]);
  if (!item) return null;
  return createPortal(<form ref={popup} className="action-popover" role="dialog" aria-modal="false" aria-labelledby="action-popover-title" aria-describedby={item.description ? 'action-popover-description' : undefined} style={placement || { visibility: 'hidden', width: item.input ? 272 : 232 }} onSubmit={event => { event.preventDefault(); finish(item.input ? value : true); }}>
    <b id="action-popover-title">{item.message}</b>
    {item.description && <p id="action-popover-description">{item.description}</p>}
    {item.input && <input ref={input} aria-label={item.message} value={value} onChange={event => setValue(event.target.value)}/>}
    <div className="action-popover-actions"><button type="button" className="action-popover-cancel" onClick={() => finish(item.input ? null : false)}>取消</button><button type="submit" className={item.destructive ? 'action-popover-danger' : 'action-popover-accept'}>{item.destructive && <Trash2 size={12}/>}<span>{item.confirmLabel}</span></button></div>
  </form>, document.body);
}
