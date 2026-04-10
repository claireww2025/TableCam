import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type AspectPreset = "free" | "16:9" | "9:16" | "4:3" | "3:4";

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type InteractionMode = "idle" | "draw" | "move" | "resize";

interface InteractionState {
  mode: InteractionMode;
  handle?: ResizeHandle;
  startMouse: PixelPoint;
  startRect: PixelRect;
}

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ASPECT_VALUES: Record<AspectPreset, number> = {
  free: 1,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "4:3": 4 / 3,
  "3:4": 3 / 4
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function fitCenteredRect(aspect: AspectPreset): CropRect {
  if (aspect === "free") {
    return { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
  }
  const ratio = ASPECT_VALUES[aspect];
  let w = 0.6;
  let h = w / ratio;
  if (h > 0.6) {
    h = 0.6;
    w = h * ratio;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

function centeredAspectRect(aspect: AspectPreset, boxWidth: number, boxHeight: number): CropRect {
  if (aspect === "free" || boxWidth <= 0 || boxHeight <= 0) {
    return fitCenteredRect("free");
  }
  const ratio = ASPECT_VALUES[aspect];
  let pixelW = boxWidth * 0.6;
  let pixelH = pixelW / ratio;
  if (pixelH > boxHeight * 0.6) {
    pixelH = boxHeight * 0.6;
    pixelW = pixelH * ratio;
  }
  const x = (boxWidth - pixelW) / 2;
  const y = (boxHeight - pixelH) / 2;
  return rectFromPixels(x, y, pixelW, pixelH, boxWidth, boxHeight);
}

function toPixelRect(rect: CropRect, boxWidth: number, boxHeight: number): PixelRect {
  return {
    x: rect.x * boxWidth,
    y: rect.y * boxHeight,
    w: rect.w * boxWidth,
    h: rect.h * boxHeight
  };
}

function clampRectToBounds(rect: PixelRect, bw: number, bh: number): PixelRect {
  const w = clamp(rect.w, 6, bw);
  const h = clamp(rect.h, 6, bh);
  const x = clamp(rect.x, 0, bw - w);
  const y = clamp(rect.y, 0, bh - h);
  return { x, y, w, h };
}

function pointInRect(p: PixelPoint, r: PixelRect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function applyAspectToRect(rect: PixelRect, ratio: number, anchor: "center" | "topLeft"): PixelRect {
  let w = rect.w;
  let h = rect.h;
  if (w / h > ratio) {
    w = h * ratio;
  } else {
    h = w / ratio;
  }
  if (anchor === "topLeft") {
    return { x: rect.x, y: rect.y, w, h };
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h
  };
}

function resizeFromHandle(start: PixelRect, dx: number, dy: number, handle: ResizeHandle): PixelRect {
  let { x, y, w, h } = start;
  if (handle.includes("e")) {
    w += dx;
  }
  if (handle.includes("s")) {
    h += dy;
  }
  if (handle.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (handle.includes("n")) {
    y += dy;
    h -= dy;
  }
  if (w < 6) {
    if (handle.includes("w")) {
      x -= 6 - w;
    }
    w = 6;
  }
  if (h < 6) {
    if (handle.includes("n")) {
      y -= 6 - h;
    }
    h = 6;
  }
  return { x, y, w, h };
}

function rectFromPixels(
  x: number,
  y: number,
  w: number,
  h: number,
  boxWidth: number,
  boxHeight: number
): CropRect {
  return {
    x: clamp(x / boxWidth, 0, 1),
    y: clamp(y / boxHeight, 0, 1),
    w: clamp(w / boxWidth, 0.03, 1),
    h: clamp(h / boxHeight, 0.03, 1)
  };
}

function scaleRectFromCenter(rect: CropRect, factor: number): CropRect {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let w = rect.w * factor;
  let h = rect.h * factor;
  const maxW = Math.min(cx * 2, (1 - cx) * 2);
  const maxH = Math.min(cy * 2, (1 - cy) * 2);
  w = clamp(w, 0.03, maxW);
  h = clamp(h, 0.03, maxH);
  return {
    x: clamp(cx - w / 2, 0, 1),
    y: clamp(cy - h / 2, 0, 1),
    w,
    h
  };
}

function getAspectLockedRect(
  start: { x: number; y: number },
  current: { x: number; y: number },
  ratio: number
): CropRect {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const dirX = dx >= 0 ? 1 : -1;
  const dirY = dy >= 0 ? 1 : -1;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  const wFromDx = absDx;
  const hFromDx = wFromDx / ratio;
  const hFromDy = absDy;
  const wFromDy = hFromDy * ratio;

  let w = hFromDx <= absDy ? wFromDx : wFromDy;
  let h = w / ratio;

  const maxW = dirX > 0 ? 1 - start.x : start.x;
  const maxH = dirY > 0 ? 1 - start.y : start.y;
  const scale = Math.min(1, maxW / Math.max(w, 1e-6), maxH / Math.max(h, 1e-6));
  w *= scale;
  h *= scale;

  const x = dirX > 0 ? start.x : start.x - w;
  const y = dirY > 0 ? start.y : start.y - h;

  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    w: clamp(w, 0.03, 1),
    h: clamp(h, 0.03, 1)
  };
}

export default function DesktopRegionSelector() {
  const query = new URLSearchParams(window.location.search);
  const defaultAspect = (query.get("aspect") as AspectPreset) || "16:9";
  const [aspect, setAspect] = useState<AspectPreset>(defaultAspect);
  const [rect, setRect] = useState<CropRect>(fitCenteredRect(defaultAspect));
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [passiveMode, setPassiveMode] = useState(false);
  const [mousePoint, setMousePoint] = useState<PixelPoint>({ x: 20, y: 20 });
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = rootRef.current?.getBoundingClientRect();
    const width = box?.width ?? window.innerWidth;
    const height = box?.height ?? window.innerHeight;
    setRect(centeredAspectRect(aspect, width, height));
  }, [aspect]);

  useEffect(() => {
    document.body.classList.add("selector-route");
    return () => document.body.classList.remove("selector-route");
  }, []);

  const hint = useMemo(() => `Drag to select region (${aspect}). Enter = confirm, Esc = cancel`, [aspect]);
  const pixelSizeLabel = useMemo(() => {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const w = Math.max(1, Math.round(rect.w * screenW));
    const h = Math.max(1, Math.round(rect.h * screenH));
    return `${w} x ${h}px`;
  }, [rect.h, rect.w]);

  const exportSizeLabel = useMemo(() => {
    const map: Record<AspectPreset, string> = {
      free: "Dynamic (selected region)",
      "16:9": "1280 x 720",
      "9:16": "1080 x 1920",
      "4:3": "1024 x 768",
      "3:4": "768 x 1024"
    };
    return map[aspect];
  }, [aspect]);

  const toPixelPoint = (event: PointerEvent<HTMLDivElement>): PixelPoint | null => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) {
      return null;
    }
    return {
      x: clamp(event.clientX - box.left, 0, box.width),
      y: clamp(event.clientY - box.top, 0, box.height)
    };
  };

  const sendConfirm = () => {
    if (confirmed) {
      return;
    }
    setConfirmed(true);
    setPassiveMode(true);
    window.electronAPI?.send("region-selected", { ...rect, aspect });
  };

  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    if (confirmed) {
      return;
    }
    const p = toPixelPoint(event);
    const box = rootRef.current?.getBoundingClientRect();
    if (!p || !box) {
      return;
    }
    setMousePoint(p);
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as ResizeHandle | undefined;
    const pixelRect = toPixelRect(rect, box.width, box.height);
    if (handle) {
      setInteraction({
        mode: "resize",
        handle,
        startMouse: p,
        startRect: pixelRect
      });
      return;
    }
    if (pointInRect(p, pixelRect)) {
      setInteraction({
        mode: "move",
        startMouse: p,
        startRect: pixelRect
      });
      return;
    }
    setInteraction({
      mode: "draw",
      startMouse: p,
      startRect: { x: p.x, y: p.y, w: 1, h: 1 }
    });
  };

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = toPixelPoint(event);
    if (!p) {
      return;
    }
    setMousePoint(p);
    if (!interaction || confirmed) {
      return;
    }
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) {
      return;
    }
    const dx = p.x - interaction.startMouse.x;
    const dy = p.y - interaction.startMouse.y;
    let next: PixelRect = interaction.startRect;

    if (interaction.mode === "move") {
      next = {
        ...interaction.startRect,
        x: interaction.startRect.x + dx,
        y: interaction.startRect.y + dy
      };
      next = clampRectToBounds(next, box.width, box.height);
    } else if (interaction.mode === "draw") {
      const x = Math.min(interaction.startMouse.x, p.x);
      const y = Math.min(interaction.startMouse.y, p.y);
      const w = Math.max(6, Math.abs(p.x - interaction.startMouse.x));
      const h = Math.max(6, Math.abs(p.y - interaction.startMouse.y));
      next = clampRectToBounds({ x, y, w, h }, box.width, box.height);
      if (aspect !== "free") {
        next = applyAspectToRect(next, ASPECT_VALUES[aspect], "topLeft");
        next = clampRectToBounds(next, box.width, box.height);
      }
    } else if (interaction.mode === "resize" && interaction.handle) {
      next = resizeFromHandle(interaction.startRect, dx, dy, interaction.handle);
      if (aspect !== "free") {
        next = applyAspectToRect(next, ASPECT_VALUES[aspect], "center");
      }
      next = clampRectToBounds(next, box.width, box.height);
    }
    setRect(rectFromPixels(next.x, next.y, next.w, next.h, box.width, box.height));
  };

  const onUp = () => {
    setInteraction(null);
  };

  useEffect(() => {
    const offPassive = window.electronAPI?.on("selector-passive-mode", () => {
      setConfirmed(true);
      setPassiveMode(true);
      setInteraction(null);
    });
    const offActive = window.electronAPI?.on("selector-active-mode", () => {
      setPassiveMode(false);
      setConfirmed(false);
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.electronAPI?.send("cancel-region-selector");
        return;
      }
      if (passiveMode) {
        return;
      }
      if (event.key === "Enter") {
        sendConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      offPassive?.();
      offActive?.();
      window.removeEventListener("keydown", onKey);
    };
  }, [passiveMode, aspect, rect]);

  return (
    <div
      ref={rootRef}
      className="desktop-selector-root"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onDoubleClick={() => {
        if (!passiveMode) {
          sendConfirm();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!passiveMode) {
          window.electronAPI?.send("cancel-region-selector");
        }
      }}
    >
      {!passiveMode ? <div className="desktop-selector-topbar">
        <select value={aspect} onChange={(e) => setAspect(e.target.value as AspectPreset)}>
          <option value="free">Free</option>
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="4:3">4:3</option>
          <option value="3:4">3:4</option>
        </select>
        <button type="button" onClick={() => setRect((r) => scaleRectFromCenter(r, 0.9))}>
          Smaller
        </button>
        <button type="button" onClick={() => setRect((r) => scaleRectFromCenter(r, 1.1))}>
          Larger
        </button>
        <span>Selection: {pixelSizeLabel}</span>
        <span>Export: {exportSizeLabel}</span>
        <span>{hint}</span>
        <button type="button" onClick={() => window.electronAPI?.send("cancel-region-selector")}>
          Cancel
        </button>
        <button type="button" onClick={sendConfirm}>
          Confirm
        </button>
      </div> : null}
      <div
        className={`desktop-selector-rect ${confirmed ? "confirmed" : ""}`}
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`
        }}
      >
        {!passiveMode
          ? (["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((h) => (
              <button key={h} className={`selector-handle handle-${h}`} data-handle={h} type="button" tabIndex={-1} />
            ))
          : null}
      </div>
      {!passiveMode ? (
        <div
          className="desktop-selector-badge"
          style={{
            left: clamp(mousePoint.x + 14, 8, window.innerWidth - 180),
            top: clamp(mousePoint.y + 14, 8, window.innerHeight - 40)
          }}
        >
          {pixelSizeLabel}
        </div>
      ) : null}
      {passiveMode ? (
        <div className="desktop-selector-passive-banner">
          Region confirmed. Press Esc or use &quot;Cancel desktop overlay&quot; in TableCam → Record to exit without recording.
        </div>
      ) : null}
    </div>
  );
}
