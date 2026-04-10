import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useCameraSettings } from "./CameraContext";

export type RecordMode = "screen" | "camera";
export type AspectPreset = "free" | "16:9" | "9:16" | "4:3" | "3:4";
export type RecordingFormat = "auto" | "mov" | "mp4" | "webm-vp9" | "webm-vp8" | "webm";

type RegionOverlayPhase = "idle" | "selecting" | "passive";

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RegionSelectedPayload extends CropRect {
  aspect?: AspectPreset;
}

interface LockedScreenRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface PreflightItem {
  label: string;
  ok: boolean;
  detail: string;
}

interface ScreenPreflightResult {
  ok: boolean;
  detail: string;
}

const RESOLUTIONS: Record<AspectPreset, { w: number; h: number }> = {
  free: { w: 0, h: 0 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 1080, h: 1920 },
  "4:3": { w: 1024, h: 768 },
  "3:4": { w: 768, h: 1024 }
};

const ASPECT_VALUES: Record<AspectPreset, number> = {
  free: 1,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "4:3": 4 / 3,
  "3:4": 3 / 4
};

function fitCenteredRect(aspect: AspectPreset): CropRect {
  if (aspect === "free") {
    return {
      x: 0.2,
      y: 0.2,
      w: 0.6,
      h: 0.6
    };
  }
  const ratio = ASPECT_VALUES[aspect];
  let w = 0.8;
  let h = w / ratio;
  if (h > 0.8) {
    h = 0.8;
    w = h * ratio;
  }
  return {
    x: (1 - w) / 2,
    y: (1 - h) / 2,
    w,
    h
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toUserError(err: unknown, mode: RecordMode): string {
  const e = err as DOMException | Error | undefined;
  const name = e?.name ?? "";
  const msg = typeof e?.message === "string" ? e.message : "";
  const detail = name || msg ? ` (detail: ${[name, msg].filter(Boolean).join(": ")})` : "";
  if (name === "Error") {
    if (msg.includes("DisplayCaptureNotLive")) {
      return `Desktop source is not active. Click "Select Desktop Source" and choose a screen/window again.${detail}`;
    }
    if (msg.includes("NoDesktopSources")) {
      return `No desktop sources available from Electron desktopCapturer.${detail}`;
    }
    if (msg.includes("DesktopSourcePickCancelled")) {
      return `Desktop source selection was cancelled.${detail}`;
    }
  }
  if (name === "NotSupportedError") {
    return mode === "screen"
      ? `Screen capture constraints are not supported by this runtime. The app now retries with compatibility mode automatically. If it still fails, update Electron runtime and retry.${detail}`
      : `Requested media constraints are not supported by this runtime.${detail}`;
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return mode === "screen"
      ? `Screen recording permission denied. Enable Screen Recording for the app that launches Electron in System Settings > Privacy & Security > Screen Recording, then restart.${detail}`
      : `Camera permission denied. Enable Camera access in System Settings > Privacy & Security > Camera, then restart.${detail}`;
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return mode === "screen"
      ? `No display source found. Try choosing an active screen/window again.${detail}`
      : `Selected camera not found. Re-select a camera in the Camera panel.${detail}`;
  }
  if (name === "NotReadableError") {
    return `Device is busy or blocked by another app. Close other camera/screen capture apps and retry.${detail}`;
  }
  if (name === "AbortError") {
    return `Capture selection was cancelled.${detail}`;
  }
  return mode === "screen"
    ? `Failed to start screen recording. Check permissions and desktop source.${detail}`
    : `Failed to start camera recording. Check camera permissions and selected camera.${detail}`;
}

function lockCropToAspectInSource(
  rect: CropRect,
  sourceW: number,
  sourceH: number,
  aspect: AspectPreset
): LockedScreenRect {
  let sx = Math.round(rect.x * sourceW);
  let sy = Math.round(rect.y * sourceH);
  let sw = Math.max(2, Math.round(rect.w * sourceW));
  let sh = Math.max(2, Math.round(rect.h * sourceH));

  if (aspect !== "free") {
    const ratio = ASPECT_VALUES[aspect];
    // Keep center, enforce exact ratio in source pixel space.
    const cx = sx + sw / 2;
    const cy = sy + sh / 2;
    const fittedByWidthH = sw / ratio;
    const fittedByHeightW = sh * ratio;
    if (fittedByWidthH <= sh) {
      sh = Math.max(2, Math.round(fittedByWidthH));
    } else {
      sw = Math.max(2, Math.round(fittedByHeightW));
    }
    sx = Math.round(cx - sw / 2);
    sy = Math.round(cy - sh / 2);
  }

  sx = clamp(sx, 0, Math.max(0, sourceW - 2));
  sy = clamp(sy, 0, Math.max(0, sourceH - 2));
  sw = clamp(sw, 2, sourceW - sx);
  sh = clamp(sh, 2, sourceH - sy);

  return { sx, sy, sw, sh };
}

function pickRecordingMimeByPreference(format: RecordingFormat): { mimeType: string; ext: "mp4" | "webm" } {
  const support = (m: string) => MediaRecorder.isTypeSupported(m);
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=h264,aac", "video/mp4"];
  const webmVp9 = ["video/webm;codecs=vp9"];
  const webmVp8 = ["video/webm;codecs=vp8"];
  const webm = ["video/webm"];

  const pick = (list: string[]) => list.find((m) => support(m));

  if (format === "mov" || format === "mp4") {
    return { mimeType: pick(mp4) || "video/webm", ext: pick(mp4) ? "mp4" : "webm" };
  }
  if (format === "webm-vp9") {
    return { mimeType: pick(webmVp9) || "video/webm", ext: "webm" };
  }
  if (format === "webm-vp8") {
    return { mimeType: pick(webmVp8) || "video/webm", ext: "webm" };
  }
  if (format === "webm") {
    return { mimeType: pick(webm) || "video/webm", ext: "webm" };
  }

  const auto = pick(mp4) || pick(webmVp9) || pick(webmVp8) || pick(webm) || "video/webm";
  return { mimeType: auto, ext: auto.includes("mp4") ? "mp4" : "webm" };
}

async function preflightScreenCaptureCompatibility(): Promise<ScreenPreflightResult> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false
    });
    stream.getTracks().forEach((t) => t.stop());
    return {
      ok: true,
      detail: "Screen/window selection works with standard constraints."
    };
  } catch (err) {
    const e = err as DOMException | Error | undefined;
    if (e?.name !== "NotSupportedError" && e?.name !== "TypeError") {
      return { ok: false, detail: toUserError(err, "screen") };
    }
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    stream.getTracks().forEach((t) => t.stop());
    return {
      ok: true,
      detail: "Compatibility mode active: runtime rejects advanced constraints, but screen capture works."
    };
  } catch (err2) {
    const e2 = err2 as DOMException | Error | undefined;
    if (e2?.name !== "NotSupportedError" && e2?.name !== "TypeError") {
      return { ok: false, detail: toUserError(err2, "screen") };
    }
  }

  try {
    const sources = (await window.electronAPI?.invoke("get-desktop-sources")) || [];
    if (sources.length === 0) {
      return { ok: false, detail: "No desktop sources available from Electron desktopCapturer." };
    }
    return {
      ok: true,
      detail: "Compatibility mode active: Electron desktop source fallback is available."
    };
  } catch {
    return {
      ok: false,
      detail: "Screen capture fallback is unavailable."
    };
  }
}

export interface RecordingContextValue {
  mode: RecordMode;
  setMode: (m: RecordMode) => void;
  aspect: AspectPreset;
  setAspect: (a: AspectPreset) => void;
  format: RecordingFormat;
  setFormat: (f: RecordingFormat) => void;
  micEnabled: boolean;
  setMicEnabled: (v: boolean) => void;
  pipEnabled: boolean;
  setPipEnabled: (v: boolean) => void;
  sessionActive: boolean;
  capturePaused: boolean;
  elapsedLabel: string;
  status: string;
  error: string;
  checking: boolean;
  preflightItems: PreflightItem[];
  preflightGuide: string[];
  regionOverlay: "idle" | "selecting" | "passive";
  outputResolution: { w: number; h: number };
  runPreflight: () => void;
  handleChooseDesktop: () => void;
  toggleRecordPause: () => void;
  stopRecord: () => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording(): RecordingContextValue {
  const ctx = useContext(RecordingContext);
  if (!ctx) {
    throw new Error("useRecording must be used within RecordingProvider");
  }
  return ctx;
}

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useCameraSettings();
  const cameraDeviceId = settings.deviceId;
  const [mode, setMode] = useState<RecordMode>("screen");
  const [aspect, setAspect] = useState<AspectPreset>("16:9");
  const [format, setFormat] = useState<RecordingFormat>("mov");
  const [cropRect, setCropRect] = useState<CropRect>(fitCenteredRect("16:9"));
  const [micEnabled, setMicEnabled] = useState(false);
  const [pipEnabled, setPipEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [capturePaused, setCapturePaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [preflightItems, setPreflightItems] = useState<PreflightItem[]>([]);
  const [preflightGuide, setPreflightGuide] = useState<string[]>([]);
  const [regionOverlay, setRegionOverlay] = useState<RegionOverlayPhase>("idle");

  const displayStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const drawRafRef = useRef<number | null>(null);
  const lastDrawTsRef = useRef<number>(0);
  const lockedScreenRectRef = useRef<LockedScreenRect | null>(null);
  const resumeDrawLoopRef = useRef<(() => void) | null>(null);

  const outputResolution = useMemo(() => RESOLUTIONS[aspect], [aspect]);
  const elapsedLabel = useMemo(() => {
    const hh = Math.floor(elapsedSeconds / 3600);
    const mm = Math.floor((elapsedSeconds % 3600) / 60);
    const ss = elapsedSeconds % 60;
    if (hh > 0) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }, [elapsedSeconds]);

  const stopAllTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => t.stop());
  };

  const stopDisplayPreview = () => {
    stopAllTracks(displayStreamRef.current);
    displayStreamRef.current = null;
  };

  const getCameraStream = async (profile: "default" | "pip" = "default") => {
    const pipConstraints: MediaTrackConstraints = {
      width: { ideal: 640, max: 960 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    };
    const defaultConstraints: MediaTrackConstraints = {
      frameRate: { ideal: 30, max: 30 }
    };
    const mergedVideo = (base: MediaTrackConstraints): MediaTrackConstraints =>
      cameraDeviceId ? { ...base, deviceId: { exact: cameraDeviceId } } : base;

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: mergedVideo(profile === "pip" ? pipConstraints : defaultConstraints),
        audio: false
      });
    } catch {
      return navigator.mediaDevices.getUserMedia({
        video: profile === "pip" ? pipConstraints : true,
        audio: false
      });
    }
  };

  const runPreflight = async () => {
    if (checking || recording) {
      return;
    }
    setChecking(true);
    setError("");
    setPreflightItems([]);
    setPreflightGuide([]);
    const items: PreflightItem[] = [];
    const guide: string[] = [];

    const cameraDeviceKnown = Boolean(cameraDeviceId);
    items.push({
      label: "Camera source selected",
      ok: cameraDeviceKnown,
      detail: cameraDeviceKnown ? "Camera source is configured." : "No specific camera selected yet (will fallback to default)."
    });
    if (!cameraDeviceKnown) {
      guide.push("Open Camera panel and select a preferred camera device.");
    }

    const screenCheck = await preflightScreenCaptureCompatibility();
    items.push({
      label: "Screen capture permission",
      ok: screenCheck.ok,
      detail: screenCheck.detail
    });
    if (!screenCheck.ok) {
      guide.push("macOS: System Settings > Privacy & Security > Screen Recording, enable your terminal/IDE, then restart app.");
      guide.push("Windows: allow screen sharing in prompt; ensure no policy blocks capture.");
    }

    try {
      const cam = await getCameraStream();
      items.push({
        label: "Camera access",
        ok: true,
        detail: `Camera stream available (${cam.getVideoTracks().length} video track).`
      });
      cam.getTracks().forEach((t) => t.stop());
    } catch (err) {
      items.push({
        label: "Camera access",
        ok: false,
        detail: toUserError(err, "camera")
      });
      guide.push("macOS: System Settings > Privacy & Security > Camera, enable your terminal/IDE, then restart app.");
      guide.push("Close Zoom/Meet/OBS if camera is occupied.");
    }

    if (mode === "screen" && micEnabled) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        items.push({
          label: "Microphone access",
          ok: true,
          detail: `Microphone stream available (${mic.getAudioTracks().length} audio track).`
        });
        mic.getTracks().forEach((t) => t.stop());
      } catch {
        items.push({
          label: "Microphone access",
          ok: false,
          detail: "Microphone not available or permission denied (recording can continue without mic)."
        });
        guide.push("macOS: System Settings > Privacy & Security > Microphone, enable your terminal/IDE.");
      }
    }

    try {
      const typesToTest = ["video/webm;codecs=vp9", "video/webm"];
      const supported = typesToTest.find((t) => MediaRecorder.isTypeSupported(t));
      items.push({
        label: "MediaRecorder support",
        ok: Boolean(supported),
        detail: supported ? `Supported encoder: ${supported}` : "No compatible WebM encoder detected."
      });
      if (!supported) {
        guide.push("Update Chromium/Electron runtime if MediaRecorder is unavailable.");
      }
    } catch {
      items.push({
        label: "MediaRecorder support",
        ok: false,
        detail: "Unable to verify recording encoder support."
      });
    }

    if (format === "mov" || format === "mp4") {
      try {
        const ff = await window.electronAPI?.invoke("check-ffmpeg");
        items.push({
          label: "FFmpeg conversion backend",
          ok: Boolean(ff?.ok),
          detail: ff?.ok
            ? `Available (${ff.path})`
            : "Unavailable. This build cannot guarantee MOV/MP4 export on this device."
        });
        if (!ff?.ok) {
          guide.push("Use the official packaged app build that includes the bundled conversion engine.");
        }
      } catch {
        items.push({
          label: "FFmpeg conversion backend",
          ok: false,
          detail: "Unable to verify ffmpeg availability."
        });
      }
    }

    setPreflightItems(items);
    setPreflightGuide(guide);
    setStatus(items.every((it) => it.ok) ? "Preflight passed" : "Preflight found issues");
    setChecking(false);
  };

  const ensureDisplayStream = async (): Promise<MediaStream> => {
    if (displayStreamRef.current) {
      const videoTrack = displayStreamRef.current.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === "live") {
        return displayStreamRef.current;
      }
      // Stale stream (ended/invalid), drop it and reacquire.
      stopAllTracks(displayStreamRef.current);
      displayStreamRef.current = null;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30
        },
        audio: false
      });
    } catch (err) {
      const e = err as DOMException | Error | undefined;
      // Compatibility fallback for runtimes that reject structured video constraints.
      if (e?.name === "NotSupportedError" || e?.name === "TypeError") {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        } catch (err2) {
          const e2 = err2 as DOMException | Error | undefined;
          // Final Electron-specific fallback via desktopCapturer source IDs.
          if (e2?.name === "NotSupportedError" || e2?.name === "TypeError") {
            const sources = (await window.electronAPI?.invoke("get-desktop-sources")) || [];
            if (sources.length === 0) {
              throw new Error("NoDesktopSources");
            }
            // `window.prompt` is not available in this runtime; auto-pick the best source.
            const preferred =
              sources.find((s) => s.id.startsWith("screen:")) ||
              sources.find((s) => /entire|screen|display/i.test(s.name)) ||
              sources[0];
            const sourceId = preferred.id;
            stream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: {
                // Electron desktopCapturer compatibility constraints.
                mandatory: {
                  chromeMediaSource: "desktop",
                  chromeMediaSourceId: sourceId,
                  minWidth: 640,
                  minHeight: 360,
                  maxWidth: 7680,
                  maxHeight: 4320,
                  maxFrameRate: 30
                }
              } as unknown as MediaTrackConstraints
            });
          } else {
            throw err2;
          }
        }
      } else {
        throw err;
      }
    }
    displayStreamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.onended = () => {
        stopDisplayPreview();
        if (!recording) {
          setStatus("Desktop source ended");
        }
      };
    }
    return stream;
  };

  const handleChooseDesktop = async () => {
    try {
      setError("");
      await ensureDisplayStream();
      setStatus("Desktop source ready");
    } catch {
      setError("Unable to capture desktop. Please grant screen recording permission.");
    }
  };

  const beginRecord = async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      return;
    }
    resumeDrawLoopRef.current = null;
    setError("");
    try {
      let outputStream: MediaStream;
      if (mode === "camera") {
        const camStream = await getCameraStream();
        cameraStreamRef.current = camStream;
        outputStream = camStream;
      } else {
        const displayStream = await ensureDisplayStream();
        const liveVideoTrack = displayStream.getVideoTracks()[0];
        if (!liveVideoTrack || liveVideoTrack.readyState !== "live") {
          throw new Error("DisplayCaptureNotLive");
        }
        const sourceVideo = document.createElement("video");
        sourceVideo.srcObject = displayStream;
        sourceVideo.muted = true;
        sourceVideo.playsInline = true;
        await sourceVideo.play();

        const canvas = document.createElement("canvas");
        if (aspect === "free") {
          const vw = Math.max(2, Math.round(sourceVideo.videoWidth * cropRect.w));
          const vh = Math.max(2, Math.round(sourceVideo.videoHeight * cropRect.h));
          canvas.width = vw;
          canvas.height = vh;
        } else {
          canvas.width = outputResolution.w;
          canvas.height = outputResolution.h;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Canvas context unavailable");
        }
        let pipVideo: HTMLVideoElement | null = null;
        if (pipEnabled) {
          const pipStream = await getCameraStream("pip");
          cameraStreamRef.current = pipStream;
          pipVideo = document.createElement("video");
          pipVideo.srcObject = pipStream;
          pipVideo.muted = true;
          pipVideo.playsInline = true;
          await pipVideo.play();
        }

        const targetFps = 30;
        const frameIntervalMs = 1000 / targetFps;

        const drawFrame = (ts: number) => {
          if (ts - lastDrawTsRef.current < frameIntervalMs) {
            drawRafRef.current = window.requestAnimationFrame(drawFrame);
            return;
          }
          lastDrawTsRef.current = ts;

          const vw = sourceVideo.videoWidth;
          const vh = sourceVideo.videoHeight;
          if (vw > 0 && vh > 0) {
            if (!lockedScreenRectRef.current) {
              lockedScreenRectRef.current = lockCropToAspectInSource(cropRect, vw, vh, aspect);
            }
            const { sx, sy, sw, sh } = lockedScreenRectRef.current;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(sourceVideo, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            if (pipVideo && pipVideo.videoWidth > 0 && pipVideo.videoHeight > 0) {
              const pad = Math.round(canvas.width * 0.02);
              const pipW = Math.round(canvas.width * 0.24);
              const pipH = Math.round((pipW * 3) / 4);
              const px = canvas.width - pipW - pad;
              const py = canvas.height - pipH - pad;
              ctx.fillStyle = "rgba(0,0,0,0.4)";
              ctx.fillRect(px - 2, py - 2, pipW + 4, pipH + 4);
              ctx.drawImage(pipVideo, px, py, pipW, pipH);
            }
          }
          drawRafRef.current = window.requestAnimationFrame(drawFrame);
        };

        lastDrawTsRef.current = 0;
        drawRafRef.current = window.requestAnimationFrame(drawFrame);
        resumeDrawLoopRef.current = () => {
          lastDrawTsRef.current = 0;
          drawRafRef.current = window.requestAnimationFrame(drawFrame);
        };
        outputStream = canvas.captureStream(30);
        if (micEnabled) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            micStreamRef.current = micStream;
            micStream.getAudioTracks().forEach((track) => outputStream.addTrack(track));
          } catch {
            setStatus("Recording without microphone (mic permission denied).");
          }
        }
      }

      const picked = pickRecordingMimeByPreference(format);
      const mimeType = picked.mimeType;
      const useMp4 = picked.ext === "mp4";

      const recorder = new MediaRecorder(outputStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        if (drawRafRef.current) {
          window.cancelAnimationFrame(drawRafRef.current);
          drawRafRef.current = null;
        }
        stopAllTracks(cameraStreamRef.current);
        cameraStreamRef.current = null;
        stopAllTracks(micStreamRef.current);
        micStreamRef.current = null;
        lockedScreenRectRef.current = null;

        const blobType = useMp4 ? "video/mp4" : "video/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        const arrayBuffer = await blob.arrayBuffer();
        const result = await window.electronAPI?.invoke("save-recording", {
          bytes: Array.from(new Uint8Array(arrayBuffer)),
          mode,
          requestedFormat: format,
          sourceExt: useMp4 ? "mp4" : "webm"
        });
        if (result?.ok) {
          setStatus(`Saved ${result.savedPath}`);
        } else if (result?.canceled) {
          setStatus("Save cancelled");
        } else {
          const requested = format.toUpperCase();
          setError(
            `Requested ${requested} export failed.${result?.savedPath ? ` Source file: ${result.savedPath}.` : ""} ${
              result?.error || ""
            }`
          );
          setStatus(result?.savedPath ? `Saved fallback ${result.savedPath}` : "Save failed");
        }
        window.electronAPI?.send("recording-finished");
        setCapturePaused(false);
        setRecording(false);
      };

      recorder.start(250);
      window.electronAPI?.send("recording-started");
      setElapsedSeconds(0);
      setCapturePaused(false);
      setRecording(true);
      setStatus("Recording...");
    } catch (err) {
      const e = err as Error | DOMException | undefined;
      if (e?.message === "DisplayCaptureNotLive") {
        setError("Desktop source is not active. Click 'Select Desktop Source' and choose a screen/window again.");
      } else {
        setError(toUserError(err, mode));
      }
    }
  };

  const stopRecord = () => {
    setCapturePaused(false);
    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      window.electronAPI?.send("recording-finished");
      setRecording(false);
      return;
    }
    recorderRef.current.stop();
    setRecording(false);
  };

  const toggleRecordPause = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      void beginRecord();
      return;
    }
    if (rec.state === "recording") {
      try {
        rec.pause();
      } catch {
        /* ignore */
      }
      if (drawRafRef.current) {
        window.cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      setCapturePaused(true);
      setStatus("Paused");
      return;
    }
    if (rec.state === "paused") {
      try {
        rec.resume();
      } catch {
        /* ignore */
      }
      setCapturePaused(false);
      resumeDrawLoopRef.current?.();
      setStatus("Recording...");
    }
  };

  useEffect(() => {
    if (!recording || capturePaused) {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording, capturePaused]);

  useEffect(() => {
    setCropRect(fitCenteredRect(aspect));
  }, [aspect]);

  useEffect(() => {
    return () => {
      if (drawRafRef.current) {
        window.cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      stopAllTracks(cameraStreamRef.current);
      stopAllTracks(micStreamRef.current);
      lockedScreenRectRef.current = null;
      stopDisplayPreview();
    };
  }, []);

  useEffect(() => {
    const off = window.electronAPI?.on("region-selected", (payload) => {
      const region = payload as RegionSelectedPayload;
      if (
        region &&
        typeof region.x === "number" &&
        typeof region.y === "number" &&
        typeof region.w === "number" &&
        typeof region.h === "number"
      ) {
        setCropRect({
          x: clamp(region.x, 0, 1),
          y: clamp(region.y, 0, 1),
          w: clamp(region.w, 0.02, 1),
          h: clamp(region.h, 0.02, 1)
        });
        if (region.aspect) {
          setAspect(region.aspect);
        }
        setStatus("Desktop region selected");
      }
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    const off = window.electronAPI?.on("region-overlay-state", (payload) => {
      const p = payload as { state?: string } | undefined;
      if (p?.state === "selecting") {
        setRegionOverlay("selecting");
      } else if (p?.state === "passive") {
        setRegionOverlay("passive");
      } else {
        setRegionOverlay("idle");
      }
    });
    return () => off?.();
  }, []);

  const recordingValue: RecordingContextValue = {
    mode,
    setMode,
    aspect,
    setAspect,
    format,
    setFormat,
    micEnabled,
    setMicEnabled,
    pipEnabled,
    setPipEnabled,
    sessionActive: recording,
    capturePaused,
    elapsedLabel,
    status,
    error,
    checking,
    preflightItems,
    preflightGuide,
    regionOverlay,
    outputResolution,
    runPreflight,
    handleChooseDesktop,
    toggleRecordPause,
    stopRecord
  };

  return <RecordingContext.Provider value={recordingValue}>{children}</RecordingContext.Provider>;
}
