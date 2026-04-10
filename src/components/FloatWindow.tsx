/// <reference path="../custom-modules.d.ts" />
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import Spinner from "react-bootstrap/Spinner";
import { Minus, X } from "lucide-react";
import { fillPresetBackground } from "../constants/backgroundPresets";
import {
  IMAGE_SEGMENTER_INIT_TIMEOUT_MS,
  IMAGE_SEGMENTER_MODEL_URL,
  MEDIAPIPE_TASKS_VISION_WASM
} from "../constants/mediapipeVision";
import { CameraSettings, FilterType, ShapeType } from "../types";

/** Minimal typing for @mediapipe/tasks-vision ImageSegmenter (avoid hard dep on package types in CI). */
interface SelfieSegmenter {
  segmentForVideo(video: HTMLVideoElement | HTMLCanvasElement, timestamp: number): {
    categoryMask?: { width: number; height: number; getAsUint8Array(): Uint8Array };
    confidenceMasks?: Array<{ width: number; height: number; getAsFloat32Array(): Float32Array }>;
  };
  close(): void;
}

const shapeStyles: Record<ShapeType, CSSProperties> = {
  circle: { borderRadius: "50%" },
  square: {},
  rounded: { borderRadius: 16 },
  heart: { clipPath: "path('M50 90 L15 55 A20 20 0 1 1 50 30 A20 20 0 1 1 85 55 Z')" },
  star: { clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" },
  diamond: { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" },
  hexagon: { clipPath: "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)" },
  triangle: { clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }
};

const filterStyles: Record<FilterType, string> = {
  none: "none",
  grayscale: "grayscale(100%)",
  sepia: "sepia(100%)",
  invert: "invert(100%)",
  blur: "blur(4px)",
  brightness: "brightness(150%)",
  contrast: "contrast(200%)"
};

/** Pick the confidence channel that looks like a person (high center, low edges). */
function pickPersonConfidenceMask(masks: Array<{ width: number; height: number; getAsFloat32Array(): Float32Array }>): number {
  if (masks.length <= 1) {
    return 0;
  }
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let mi = 0; mi < masks.length; mi++) {
    const m = masks[mi];
    const f = m.getAsFloat32Array();
    const mw = m.width;
    const mh = m.height;
    const x0 = (mw * 0.3) | 0;
    const x1 = (mw * 0.7) | 0;
    const y0 = (mh * 0.3) | 0;
    const y1 = (mh * 0.7) | 0;
    let centerSum = 0;
    let centerN = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        centerSum += f[y * mw + x];
        centerN++;
      }
    }
    const centerMean = centerN ? centerSum / centerN : 0;
    let edgeSum = 0;
    let edgeN = 0;
    const step = Math.max(1, (mw / 24) | 0);
    for (let x = 0; x < mw; x += step) {
      edgeSum += f[x] + f[(mh - 1) * mw + x];
      edgeN += 2;
    }
    for (let y = 0; y < mh; y += step) {
      edgeSum += f[y * mw] + f[y * mw + (mw - 1)];
      edgeN += 2;
    }
    const edgeMean = edgeN ? edgeSum / edgeN : 0;
    const score = centerMean - edgeMean;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = mi;
    }
  }
  return bestIdx;
}

/** Category mask: MediaPipe selfie model uses 0 = background, 1 = person (and sometimes extra classes). */
function isPersonCategory(value: number): boolean {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function coverDrawImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) {
    return;
  }
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

interface FloatWindowProps {
  settings: CameraSettings;
}

export default function FloatWindow({ settings }: FloatWindowProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const segmenterRef = useRef<SelfieSegmenter | null>(null);
  const settingsRef = useRef(settings);
  const customImgRef = useRef<HTMLImageElement | null>(null);
  const offBgRef = useRef<HTMLCanvasElement | null>(null);
  const offFgRef = useRef<HTMLCanvasElement | null>(null);
  const offMaskRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const personConfMaskIndexRef = useRef<number | null>(null);
  const lastVideoDimRef = useRef({ w: 0, h: 0 });
  const canvasHasFrameRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [segmentError, setSegmentError] = useState("");
  const [customReady, setCustomReady] = useState(false);
  const [canvasOutputReady, setCanvasOutputReady] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  settingsRef.current = settings;

  const needsSegmentation = settings.backgroundMode !== "none";

  useEffect(() => {
    canvasHasFrameRef.current = false;
    setCanvasOutputReady(false);
  }, [needsSegmentation, settings.deviceId]);

  useEffect(() => {
    document.body.classList.add("float-route");
    return () => document.body.classList.remove("float-route");
  }, []);

  useEffect(() => {
    const url = settings.backgroundCustomImage;
    if (!url) {
      customImgRef.current = null;
      setCustomReady(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      customImgRef.current = img;
      setCustomReady(true);
    };
    img.onerror = () => {
      customImgRef.current = null;
      setCustomReady(false);
    };
    img.src = url;
  }, [settings.backgroundCustomImage]);

  useEffect(() => {
    let mounted = true;
    let acquired: MediaStream | null = null;

    const initStream = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera API is not available.");
        setLoading(false);
        return;
      }
      setLoading(true);
      window.electronAPI?.send("camera-loading");
      setMediaStream((prev) => {
        prev?.getTracks().forEach((track) => track.stop());
        return null;
      });
      try {
        const constraints: MediaStreamConstraints = {
          video: settings.deviceId ? { deviceId: { exact: settings.deviceId } } : true,
          audio: false
        };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        acquired = stream;
        setMediaStream(stream);
        setError("");
        setLoading(false);
        window.electronAPI?.send("camera-ready");
      } catch (err) {
        const e = err as DOMException | Error | undefined;
        const name = e?.name ?? "";
        const msg = typeof e?.message === "string" ? e.message : "";
        setError(
          name === "NotAllowedError" || name === "PermissionDeniedError"
            ? "Camera blocked. On macOS use System Settings → Privacy & Security → Camera → enable TableCam, then quit and reopen."
            : `Unable to access camera (${name || "Error"}${msg ? `: ${msg}` : ""}).`
        );
        setLoading(false);
      }
    };

    void initStream();
    return () => {
      mounted = false;
      if (acquired) {
        acquired.getTracks().forEach((track) => track.stop());
      }
      setMediaStream((prev) => {
        prev?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  }, [settings.deviceId]);

  /** Bind after commit so <video> ref exists (avoids missing preview when getUserMedia resolves before mount). */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.srcObject = mediaStream;
    if (mediaStream) {
      void video.play().catch(() => undefined);
    }
    return () => {
      video.srcObject = null;
    };
  }, [mediaStream]);

  useEffect(() => {
    if (!needsSegmentation) {
      segmenterRef.current?.close();
      segmenterRef.current = null;
      setSegmentLoading(false);
      setSegmentError("");
      return;
    }

    let cancelled = false;
    setSegmentLoading(true);
    setSegmentError("");

    (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
          new Promise<T>((resolve, reject) => {
            const id = window.setTimeout(() => reject(new Error(`${label} timeout`)), ms);
            p.then(
              (v) => {
                window.clearTimeout(id);
                resolve(v);
              },
              (e) => {
                window.clearTimeout(id);
                reject(e);
              }
            );
          });

        const fileset = await withTimeout(
          FilesetResolver.forVisionTasks(MEDIAPIPE_TASKS_VISION_WASM),
          IMAGE_SEGMENTER_INIT_TIMEOUT_MS,
          "FilesetResolver"
        );
        let segmenter: SelfieSegmenter;
        try {
          segmenter = (await withTimeout(
            ImageSegmenter.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: IMAGE_SEGMENTER_MODEL_URL,
                delegate: "GPU"
              },
              runningMode: "VIDEO",
              outputConfidenceMasks: true,
              outputCategoryMask: true
            }),
            IMAGE_SEGMENTER_INIT_TIMEOUT_MS,
            "ImageSegmenter(GPU)"
          )) as SelfieSegmenter;
        } catch {
          segmenter = (await withTimeout(
            ImageSegmenter.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: IMAGE_SEGMENTER_MODEL_URL
              },
              runningMode: "VIDEO",
              outputConfidenceMasks: true,
              outputCategoryMask: true
            }),
            IMAGE_SEGMENTER_INIT_TIMEOUT_MS,
            "ImageSegmenter(CPU)"
          )) as SelfieSegmenter;
        }
        if (cancelled) {
          segmenter.close();
          return;
        }
        segmenterRef.current = segmenter;
        setSegmentLoading(false);
      } catch {
        if (!cancelled) {
          setSegmentError("Background model unavailable, fallback to normal camera preview.");
          setSegmentLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      personConfMaskIndexRef.current = null;
      segmenterRef.current?.close();
      segmenterRef.current = null;
    };
  }, [needsSegmentation]);

  useEffect(() => {
    if (!needsSegmentation || segmentError || segmentLoading || canvasOutputReady) {
      return;
    }
    const id = window.setTimeout(() => {
      if (!canvasHasFrameRef.current) {
        setSegmentError(
          "Virtual background did not draw in this window (common on some macOS builds). Showing normal camera — set Background to “None” if you prefer."
        );
      }
    }, 4500);
    return () => window.clearTimeout(id);
  }, [needsSegmentation, segmentError, segmentLoading, canvasOutputReady]);

  useEffect(() => {
    if (!needsSegmentation) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (segmentLoading || segmentError) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (!segmenterRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    if (!offBgRef.current) {
      offBgRef.current = document.createElement("canvas");
    }
    if (!offFgRef.current) {
      offFgRef.current = document.createElement("canvas");
    }
    if (!offMaskRef.current) {
      offMaskRef.current = document.createElement("canvas");
    }

    const tick = () => {
      const s = settingsRef.current;
      if (s.backgroundMode === "none") {
        return;
      }

      const seg = segmenterRef.current;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || !seg) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (w !== lastVideoDimRef.current.w || h !== lastVideoDimRef.current.h) {
        lastVideoDimRef.current = { w, h };
        personConfMaskIndexRef.current = null;
      }

      const offBg = offBgRef.current!;
      const offFg = offFgRef.current!;
      const offMask = offMaskRef.current!;
      offBg.width = offFg.width = offMask.width = w;
      offBg.height = offFg.height = offMask.height = h;
      c.width = w;
      c.height = h;

      let result;
      try {
        result = seg.segmentForVideo(v, performance.now());
      } catch {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const confMasks = result.confidenceMasks;
      const categoryMask = result.categoryMask;

      const mctx = offMask.getContext("2d", { willReadFrequently: true });
      if (!mctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const imgData = mctx.createImageData(w, h);
      const d = imgData.data;

      if (confMasks && confMasks.length > 0) {
        if (personConfMaskIndexRef.current === null) {
          personConfMaskIndexRef.current = pickPersonConfidenceMask(confMasks);
        }
        const idx = personConfMaskIndexRef.current;
        const fg = confMasks[idx] ?? confMasks[confMasks.length - 1];
        const floatArr = fg.getAsFloat32Array();
        const maskW = fg.width;
        const maskH = fg.height;
        for (let y = 0; y < h; y++) {
          const my = Math.min(maskH - 1, ((y / h) * maskH) | 0);
          for (let x = 0; x < w; x++) {
            const mx = Math.min(maskW - 1, ((x / w) * maskW) | 0);
            const p = floatArr[my * maskW + mx];
            const alpha = Math.min(255, Math.max(0, Math.round(p * 255)));
            const i = (y * w + x) * 4;
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
            d[i + 3] = alpha;
          }
        }
      } else if (categoryMask) {
        const maskArr = categoryMask.getAsUint8Array();
        const maskW = categoryMask.width;
        const maskH = categoryMask.height;
        for (let y = 0; y < h; y++) {
          const my = Math.min(maskH - 1, ((y / h) * maskH) | 0);
          for (let x = 0; x < w; x++) {
            const mx = Math.min(maskW - 1, ((x / w) * maskW) | 0);
            const raw = maskArr[my * maskW + mx];
            const person = isPersonCategory(raw);
            const i = (y * w + x) * 4;
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
            d[i + 3] = person ? 255 : 0;
          }
        }
      } else {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      mctx.putImageData(imgData, 0, 0);

      const bctx = offBg.getContext("2d");
      const fctx = offFg.getContext("2d");
      const octx = c.getContext("2d");
      if (!bctx || !fctx || !octx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      bctx.clearRect(0, 0, w, h);
      if (s.backgroundMode === "blur") {
        bctx.filter = "blur(22px)";
        bctx.drawImage(v, 0, 0, w, h);
        bctx.filter = "none";
      } else if (s.backgroundMode === "preset") {
        fillPresetBackground(bctx, w, h, s.backgroundPreset);
      } else if (s.backgroundMode === "custom" && customImgRef.current?.complete) {
        coverDrawImage(bctx, customImgRef.current, w, h);
      } else {
        bctx.filter = "blur(22px)";
        bctx.drawImage(v, 0, 0, w, h);
        bctx.filter = "none";
      }

      fctx.globalCompositeOperation = "source-over";
      fctx.clearRect(0, 0, w, h);
      const personFilter = filterStyles[s.filter];
      fctx.filter = personFilter === "none" ? "none" : personFilter;
      fctx.drawImage(v, 0, 0, w, h);
      fctx.filter = "none";
      fctx.globalCompositeOperation = "destination-in";
      fctx.drawImage(offMask, 0, 0);
      fctx.globalCompositeOperation = "source-over";

      octx.clearRect(0, 0, w, h);
      octx.drawImage(offBg, 0, 0);
      octx.drawImage(offFg, 0, 0);

      if (!canvasHasFrameRef.current) {
        canvasHasFrameRef.current = true;
        setCanvasOutputReady(true);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [needsSegmentation, segmentLoading, segmentError, customReady, settings.backgroundMode]);

  const previewFilters = useMemo(() => filterStyles[settings.filter], [settings.filter]);

  const wrapperStyle = useMemo<CSSProperties>(
    () => ({
      ...shapeStyles[settings.shape],
      border: settings.borderEnabled ? `4px solid ${settings.borderColor}` : "none",
      background: "transparent"
    }),
    [settings.borderColor, settings.borderEnabled, settings.shape]
  );

  const showCanvas = needsSegmentation && !segmentError && !segmentLoading && canvasOutputReady;
  const hideVideo = showCanvas;

  return (
    <div className="float-window-root">
      <div className="float-window-drag-area" aria-hidden />
      <div className="float-window-toolbar">
        <button
          className="float-window-toolbtn"
          type="button"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => window.electronAPI?.send("minimize-float-window")}
        >
          <Minus size={14} strokeWidth={2.5} />
        </button>
        <button
          className="float-window-toolbtn"
          type="button"
          aria-label="Hide overlay"
          title="Hide overlay"
          onClick={() => window.electronAPI?.send("close-float-window")}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
      <div className="camera-preview-wrapper" style={wrapperStyle}>
        <video
          ref={videoRef}
          className={`camera-video ${hideVideo ? "camera-video--hidden" : ""}`}
          muted
          playsInline
          style={{ filter: hideVideo || previewFilters === "none" ? "none" : previewFilters }}
        />
        <canvas
          ref={canvasRef}
          className={`camera-canvas ${showCanvas ? "camera-canvas--visible" : ""}`}
        />
        {loading ? (
          <div className="camera-overlay camera-overlay--dim">
            <Spinner animation="border" variant="light" />
          </div>
        ) : null}
        {needsSegmentation && segmentLoading ? (
          <div className="camera-overlay camera-overlay--dim">
            <Spinner animation="border" variant="light" />
            <span className="camera-overlay-caption">Loading segmentation…</span>
          </div>
        ) : null}
        {segmentError ? <div className="float-seg-hint">{segmentError}</div> : null}
        {error ? <div className="camera-overlay error">{error}</div> : null}
      </div>
    </div>
  );
}
