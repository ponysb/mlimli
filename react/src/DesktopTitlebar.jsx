import React, { useEffect, useState } from "react";
import { Copy, LoaderCircle, Minus, PanelLeft, Sparkles, Square, X } from "lucide-react";
import FollowMe from "./FollowMe.jsx";
import { DesktopUpdateStatus } from "./DesktopUpdates.jsx";

export default function DesktopTitlebar() {
  const desktop = window.desktop;
  const [state, setState] = useState({
    maximized: false,
    platform: desktop?.platform || "",
  });
  const [connection, setConnection] = useState({ status: "connecting", attempt: 0 });
  const [capabilityGuideLoading, setCapabilityGuideLoading] = useState(false);
  useEffect(() => {
    if (!desktop?.isElectron) return undefined;
    let active = true;
    desktop
      .getWindowState?.()
      .then((next) => active && setState(next))
      .catch(() => {});
    const unsubscribe = desktop.onWindowStateChanged?.(
      (next) => active && setState(next),
    );
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    const update = (event) => setCapabilityGuideLoading(event.detail?.status === "loading");
    window.addEventListener("mli:capability-guide-status", update);
    return () => window.removeEventListener("mli:capability-guide-status", update);
  }, []);
  useEffect(() => {
    const update = (event) => setConnection(event.detail || { status: "connecting" });
    window.addEventListener("mli:connection-status", update);
    return () => window.removeEventListener("mli:connection-status", update);
  }, []);
  if (!desktop?.isElectron) return null;
  const control = (action) =>
    desktop
      .windowControl(action)
      .then(setState)
      .catch(() => {});
  const mac = state.platform === "darwin";
  return (
    <header className={`desktop-titlebar ${mac ? "is-mac" : "is-windows"}`}>
      <div className="desktop-titlebar-name">
        <img src="/branding/logo.png" alt="" />
        <span>魔力工作台</span>
      </div>
      <div className="desktop-titlebar-actions">
        <button
          className="desktop-sidebar-toggle"
          title="收起或展开导航"
          aria-label="收起或展开导航"
          onClick={() => window.dispatchEvent(new CustomEvent("mli:toggle-sidebar"))}
        >
          <PanelLeft size={15} />
        </button>
        <FollowMe compact label="关注我" />
        <button
          title="设置"
          aria-label="设置"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("mli:open-settings"))
          }
        >
          设置
        </button>
        {capabilityGuideLoading && (
          <span className="desktop-capability-status" role="status" aria-label="正在生成能力说明" title="正在生成能力说明">
            <LoaderCircle className="spin" size={13} />
            <Sparkles size={13} />
          </span>
        )}
        {connection.status !== "connected" && (
          <button
            className="desktop-connection-status"
            title={connection.status === "retrying" ? "连接已断开，点击重连" : "正在连接本地 Agent"}
            aria-label={connection.status === "retrying" ? "连接已断开，点击重连" : "正在连接本地 Agent"}
            onClick={() => window.dispatchEvent(new CustomEvent("mli:reconnect"))}
          >
            <LoaderCircle className="spin" size={13} />
          </button>
        )}
        <DesktopUpdateStatus />
      </div>
      {!mac && (
        <div className="windows-window-controls" aria-label="窗口控制">
          <button
            title="最小化"
            aria-label="最小化"
            onClick={() => control("minimize")}
          >
            <Minus size={16} />
          </button>
          <button
            title={state.maximized ? "还原" : "最大化"}
            aria-label={state.maximized ? "还原" : "最大化"}
            onClick={() => control("toggle-maximize")}
          >
            {state.maximized ? (
              <Copy className="restore-icon" size={14} />
            ) : (
              <Square size={13} />
            )}
          </button>
          <button
            className="window-close"
            title="关闭"
            aria-label="关闭"
            onClick={() => control("close")}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </header>
  );
}
