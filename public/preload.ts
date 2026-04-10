import { contextBridge, ipcRenderer } from "electron";

const channels = [
  "shape-change",
  "size-change",
  "filter-change",
  "border-change",
  "border-color-change",
  "camera-source-change",
  "background-settings-change",
  "camera-ready",
  "camera-loading",
  "minimize-float-window",
  "close-float-window",
  "show-float-window",
  "open-region-selector",
  "region-selected",
  "region-overlay-state",
  "cancel-region-selector",
  "selector-passive-mode",
  "selector-active-mode",
  "recording-started",
  "recording-finished",
  "get-desktop-sources",
  "save-recording",
  "check-ffmpeg",
  "settings-layout-toggle"
] as const;

type Channel = (typeof channels)[number];

const electronAPI = {
  send: (channel: Channel, payload?: unknown) => {
    ipcRenderer.send(channel, payload);
  },
  invoke: (
    channel:
      | "get-desktop-sources"
      | "save-recording"
      | "check-ffmpeg"
      | "macos-camera-access-status"
      | "request-macos-camera-access",
    payload?: unknown
  ) => {
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel: Channel, listener: (payload?: unknown) => void) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, wrappedListener);
    return () => ipcRenderer.removeListener(channel, wrappedListener);
  }
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
