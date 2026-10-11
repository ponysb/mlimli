import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export default function TaskSplitLayout({ preview, panel, splitPanel, children }) {
  const layout = useRef(null),
    dragging = useRef(null);
  const [width, setWidth] = useState(() => {
    try {
      return Math.min(
        0.78,
        Math.max(
          0.25,
          Number(localStorage.getItem("mli-preview-width")) || 0.61,
        ),
      );
    } catch {
      return 0.61;
    }
  });
  const [size, setSize] = useState(0);
  const [resizing, setResizing] = useState(false);
  const secondary = preview || splitPanel;
  useEffect(() => {
    if (!secondary) {
      dragging.current = null;
      setResizing(false);
    }
  }, [Boolean(secondary)]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setSize(entries[0].contentRect.width),
    );
    observer.observe(layout.current);
    return () => observer.disconnect();
  }, []);
  const available = Math.max(0, size - 6),
    minimum = Math.min(320, available * 0.4);
  const maximum = Math.max(
    minimum,
    available - Math.min(340, available * 0.45),
  );
  const pixels = Math.min(maximum, Math.max(minimum, available * width));
  function update(pixel) {
    if (!available) return;
    const next = Math.min(maximum, Math.max(minimum, pixel)) / available;
    setWidth(next);
    try {
      localStorage.setItem("mli-preview-width", String(next));
    } catch {}
  }
  function pointerMove(event) {
    if (dragging.current !== event.pointerId) return;
    update(event.clientX - layout.current.getBoundingClientRect().left);
  }
  function finishDrag() {
    dragging.current = null;
    setResizing(false);
  }
  return (
    <div
      ref={layout}
      className={`task-layout ${secondary ? "has-preview" : ""} ${splitPanel ? "has-context-split" : ""} ${panel ? "has-context-panel" : ""} ${resizing ? "is-resizing" : ""}`}
      style={secondary && size ? { "--preview-width": `${pixels}px` } : undefined}
    >
      {preview && (
        <>
          <section className="task-preview">{preview}</section>
          <div
            className="task-resize-handle"
            role="separator"
            aria-label="调整分屏与会话宽度"
            aria-orientation="vertical"
            aria-valuemin={Math.round(minimum)}
            aria-valuemax={Math.round(maximum)}
            aria-valuenow={Math.round(pixels)}
            tabIndex={0}
            title="拖动调整分屏与会话宽度"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              dragging.current = event.pointerId;
              setResizing(true);
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={pointerMove}
            onPointerUp={(event) => {
              if (dragging.current === event.pointerId) {
                finishDrag();
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onLostPointerCapture={finishDrag}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                update(
                  event.key === "Home"
                    ? minimum
                    : event.key === "End"
                      ? maximum
                      : pixels + (event.key === "ArrowLeft" ? -24 : 24),
                );
              }
            }}
            onDoubleClick={() => update(available * 0.61)}
          />
        </>
      )}
      <div className="task-conversation-area">
        {children}
        {panel}
      </div>
      {splitPanel && (
        <>
          <div
            className="task-resize-handle"
            role="separator"
            aria-label="调整分屏与会话宽度"
            aria-orientation="vertical"
            aria-valuemin={Math.round(minimum)}
            aria-valuemax={Math.round(maximum)}
            aria-valuenow={Math.round(pixels)}
            tabIndex={0}
            title="拖动调整分屏与会话宽度"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              dragging.current = event.pointerId;
              setResizing(true);
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={pointerMove}
            onPointerUp={(event) => {
              if (dragging.current === event.pointerId) {
                finishDrag();
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onLostPointerCapture={finishDrag}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                update(
                  event.key === "Home"
                    ? minimum
                    : event.key === "End"
                      ? maximum
                      : pixels + (event.key === "ArrowLeft" ? -24 : 24),
                );
              }
            }}
            onDoubleClick={() => update(available * 0.61)}
          />
          <section className="task-preview context-split">{splitPanel}</section>
        </>
      )}
    </div>
  );
}
