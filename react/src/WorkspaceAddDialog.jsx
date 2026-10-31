import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FolderOpen, Server, X, Plus, ChevronRight, ChevronUp, Check, RefreshCw } from 'lucide-react';
import './workspace-add.css';
export default function WorkspaceAddDialog({ workspaces, connections, activeIds, sessionMode, anchorRect, onClose, onManageSsh, onCreate, onRepository, onLoadRepositories, onBrowseRemote, onValidateRemote, suspended = false, onReload }) {
  const panel = useRef(null);
  const [position, setPosition] = useState(null);
  const [source, setSource] = useState('existing'), [editing, setEditing] = useState(false), [refreshing, setRefreshing] = useState(false), [connectionId, setConnectionId] = useState(connections[0]?.id || ''), [remotePath, setRemotePath] = useState(connections[0]?.workspaceRoot || '/'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [remoteEntries, setRemoteEntries] = useState([]), [remoteBusy, setRemoteBusy] = useState(false), [remoteBrowsed, setRemoteBrowsed] = useState(false);
  const current = workspaces.find(workspace => workspace.active);
  const repositoryLoader = useRef(onLoadRepositories);
  repositoryLoader.current = onLoadRepositories;
  const [repositoryState, setRepositoryState] = useState({ workspaceId: null, items: [], loading: false, error: '' });
  const [repositoryRevision, setRepositoryRevision] = useState(0);
  const [repositoryDrafts, setRepositoryDrafts] = useState({});
  const repositories = repositoryState.workspaceId === current?.id ? repositoryState.items : [];
  const sourceRepositories = repositories.filter(item => item.source === source);
  const draftKey = `${current?.id || ''}:${source}`;
  const url = repositoryDrafts[draftKey] ?? sourceRepositories[0]?.url ?? '';
  const setUrl = value => setRepositoryDrafts(drafts => ({ ...drafts, [draftKey]: value }));
  useEffect(() => {
    let cancelled = false;
    const workspaceId = current?.id;
    setRepositoryState({ workspaceId, items: [], loading: Boolean(workspaceId && current.kind !== 'ssh'), error: '' });
    if (workspaceId && current.kind !== 'ssh') {
      Promise.resolve().then(() => repositoryLoader.current?.(current) || []).then(items => {
        if (!cancelled) setRepositoryState({ workspaceId, items, loading: false, error: '' });
      }).catch(reason => {
        if (!cancelled) setRepositoryState({ workspaceId, items: [], loading: false, error: reason.message });
      });
    }
    return () => { cancelled = true; };
  }, [current?.id, current?.path, current?.kind, repositoryRevision]);
  useEffect(() => {
    const close = event => { if (event.key === 'Escape' && !busy && !suspended) onClose(); };
    const outside = event => { if (!busy && !suspended && !event.target.closest('.workspace-add-dialog')) onClose(); };
    window.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside); };
  }, [busy, onClose, suspended]);
  useEffect(() => { if (!connectionId && connections.length) { setConnectionId(connections[0].id); setRemotePath(connections[0].workspaceRoot || '/'); } }, [connections, connectionId]);
  useLayoutEffect(() => {
    const place = () => {
      const panelRect = panel.current?.getBoundingClientRect();
      if (!panelRect) return;
      const panelHeight = panelRect.height;
      if (!anchorRect) {
        setPosition({ top: Math.max(12, innerHeight - panelRect.height - 12), left: 12 });
        return;
      }
      const gap = 8, margin = 12;
      const above = anchorRect.top >= panelHeight + gap + margin;
      const top = above ? anchorRect.top - panelHeight - gap : Math.min(innerHeight - panelHeight - margin, anchorRect.bottom + gap);
      const left = Math.max(margin, Math.min(anchorRect.left, innerWidth - panelRect.width - margin));
      setPosition({ top: Math.max(margin, top), left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchorRect, editing, source, workspaces.length, error, repositoryState]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await onValidateRemote(connectionId, remotePath);
      await onCreate({ kind: 'ssh', connectionId, path: remotePath });
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const connected = activeIds.includes(connectionId);
  async function browseRemote(path = remotePath) { setRemoteBusy(true); setError(''); try { const result = await onBrowseRemote(connectionId, path); setRemotePath(result.path); setRemoteBrowsed(true); setRemoteEntries(result.entries.filter(entry => entry.type === 'directory')); } catch(e) { setError(e.message); } finally { setRemoteBusy(false); } }
  async function refresh() {
    setRefreshing(true); setError('');
    try { await onReload?.(); setRepositoryRevision(value => value + 1); } catch(error) { setError(error.message); } finally { setRefreshing(false); }
  }
  async function addLocalDirectory() {
    setError('');
    try {
      const path = await window.desktop?.chooseDirectory?.();
      if (!path) return;
      setBusy(true);
      await onCreate({ path });
      onClose();
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  }
  const sources = [['existing', '已有工作区'], ['gitee', 'Gitee'], ['github', 'GitHub'], ['gitlab', 'GitLab / 自建'], ['ssh', 'SSH']];
  return <div className="workspace-picker-layer"><section ref={panel} className="workspace-add-dialog" style={position || { visibility: 'hidden' }} role="dialog" aria-label="工作区" aria-busy={busy}>
    <header><h3>工作区</h3><div><button className="workspace-icon" type="button" aria-label="刷新工作区" title="刷新工作区" disabled={busy || refreshing} onClick={refresh}><RefreshCw size={14} className={refreshing ? 'spin' : ''}/></button><button className="workspace-icon" aria-label="关闭工作区" title="关闭" disabled={busy} onClick={onClose}><X size={16}/></button></div></header>
    <div className="workspace-source-tabs" role="tablist" aria-label="工作区来源">{sources.map(([id,label]) => <button key={id} role="tab" aria-selected={source === id} disabled={busy} onClick={() => { setSource(id); setError(''); setEditing(id !== 'existing'); }}>{label}</button>)}</div>
    {!editing && source === 'existing' && <div className="workspace-quick-add">
        <div className="workspace-quick-path"><FolderOpen size={15}/><span title={current?.path || ''}>{current?.path || '当前没有工作目录'}</span></div>
        <button className="workspace-quick-add-button" disabled={busy} onClick={addLocalDirectory}><Plus size={14}/>{busy ? '正在添加…' : '添加文件夹'}</button>
        {error && <div className="workspace-add-error" role="alert">{error}</div>}
      </div>}
    {editing && source === 'ssh' && <form className="workspace-ssh-form" onSubmit={submit}><fieldset disabled={busy}>
      <label>SSH 服务器<select required value={connectionId} onChange={event => { setRemoteBrowsed(false); setRemoteEntries([]); setConnectionId(event.target.value); setRemotePath(connections.find(item => item.id === event.target.value)?.workspaceRoot || '/'); }}><option value="" disabled>请选择服务器</option>{connections.map(connection => <option value={connection.id} key={connection.id}>{connection.name} · {activeIds.includes(connection.id) ? '已连接' : '未连接'}</option>)}</select></label>
      <label>远程项目目录<input required list="ssh-project-directories" disabled={!connected} value={remotePath} placeholder="/home/user/project" onChange={event => setRemotePath(event.target.value)}/><datalist id="ssh-project-directories">{connections.find(item => item.id === connectionId)?.workspaceRoot && <option value={connections.find(item => item.id === connectionId).workspaceRoot}/>}</datalist></label>
      <div className="workspace-source-note"><span>{connected ? '已连接，可浏览服务器目录' : '请先添加或连接 SSH 服务器'}</span><div>{connected && <button type="button" disabled={remoteBusy} onClick={() => browseRemote()}><FolderOpen size={14}/>{remoteBusy ? '读取中…' : '浏览目录'}</button>}<button type="button" onClick={onManageSsh}><Server size={14}/>管理 / 连接服务器<ChevronRight size={14}/></button></div></div>
      {remoteBrowsed && <div className="workspace-remote-entries">{remotePath !== '/' && <button type="button" onClick={() => browseRemote(remotePath.split('/').slice(0, -1).join('/') || '/')}><ChevronUp size={14}/>上一级</button>}{remoteEntries.map(entry => <button key={entry.path} type="button" onClick={() => browseRemote(entry.path)}><FolderOpen size={14}/>{entry.name}</button>)}</div>}
    </fieldset>{error && <div className="workspace-add-error" role="alert">{error}</div>}<footer><button type="button" disabled={busy} onClick={() => { setSource('existing'); setEditing(false); setError(''); }}>返回</button><button type="submit" className="workspace-submit" disabled={busy || !connected}><Plus size={15}/>{busy ? '正在添加…' : sessionMode ? '使用此目录' : '添加并打开'}</button></footer></form>}

    {editing && ['gitee', 'github', 'gitlab'].includes(source) && <section className="workspace-git-form" aria-label="Git 仓库">
      <label>仓库地址<input disabled={busy} value={url} placeholder={source === 'gitee' ? 'https://gitee.com/owner/repo.git' : source === 'github' ? 'https://github.com/owner/repo.git' : 'https://git.example.com/group/repo.git'} onChange={event => setUrl(event.target.value)}/></label>
      <div className="workspace-repository-target">保存位置：{current?.kind === 'ssh' ? '当前为 SSH 工作区，暂不支持本机克隆' : current?.path || '请先选择本地工作目录'}</div>
      <p className="workspace-git-help">有 Git 时克隆仓库；未安装 Git 时，将仓库地址保存为工作目录中的文件，供 Agent 读取。</p>
      <div className="workspace-repositories" aria-label="当前工作区仓库">
        <h4>已添加的仓库</h4>
        {repositoryState.loading ? <p role="status">正在读取…</p> : repositoryState.error ? <p role="alert">{repositoryState.error}</p> : sourceRepositories.length ? sourceRepositories.map(repository => <button type="button" key={repository.path} disabled={busy} onClick={() => setUrl(repository.url)} title={repository.path}>
          <span><b>{repository.name}</b><small>{repository.url}</small></span><em>{repository.mode === 'reference' ? '已保存地址' : '已克隆'}</em>
        </button>) : <p>当前工作区暂无此来源的仓库</p>}
      </div>
      {error && <div className="workspace-add-error" role="alert">{error}</div>}
      <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="workspace-submit" disabled={busy || !url.trim() || !current?.path || current.kind === 'ssh'} onClick={async () => {
        setBusy(true); setError('');
        try {
          await onRepository({ url: url.trim(), workspace: current });
          setUrl(url.trim());
          setRepositoryRevision(value => value + 1);
        }
        catch (reason) { setError(reason.message); } finally { setBusy(false); }
      }}>{busy ? '正在添加…' : '添加到工作区'}</button></footer>
    </section>}
  </section></div>;
}
