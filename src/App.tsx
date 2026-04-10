import { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import CameraSource from "./components/CameraSource";
import ShapeSelector from "./components/ShapeSelector";
import SizeSelector from "./components/SizeSelector";
import FilterSelector from "./components/FilterSelector";
import BorderSettings from "./components/BorderSettings";
import BackgroundSettings from "./components/BackgroundSettings";
import ScreenRecorder from "./components/ScreenRecorder";
import DesktopRegionSelector from "./components/DesktopRegionSelector";
import SettingsMain from "./components/SettingsMain";
import type { PanelType } from "./components/Sidebar";
import FloatWindow from "./components/FloatWindow";
import { useCameraSettings } from "./contexts/CameraContext";
import { RecordingProvider } from "./contexts/RecordingContext";
import { useCollapsibleSettingsLayout } from "./hooks/useCollapsibleSettingsLayout";
import {
  BackgroundMode,
  BackgroundSettingsPayload,
  CameraDevice,
  FilterType,
  ShapeType,
  SizeType
} from "./types";

const shapeValues: ShapeType[] = ["circle", "square", "rounded", "heart", "star", "diamond", "hexagon", "triangle"];
const sizeValues: SizeType[] = ["small", "medium", "large", "xlarge"];
const filterValues: FilterType[] = ["none", "grayscale", "sepia", "invert", "blur", "brightness", "contrast"];
const backgroundModes: BackgroundMode[] = ["none", "blur", "preset", "custom"];

const panelHeading: Record<PanelType, string> = {
  camera: "Camera",
  shape: "Shape",
  size: "Size",
  filter: "Filter",
  border: "Border",
  background: "Background",
  record: "Record"
};

export default function App() {
  const { settings, updateSettings } = useCameraSettings();
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [cameraError, setCameraError] = useState("");
  const [cameraStatus, setCameraStatus] = useState<"loading" | "ready">("loading");
  const showOverlay = () => window.electronAPI?.send("show-float-window");

  const viewType = new URLSearchParams(window.location.search).get("window") ?? "settings";
  const isFloatView = viewType === "float";
  const isSelectorView = viewType === "selector";

  const settingsLayout = useCollapsibleSettingsLayout(!isFloatView && !isSelectorView);
  const { activePanel } = settingsLayout;

  const loadDevices = useCallback(async () => {
    if (isFloatView || isSelectorView) {
      return;
    }
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setCameraError("Your system does not support camera enumeration.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((track) => track.stop());
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`
        }));
      setDevices(videoDevices);
      if (videoDevices.length === 0) {
        setCameraError("No camera devices found.");
        return;
      }
      setCameraError("");
      if (!settings.deviceId || !videoDevices.some((device) => device.deviceId === settings.deviceId)) {
        updateSettings({ deviceId: videoDevices[0].deviceId });
      }
    } catch (err) {
      const e = err as DOMException | Error | undefined;
      const name = e?.name ?? "";
      const msg = typeof e?.message === "string" ? e.message : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError(
          "Camera permission denied. On macOS: open System Settings → Privacy & Security → Camera, enable TableCam (or “Electron” if you run from the terminal), then fully quit and reopen the app."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraError("No camera was found. Check that a camera is connected and not in use by another app.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setCameraError("The camera is busy or could not be started. Close other apps using the camera and try again.");
      } else if (msg) {
        setCameraError(`Camera unavailable (${name || "Error"}): ${msg}`);
      } else {
        setCameraError(
          "Camera unavailable. If you installed TableCam from a zip, rebuild with the latest package so macOS camera usage text is included in the app, then allow Camera in System Settings."
        );
      }
    }
  }, [isFloatView, isSelectorView, settings.deviceId, updateSettings]);

  useEffect(() => {
    if (isFloatView || isSelectorView) {
      return;
    }
    const send = window.electronAPI?.send;
    if (!send) {
      return;
    }
    send("shape-change", settings.shape);
    send("size-change", settings.size);
    send("filter-change", settings.filter);
    send("border-change", settings.borderEnabled);
    send("border-color-change", settings.borderColor);
    send("camera-source-change", settings.deviceId);
    send("background-settings-change", {
      mode: settings.backgroundMode,
      preset: settings.backgroundPreset,
      customImage: settings.backgroundCustomImage
    });
  }, [isFloatView, isSelectorView, settings]);

  useEffect(() => {
    if (!isFloatView || isSelectorView) {
      return;
    }
    const listeners = [
      window.electronAPI?.on("shape-change", (shape) => {
        if (shapeValues.includes(shape as ShapeType)) {
          updateSettings({ shape: shape as ShapeType });
        }
      }),
      window.electronAPI?.on("size-change", (size) => {
        if (sizeValues.includes(size as SizeType)) {
          updateSettings({ size: size as SizeType });
        }
      }),
      window.electronAPI?.on("filter-change", (filter) => {
        if (filterValues.includes(filter as FilterType)) {
          updateSettings({ filter: filter as FilterType });
        }
      }),
      window.electronAPI?.on("border-change", (enabled) => updateSettings({ borderEnabled: Boolean(enabled) })),
      window.electronAPI?.on("border-color-change", (color) => updateSettings({ borderColor: String(color || "#4f46e5") })),
      window.electronAPI?.on("camera-source-change", (deviceId) => updateSettings({ deviceId: String(deviceId || "") })),
      window.electronAPI?.on("background-settings-change", (payload) => {
        const p = payload as BackgroundSettingsPayload;
        if (!p || typeof p !== "object") {
          return;
        }
        if (backgroundModes.includes(p.mode)) {
          updateSettings({
            backgroundMode: p.mode,
            backgroundPreset: typeof p.preset === "string" ? p.preset : "studio",
            backgroundCustomImage: typeof p.customImage === "string" ? p.customImage : ""
          });
        }
      })
    ];
    return () => {
      listeners.forEach((dispose) => dispose?.());
    };
  }, [isFloatView, isSelectorView, updateSettings]);

  useEffect(() => {
    if (isFloatView || isSelectorView) {
      return;
    }
    void loadDevices();
    navigator.mediaDevices?.addEventListener("devicechange", loadDevices);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", loadDevices);
  }, [isFloatView, isSelectorView, loadDevices]);

  useEffect(() => {
    if (isSelectorView) {
      return;
    }
    const offReady = window.electronAPI?.on("camera-ready", () => setCameraStatus("ready"));
    const offLoading = window.electronAPI?.on("camera-loading", () => setCameraStatus("loading"));
    return () => {
      offReady?.();
      offLoading?.();
    };
  }, [isSelectorView]);

  const panel = useMemo(() => {
    switch (activePanel) {
      case "camera":
        return (
          <CameraSource
            devices={devices}
            value={settings.deviceId}
            onChange={(value) => updateSettings({ deviceId: value })}
            error={cameraError}
            onRetry={() => void loadDevices()}
          />
        );
      case "shape":
        return <ShapeSelector value={settings.shape} onChange={(value) => updateSettings({ shape: value })} />;
      case "size":
        return <SizeSelector value={settings.size} onChange={(value) => updateSettings({ size: value })} />;
      case "filter":
        return <FilterSelector value={settings.filter} onChange={(value) => updateSettings({ filter: value })} />;
      case "border":
        return (
          <BorderSettings
            enabled={settings.borderEnabled}
            color={settings.borderColor}
            onEnabledChange={(enabled) => updateSettings({ borderEnabled: enabled })}
            onColorChange={(color) => updateSettings({ borderColor: color })}
          />
        );
      case "background":
        return (
          <BackgroundSettings
            mode={settings.backgroundMode}
            preset={settings.backgroundPreset}
            customImage={settings.backgroundCustomImage}
            onModeChange={(mode) => updateSettings({ backgroundMode: mode })}
            onPresetChange={(preset) => updateSettings({ backgroundPreset: preset })}
            onCustomImageChange={(dataUrl) => updateSettings({ backgroundCustomImage: dataUrl })}
          />
        );
      case "record":
        return <ScreenRecorder />;
      default:
        return null;
    }
  }, [activePanel, cameraError, devices, loadDevices, settings, updateSettings]);

  if (isFloatView) {
    return <FloatWindow settings={settings} />;
  }
  if (isSelectorView) {
    return <DesktopRegionSelector />;
  }

  return (
    <RecordingProvider>
      <SettingsMain layout={settingsLayout}>
        <div className="settings-header">
          <h4>TableCam</h4>
          <div className="settings-header-actions">
            <Button type="button" variant="outline-light" size="sm" className="me-2" onClick={showOverlay}>
              Show overlay
            </Button>
            <Badge bg={cameraStatus === "ready" ? "success" : "warning"}>{cameraStatus}</Badge>
            {cameraError ? (
              <Badge bg="danger" className="ms-1" title={cameraError}>
                Camera error
              </Badge>
            ) : null}
          </div>
        </div>
        <p className="panel-help">
          Keep this panel open to tweak your floating camera window. Shortcut:{" "}
          {/Mac|iPhone|iPod|iPad/i.test(navigator.platform) ? "⌘⇧O" : "Ctrl+Shift+O"} restores the camera overlay when
          TableCam is focused.
        </p>
        <Button type="button" variant="primary" size="sm" className="mb-2" onClick={showOverlay}>
          Re-open Camera Window
        </Button>
        <h2 className="settings-panel-heading">{panelHeading[activePanel]}</h2>
        {panel}
      </SettingsMain>
    </RecordingProvider>
  );
}
