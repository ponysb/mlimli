import React, { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  File,
  FileImage,
  FileText,
  Globe2,
  Image,
  MoreHorizontal,
  PanelRight,
  ChevronRight,
  Package,
  Sparkles,
  Target,
  Wrench,
  X,
} from "lucide-react";
import { collectSessionContext } from "./session-context.mjs";

const imageExt = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const fileIcon = (path) => (imageExt.test(path || "") ? FileImage : FileText);

function Section({ title, count, visibleCount = count, children }) {
  if (!visibleCount) return null;
  return (
    <section className="context-section">
      <header>
        <b>{title}</b>
        <span>{count}</span>
      </header>
      <div>{children}</div>
    </section>
  );
}

function collectUsedCapabilities(entries = [], live, info, current, appCatalog) {
  const all = [...(Array.isArray(entries) ? entries : []), ...(live ? [live] : [])];
  const tools = new Map();
  const skills = new Map();
  const plugins = new Map();
  for (const entry of all) {
    if (entry?.type === "state" && entry.expertId) {
      const expert = info?.experts?.find((item) => item.id === entry.expertId);
      if (expert) skills.set(`expert:${expert.id}`, { ...expert, kind: "expert" });
    }
    for (const call of [...(entry?.toolCalls || []), ...(entry?.tools || [])]) {
      const name = String(call?.name || "").trim();
      if (!name) continue;
      const definition = info?.tools?.find((item) => item.name === name);
      tools.set(name, { name, description: definition?.description || "", plugin: definition?.plugin || "core" });
      if (name === "read_skill" && call?.args?.name) {
        const skill = [...(info?.localSkills || []), ...(info?.plugins?.skills || [])].find((item) => item.name.toLowerCase() === String(call.args.name).toLowerCase());
        if (skill) skills.set(`skill:${skill.name}`, { ...skill, kind: "skill" });
      }
      if (name === "app_open" || name === "app_snapshot" || name === "app_action") {
        const app = appCatalog?.apps?.find((item) => item.id === call?.args?.app_id);
        if (app) plugins.set(`app:${app.id}`, { name: app.name || app.id, kind: "app", plugin: "应用台" });
      } else if (name === "mcp" || name.startsWith("mcp_")) {
        const mcpName = call?.args?.name || call?.args?.query || name;
        plugins.set(`mcp:${mcpName}`, { name: String(mcpName), kind: "mcp", plugin: "MCP" });
      }
      else if (definition?.plugin && definition.plugin !== "core") plugins.set(`plugin:${definition.plugin}`, { name: definition.plugin, kind: "plugin" });
    }
    if (entry?.type === "tool_output" && entry?.ui?.kind === "skill" && entry.ui.name)
      skills.set(`skill:${entry.ui.name}`, { name: entry.ui.name, description: entry.ui.description || "", kind: "skill" });
  }
  const expertId = current?.expertId;
  if (expertId) {
    const expert = info?.experts?.find((item) => item.id === expertId);
    if (expert) skills.set(`expert:${expert.id}`, { ...expert, kind: "expert" });
  }
  return { tools: [...tools.values()], skills: [...skills.values()], plugins: [...plugins.values()] };
}

function UsedCapabilities({ entries, live, info, current, appCatalog }) {
  const [expanded, setExpanded] = React.useState(false);
  const used = collectUsedCapabilities(entries, live, info, current, appCatalog);
  const total = used.skills.length + used.plugins.length + used.tools.length;
  if (!total) return null;
  return <section className={`context-used-capabilities ${expanded ? "is-open" : ""}`}>
    <button className="context-used-summary" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      <span><b>本次任务使用工具</b></span><span><small>{total} 项</small><ChevronRight size={14} /></span>
    </button>
    {expanded && <div className="context-used-list">{[...used.skills, ...used.plugins, ...used.tools].map((item, index) => {
      const Icon = item.kind === "expert" ? Sparkles : item.kind === "skill" ? Wrench : item.kind === "plugin" ? Package : item.kind === "mcp" ? Globe2 : FileText;
      const label = item.kind === "expert" ? "专家" : item.kind === "skill" ? "Skill" : item.kind === "plugin" ? "插件" : item.kind === "mcp" ? "MCP" : "工具";
      return <div className="context-capability" key={`${item.kind}:${item.name}:${index}`}><Icon size={14}/><span><b>{item.name}</b><small>{label}{item.plugin && item.kind === "tool" ? ` · ${item.plugin}` : ""}</small></span></div>;
    })}</div>}
  </section>;
}

export default function SessionContextPanel({
  entries,
  live,
  onClose,
  onExpand,
  full = false,
  onOpenFile,
  onOpenMedia,
  info,
  current,
  appCatalog,
  mode = "context",
  onOpenAsset,
}) {
  const context = useMemo(
    () => collectSessionContext(entries, live),
    [entries, live],
  );
  const empty =
    !current?.goal?.text &&
    !context.outputs.length &&
    !context.files.length &&
    !context.sources.length &&
    !context.media.length &&
    !context.operationPreviews?.length &&
    !collectUsedCapabilities(entries, live, info, current, appCatalog).tools.length &&
    !collectUsedCapabilities(entries, live, info, current, appCatalog).skills.length &&
    !collectUsedCapabilities(entries, live, info, current, appCatalog).plugins.length;
  let compactBudget = 3;
  const visibleGroups = {};
  for (const key of ["outputs", "files", "sources", "media"]) {
    const items = context[key];
    visibleGroups[key] = full ? items : items.slice(0, compactBudget);
    compactBudget = Math.max(0, compactBudget - visibleGroups[key].length);
  }
  const totalCount =
    context.outputs.length +
    context.files.length +
    context.sources.length +
    context.media.length;
  const hiddenCount = full ? 0 : Math.max(0, totalCount - 3);
  const [operationsOpen, setOperationsOpen] = React.useState(false);
  const operationPreviews = context.operationPreviews || [];
  return (
    <aside
      className={`session-context-panel ${full ? "is-full" : "is-compact"}`}
      aria-label="任务上下文"
    >
      <header className="context-panel-head">
        <b>{mode === "available" ? "当前可用" : "任务上下文"}</b>
        <div>
          {operationPreviews.length > 0 && (
            <button
              className={operationsOpen ? "active" : ""}
              title="查看浏览器和桌面操作画面"
              aria-label="查看浏览器和桌面操作画面"
              onClick={() => setOperationsOpen((value) => !value)}
            >
              <Globe2 size={16} />
              <span className="context-operation-count">{operationPreviews.length}</span>
            </button>
          )}
          {!full && onExpand && (
            <button
              title="在右侧分屏显示全部上下文"
              aria-label="在右侧分屏显示全部上下文"
              onClick={onExpand}
            >
              <PanelRight size={16} />
            </button>
          )}
          <button
            title="关闭任务上下文"
            aria-label="关闭任务上下文"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="context-panel-scroll">
        {mode === "available" ? <AvailableCapabilitiesPanel info={info} appCatalog={appCatalog} onOpenAsset={onOpenAsset} /> : <>
          {operationsOpen && <OperationPreviewStack items={operationPreviews} />}
        {empty && (
          <div className="context-empty">
            <File size={22} />
            <b>暂无上下文</b>
            <span>操作文件、网页和生成内容会显示在这里</span>
          </div>
        )}
        {current?.goal?.text && (
          <section className="context-goal">
            <header>
              <span><Target size={13} /><b>任务目标</b></span>
              <small>{current.goal.status === "completed" ? "已完成" : current.goal.status === "paused" ? "已暂停" : "进行中"}</small>
            </header>
            <p>{current.goal.text}</p>
          </section>
        )}
        <Section
          title="输出内容"
          count={context.outputs.length}
          visibleCount={visibleGroups.outputs.length}
        >
          {visibleGroups.outputs.map((item, index) => {
            const Icon = fileIcon(item.path);
            return (
              <button
                className="context-output"
                disabled={!item.path}
                onClick={() =>
                  item.path &&
                  onOpenFile({ path: item.path, name: item.name, type: "file" })
                }
                key={`${item.path}-${index}`}
              >
                <Icon size={16} />
                <span>
                  <b>{item.name}</b>
                </span>
              </button>
            );
          })}
        </Section>
        <Section
          title="最近文件"
          count={context.files.length}
          visibleCount={visibleGroups.files.length}
        >
          {visibleGroups.files.map((item) => {
            const Icon = fileIcon(item.path);
            return (
              <button
                className="context-row"
                onClick={() =>
                  onOpenFile({ path: item.path, name: item.name, type: "file" })
                }
                key={item.path}
              >
                <Icon size={15} />
                <span>
                  <b>{item.name}</b>
                </span>
              </button>
            );
          })}
        </Section>
        <Section
          title="内容来源"
          count={context.sources.length}
          visibleCount={visibleGroups.sources.length}
        >
          {visibleGroups.sources.map((item) => (
            <button
              className="context-source"
              onClick={() =>
                window.open(item.url, "_blank", "noopener,noreferrer")
              }
              key={item.url}
            >
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" />
              ) : (
                <span className="source-thumbnail">
                  <Globe2 size={18} />
                </span>
              )}
              <span>
                <b>{item.title}</b>
                <small>{item.url}</small>
              </span>
              <ExternalLink size={13} />
            </button>
          ))}
        </Section>
        <Section
          title="图片与附件"
          count={context.media.length}
          visibleCount={visibleGroups.media.length}
        >
          <div className="context-media-grid">
            {visibleGroups.media.map((item, index) => {
              const source = item.url || item.dataUrl;
              return (
                <button
                  title={item.name}
                  onClick={() => onOpenMedia(item)}
                  key={item.attachmentId || source || index}
                >
                  {item.type === "image" ? (
                    <img src={source} alt={item.name} />
                  ) : (
                    <span>
                      <Image size={20} />
                    </span>
                  )}
                  <small>{item.name}</small>
                </button>
              );
            })}
          </div>
        </Section>
        <UsedCapabilities entries={entries} live={live} info={info} current={current} appCatalog={appCatalog} />
        {!full && hiddenCount > 0 && onExpand && (
          <button className="context-view-all" onClick={onExpand}>
            <MoreHorizontal size={16} />
            <span>{`更多（${hiddenCount}）`}</span>
          </button>
        )}
        </>}
      </div>
    </aside>
  );
}

function AvailableCapabilitiesPanel({ info, appCatalog, onOpenAsset }) {
  const [assets, setAssets] = useState([]);
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    fetch("/api/assets").then((response) => response.ok ? response.json() : null).then((data) => setAssets(data?.assets || [])).catch(() => {});
  }, [info]);
  const skills = [...(info?.localSkills || []), ...(info?.plugins?.skills || [])]
    .filter((item, index, list) => list.findIndex((other) => other.name === item.name) === index);
  const experts = info?.experts || [];
  const tools = info?.tools || [];
  const mcps = info?.mcp || [];
  const apps = appCatalog?.apps || [];
  const authorizedApps = apps.filter((item) => item.status === "authorized" || item.loginState === "signed-in");
  const unauthorizedApps = apps.filter((item) => !authorizedApps.includes(item));
  const installedSkills = skills.filter((item) => item.source !== "platform");
  const librarySkills = skills.filter((item) => item.source === "platform");
  const groups = [
    { key: "skills", label: "Skill", count: skills.length, items: skills, icon: Wrench, meta: `${installedSkills.length} 已安装 · ${librarySkills.length} 资源库` },
    { key: "experts-installed", label: "专家 · 已安装", count: experts.filter((item) => item.local).length, items: experts.filter((item) => item.local), icon: Sparkles, status: "installed" },
    { key: "experts-library", label: "专家 · 资源库", count: experts.filter((item) => !item.local).length, items: experts.filter((item) => !item.local), icon: Sparkles, status: "library" },
    { key: "tools", label: "MCP / 工具 · 已安装", count: tools.length + mcps.length, items: [...mcps.map((item) => ({ ...item, kind: "MCP" })), ...tools], icon: Package, status: "installed" },
    { key: "apps", label: "应用", count: apps.length, items: apps, icon: Globe2, meta: `${authorizedApps.length} 已授权 · ${unauthorizedApps.length} 未授权` },
    { key: "assets", label: "资源库", count: assets.length, items: assets.map((item) => ({ ...item, name: item.title || item.name || "未命名资源" })), icon: Image, status: "installed", asset: true },
  ].filter((item) => item.count);
  if (!groups.length) return <div className="context-empty"><Wrench size={22} /><b>暂无可用能力</b><span>安装或启用 Skill、专家、MCP 和应用后会显示在这里</span></div>;
  return <div className="available-capabilities">
    <div className="available-capabilities-total"><b>当前可用</b><span>{groups.reduce((sum, item) => sum + item.count, 0)} 项</span></div>
    {groups.map((group) => { const Icon = group.icon; const open = expanded === group.key; return <section className={`available-capability-group ${open ? "is-open" : ""}`} key={group.key}>
      <button className="available-capability-summary" type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : group.key)}><span><Icon size={14} /><b>{group.label}</b></span><span><small>{group.meta || `${group.count} 项`}</small><ChevronRight size={14} /></span></button>
      {open && <div>{group.items.slice(0, 12).map((item, index) => <button className="available-capability-item" type="button" key={`${group.key}:${item.id || item.name}:${index}`} title={item.description || item.name} onClick={() => group.asset ? onOpenAsset?.(item) : undefined}><span>{item.name || item.displayName}</span><small>{group.key === "skills" ? (item.source === "platform" ? "资源库" : "已安装") : group.key === "apps" ? (authorizedApps.includes(item) ? "已授权" : "未授权") : group.status === "library" ? "资源库" : "已安装"}</small></button>)}</div>}
      {open && group.count > 12 && <small className="available-capability-more">还有 {group.count - 12} 项</small>}
    </section>; })}
  </div>;
}


function OperationPreviewStack({ items }) {
  const [active, setActive] = React.useState(0);
  const current = items[Math.min(active, items.length - 1)];
  const source = current?.url || current?.dataUrl;
  return (
    <section className="context-operation-preview" aria-label="操作画面预览">
      <header>
        <span><b>操作画面</b><small>{items.length} 个画面</small></span>
        <i>实时结果</i>
      </header>
      <div className="operation-stage">
        {items.slice(Math.max(0, active - 2), active).map((item, index) => {
          const thumb = item.url || item.dataUrl;
          return thumb ? <img key={`stack-${thumb}-${index}`} className={`operation-stage-layer layer-${index + 1}`} src={thumb} alt="" /> : null;
        })}
        {source ? (current.type === "video" ? <video src={source} controls muted /> : <img src={source} alt={current.name || "操作画面"} />) : <span>暂无画面</span>}
        {items.length > 1 && <span className="operation-stack-badge">+{items.length - 1}</span>}
      </div>
      <div className="operation-thumbs">
        {items.map((item, index) => {
          const thumb = item.url || item.dataUrl;
          return <button key={`${thumb || item.name}-${index}`} className={index === active ? "active" : ""} onClick={() => setActive(index)} title={item.title || item.name}>
            {thumb ? (item.type === "video" ? <video src={thumb} muted /> : <img src={thumb} alt="" />) : <span>{index + 1}</span>}
          </button>;
        })}
      </div>
    </section>
  );
}
