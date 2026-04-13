/// <reference types="react-scripts" />

import { BackgroundSettingsPayload, CameraSettings, FilterType, ShapeType, SizeType } from "./types";

type IpcChannel =
  | "shape-change"
  | "size-change"
  | "filter-change"
  | "border-change"
  | "border-color-change"
  | "camera-source-change"
  | "background-settings-change"
  | "camera-ready"
  | "camera-loading"
  | "minimize-float-window"
  | "close-float-window"
  | "show-float-window"
  | "open-region-selector"
  | "region-selected"
  | "region-overlay-state"
  | "cancel-region-selector"
  | "selector-passive-mode"
  | "selector-active-mode"
  | "recording-started"
  | "recording-finished"
  | "get-desktop-sources"
  | "save-recording"
  | "check-ffmpeg"
  | "settings-layout-toggle";

interface ElectronAPI {
  send(channel: IpcChannel, payload?: unknown): void;
  invoke(
    channel: "get-desktop-sources",
    payload?: undefined
  ): Promise<Array<{ id: string; name: string }>>;
  invoke(
    channel: "save-recording",
    payload: {
      bytes: number[];
      mode: "region" | "camera" | "both";
      requestedFormat: "auto" | "mp4" | "webm-vp9" | "webm-vp8" | "webm" | "mov";
      sourceExt: "mp4" | "webm";
      micBytes?: number[];
      micSourceExt?: "mp4" | "webm";
    }
  ): Promise<{ ok: boolean; savedPath: string; converted: boolean; canceled?: boolean; error?: string; targetExt?: string }>;
  invoke(channel: "check-ffmpeg", payload?: undefined): Promise<{ ok: boolean; path: string }>;
  invoke(
    channel: "macos-camera-access-status",
    payload?: undefined
  ): Promise<{ platform: string; camera: string }>;
  invoke(
    channel: "request-macos-camera-access",
    payload?: undefined
  ): Promise<{ granted: boolean; camera: string }>;
  invoke(
    channel: "macos-microphone-access-status",
    payload?: undefined
  ): Promise<{ platform: string; microphone: string }>;
  invoke(
    channel: "request-macos-microphone-access",
    payload?: undefined
  ): Promise<{ granted: boolean; microphone: string }>;
  on(channel: IpcChannel, listener: (payload?: unknown) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
