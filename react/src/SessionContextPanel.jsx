import React, { useMemo } from "react";
import {
  ExternalLink,
  File,
  FileImage,
  FileText,
  Globe2,
  Image,
  MoreHorizontal,
  PanelRight,
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

export default function SessionContextPanel({
  entries,
  live,
  onClose,
  onExpand,
  full = false,
  onOpenFile,
  onOpenMedia,
}) {
  const context = useMemo(
    () => collectSessionContext(entries, live),
    [entries, live],
  );
  const empty =
    !context.outputs.length &&
    !context.files.length &&
    !context.sources.length &&
    !context.media.length;
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
  return (
    <aside
      className={`session-context-panel ${full ? "is-full" : "is-compact"}`}
      aria-label="任务上下文"
    >
      <header className="context-panel-head">
        <b>任务上下文</b>
        <div>
          {!full && onExpand && (
            <button
              title="分屏显示全部上下文"
              aria-label="分屏显示全部上下文"
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
        {empty && (
          <div className="context-empty">
            <File size={22} />
            <b>暂无上下文</b>
            <span>操作文件、网页和生成内容会显示在这里</span>
          </div>
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
        {!full && hiddenCount > 0 && onExpand && (
          <button className="context-view-all" onClick={onExpand}>
            <MoreHorizontal size={16} />
            <span>{hiddenCount ? `更多（${hiddenCount}）` : "更多"}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
