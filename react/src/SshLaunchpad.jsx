import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ecosystemApps } from '../../shared/ssh-app-catalog.mjs';
import SshDesktopIcon from './SshDesktopIcon.jsx';
const groups = { finder:'system',monitor:'system',settings:'system',system:'system',editor:'development',terminal:'development',development:'development',databases:'development',applications:'utilities',utilities:'utilities' };
const descriptions = {finder:'浏览与管理远程文件',monitor:'CPU、内存与网络监控',editor:'查看与编辑文本文件',terminal:'SSH 命令行',system:'服务、容器与防火墙',applications:'发现与部署服务器应用',databases:'数据库诊断工具',development:'开发环境与工具',utilities:'服务器实用工具',settings:'桌面外观与操作偏好'};
export default function SshLaunchpad({ apps, connection, closing, onOpen, onClose }) {
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all');
  const panel=useRef(null);
  const [deployed,setDeployed]=useState([]),[status,setStatus]=useState('正在读取服务器应用…'),[opening,setOpening]=useState(''),[access,setAccess]=useState(null);
  useEffect(()=>{
    let cancelled=false;
    fetch(`/api/ssh/connections/${connection.id}/desktop/system`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({area:'ecosystem',action:'list'})}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'无法读取服务器应用');return result;}).then(result=>{
      if(cancelled)return;
      const rows=new Map();for(const line of result.stdout.split('\n'))try{const row=JSON.parse(line);rows.set(row.Names?.replace(/^mli-app-/,''),row);}catch{}
      setDeployed(ecosystemApps.filter(app=>rows.has(app.id)&&(app.category!=='database'||app.id==='adminer')).map(app=>({...app,running:rows.get(app.id).State==='running'})));setStatus('');
    }).catch(error=>{if(!cancelled)setStatus(error.message);});
    return()=>{cancelled=true;};
  },[connection.id]);
  async function openRemote(app) {
    setOpening(app.id);setAccess(null);setStatus('正在建立 SSH 隧道…');
    try{const response=await fetch(`/api/ssh/connections/${connection.id}/desktop/system`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({area:'ecosystem',action:'open',target:app.id})});const result=await response.json();if(!response.ok)throw new Error(result.error||'无法打开应用');const url=new URL(result.url);if(!['http:','https:'].includes(url.protocol)||url.hostname!=='127.0.0.1')throw new Error('无效的本机应用地址');setAccess({name:app.name,url:url.href});setStatus('');}catch(error){setStatus(error.message);}finally{setOpening('');}
  }
  const remoteEntries=deployed.filter(app=>(category==='all'||category==='server')&&`${app.name} ${app.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const entries=Object.entries(apps).filter(([id,app])=>(category==='all'||groups[id]===category)&&`${app.title} ${id} ${descriptions[id]}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{
    const previous=document.activeElement;
    panel.current.querySelector('input')?.focus();
    function key(e) {
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
      if(e.key==='Tab') {
        const nodes=[...panel.current.querySelectorAll('input,select,button:not(:disabled)')],first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('keydown',key,true);previous?.focus();};
  },[onClose]);
  const sections=category==='all'&&!query.trim() ? [['system','系统与管理'],['development','开发与效率'],['utilities','应用与工具']] : [[category,query.trim()?'搜索结果':'应用']];
  return <div className={`sd-launchpad-backdrop ${closing?'is-closing':''}`} onClick={onClose}><section className="sd-launchpad" role="dialog" aria-modal="true" aria-label="启动台" ref={panel} onClick={e=>e.stopPropagation()}>
    <header>
      <form className="sd-launchpad-search" onSubmit={e=>{e.preventDefault();if(entries.length===1)onOpen(entries[0][0]);else if(!entries.length&&remoteEntries.length===1)openRemote(remoteEntries[0]);}}><Search size={17}/><input aria-label="搜索启动台应用" placeholder="应用" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label="清除应用搜索" onClick={()=>setQuery('')}><X size={14}/></button>}</form>
      <select aria-label="应用分类" value={category} onChange={e=>setCategory(e.target.value)}>{[['all','全部应用'],['system','系统'],['development','开发'],['utilities','实用工具'],['server','服务器应用']].map(([id,title])=><option key={id} value={id}>{title}</option>)}</select>
      <button aria-label="关闭启动台" onClick={onClose}><X size={16}/></button>
    </header>
    <div className="sd-launchpad-content">
    {sections.map(([group,title])=>{
      const items=entries.filter(([id])=>category!=='all'||query.trim()||groups[id]===group);
      return items.length>0&&<section className="sd-launchpad-section" key={group}><h3>{title}<span>{items.length}</span></h3><div className="sd-launchpad-grid">{items.map(([id,app])=><button key={id} onClick={()=>onOpen(id)} title={descriptions[id]}><SshDesktopIcon app={id}/><b>{app.title}</b></button>)}</div></section>;
    })}
    {remoteEntries.length>0&&<section className="sd-launchpad-section"><h3>服务器应用<span>{remoteEntries.length}</span></h3><div className="sd-launchpad-grid">{remoteEntries.map(app=><button key={app.id} disabled={!!opening} onClick={()=>app.running?openRemote(app):onOpen('applications')} title={app.running?'通过 SSH 隧道访问':'已停止 · 前往应用中心启动'}><SshDesktopIcon app={app.category==='development'?'development':'applications'}/><b>{app.name}</b>{!app.running&&<small>已停止</small>}</button>)}</div></section>}
    {status&&<p className="sd-launchpad-status" role="status">{status}</p>}
    {access&&<p className="sd-launchpad-status"><a href={access.url} target="_blank" rel="noreferrer">打开 {access.name} ↗</a> · SSH 隧道已建立</p>}
    {!entries.length&&!remoteEntries.length&&<p className="sd-launchpad-empty">没有找到匹配的应用</p>}
    </div>
  </section></div>;
}
