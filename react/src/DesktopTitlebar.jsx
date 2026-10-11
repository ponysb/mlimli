import React, { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import FollowMe from "./FollowMe.jsx";
import { DesktopUpdateStatus } from "./DesktopUpdates.jsx";

export default function DesktopTitlebar() {
  const desktop = window.desktop;
  const [state, setState] = useState({
    maximized: false,
    platform: desktop?.platform || "",
  });
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
