import React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewAnnotations from './PreviewAnnotations.jsx';

function editorContext() {
  const selection = String(window.getSelection?.()?.toString() || '').trim();
  const visible = element => element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  const activeThumb = document.querySelector('.thumb.active');
  const thumbs = [...document.querySelectorAll('.thumb')];
  const pdfPage = document.querySelector('.tb-page-input');
  const nameBox = [...document.querySelectorAll('input')].find(input => visible(input) && /^[A-Z]{1,3}\d+(?::[A-Z]{1,3}\d+)?$/i.test(input.value.trim()));
  const activeSheet = [...document.querySelectorAll('[role="tab"],button,.univer-sheet-bar-tab')].find(element => visible(element) && (element.getAttribute('aria-selected') === 'true' || element.classList.contains('active')) && !element.closest('.ribbon-tabs'));
  const proseMirror = document.querySelector('.ProseMirror');
  const locations = [];
  if (activeThumb) locations.push(`幻灯片 ${Math.max(1, thumbs.indexOf(activeThumb) + 1)} / ${thumbs.length}`);
  if (pdfPage?.value) locations.push(`PDF 第 ${pdfPage.value} 页`);
  if (activeSheet?.textContent?.trim()) locations.push(`工作表 ${activeSheet.textContent.trim().slice(0, 255)}`);
  if (nameBox?.value) locations.push(`单元格或区域 ${nameBox.value.trim()}`);
  if (proseMirror) {
    const page = [...document.querySelectorAll('.doc-page,.page-wrap')].findIndex(element => element.contains(document.activeElement) || element.contains(window.getSelection?.()?.anchorNode));
    locations.push(page >= 0 ? `Word 第 ${page + 1} 页附近` : 'Word 文档当前光标附近');
  }
  return { location: locations.join('；'), selection };
}

window.workbenchAgent.context().then(({ path }) => {
  const host = document.createElement('div');
  host.id = 'workbench-agent';
  document.body.append(host);
  createRoot(host).render(<PreviewAnnotations composerOnly storageKey={`office-agent:${path}`} path={path} contextProvider={() => window.workbenchAgent.context(editorContext())} onSend={message => window.workbenchAgent.send(message)}><span className="office-agent-save-hint">请先保存文档，再发送给 Agent</span></PreviewAnnotations>);
});
