import React from 'react';
import { BookOpen, File, Folder, Package, X } from 'lucide-react';

const icons = { file: File, folder: Folder, skill: BookOpen, plugin: Package };
const labels = { file: '文件', folder: '文件夹', skill: 'Skill', plugin: '插件' };
export default function ComposerReferences({ items, onRemove }) {
  if (!items.length) return null;
  return <div className={`composer-references ${onRemove ? '' : 'read-only'}`} aria-label="已引用内容">{items.map(item => {
    const Icon = icons[item.kind];
    return <span className={`composer-reference reference-${item.kind}`} key={item.key} title={`${labels[item.kind]}：${item.path || item.name}`}><Icon size={14}/><span>{item.name === '.' ? '工作目录' : item.kind === 'plugin' && ['computer-use', 'desktop'].includes(item.name) ? 'computer use' : item.name}</span>{onRemove && <button type="button" title={`移除引用 ${item.name}`} aria-label={`移除引用 ${item.name}`} onClick={() => onRemove(item.key)}><X size={12}/></button>}</span>;
  })}</div>;
}
