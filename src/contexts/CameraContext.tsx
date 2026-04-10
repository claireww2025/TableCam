import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CameraSettings } from "../types";

const STORAGE_KEY = "tablecam-settings";

const defaultSettings: CameraSettings = {
  deviceId: "",
  shape: "circle",
  size: "medium",
  filter: "none",
  borderEnabled: false,
  borderColor: "#4f46e5",
  backgroundMode: "none",
  backgroundPreset: "studio",
  backgroundCustomImage: ""
};

interface CameraContextValue {
  settings: CameraSettings;
  updateSettings: (updates: Partial<CameraSettings>) => void;
}

const CameraContext = createContext<CameraContextValue | undefined>(undefined);

function loadSettings(): CameraSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultSettings;
    }
    return { ...defaultSettings, ...JSON.parse(raw) } as CameraSettings;
  } catch {
    return defaultSettings;
  }
}

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CameraSettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo(
    () => ({
      settings,
      updateSettings: (updates: Partial<CameraSettings>) => {
        setSettings((prev) => ({ ...prev, ...updates }));
      }
    }),
    [settings]
  );

  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

export function useCameraSettings() {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error("useCameraSettings must be used within CameraProvider");
  }
  return context;
}
