import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  screen,
  systemPreferences
} from "electron";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

type SizeType = "small" | "medium" | "large" | "xlarge";

const WINDOW_SIZES: Record<SizeType, number> = {
  small: 160,
  medium: 240,
  large: 320,
  xlarge: 400
};

/** Settings window: icon rail only vs full panel (sync with `src/constants/settingsWindowLayout.ts`). */
const SETTINGS_COLLAPSED_WIDTH = 96;
const SETTINGS_EXPANDED_WIDTH = 420;
const SETTINGS_WINDOW_HEIGHT = 680;

let settingsWindow: BrowserWindow | null = null;
let floatWindow: BrowserWindow | null = null;
let selectorWindow: BrowserWindow | null = null;
let isQuitting = false;
let isRecordingActive = false;
const execFileAsync = promisify(execFile);
let devFfmpegPath: string | undefined;
try {
  // Development-only ffmpeg path from dependency.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  devFfmpegPath = require("ffmpeg-static") as string;
} catch {
  devFfmpegPath = undefined;
}

function getPackagedFfmpegCandidatePaths(): string[] {
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const candidates = [path.join(process.resourcesPath, "bin", binaryName), path.join(process.resourcesPath, binaryName)];
  if (devFfmpegPath) {
    candidates.push(path.join(process.resourcesPath, path.basename(devFfmpegPath)));
  }
  return candidates;
}

async function resolveFfmpegPath(): Promise<string | null> {
  const candidates = app.isPackaged
    ? getPackagedFfmpegCandidatePaths()
    : [devFfmpegPath, "ffmpeg"].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate === "ffmpeg") {
      try {
        await execFileAsync(candidate, ["-version"]);
        return candidate;
      } catch {
        continue;
      }
    }
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function raiseFloatAboveRegionSelector() {
  if (!floatWindow || floatWindow.isDestroyed()) {
    return;
  }
  // Region selector uses `pop-up-menu`; default float used a lower level and sat underneath,
  // so the camera preview disappeared behind the fullscreen transparent overlay.
  if (process.platform === "darwin") {
    floatWindow.setAlwaysOnTop(true, "pop-up-menu", 2);
  } else {
    floatWindow.setAlwaysOnTop(true);
  }
  floatWindow.moveTop();
}

function configureRegionSelectorStacking() {
  if (!selectorWindow || selectorWindow.isDestroyed()) {
    return;
  }
  if (process.platform === "darwin") {
    selectorWindow.setAlwaysOnTop(true, "pop-up-menu", 0);
  } else {
    selectorWindow.setAlwaysOnTop(true);
  }
}

function sendRegionOverlayState(state: "selecting" | "passive" | "closed") {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("region-overlay-state", { state });
  }
}

function showFloatWindow() {
  if (!floatWindow || floatWindow.isDestroyed()) {
    return;
  }
  if (floatWindow.isMinimized()) {
    floatWindow.restore();
  }
  floatWindow.show();
  raiseFloatAboveRegionSelector();
}

function createApplicationMenu() {
  const showOverlayItem: MenuItemConstructorOptions = {
    label: "Show Camera Overlay",
    accelerator: "CmdOrCtrl+Shift+O",
    click: () => showFloatWindow()
  };

  const template: MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" }
            ]
          },
          { role: "editMenu" },
          {
            label: "Window",
            submenu: [
              { role: "minimize" },
              { type: "separator" },
              showOverlayItem
            ]
          }
        ]
      : [
          { role: "fileMenu" },
          { role: "editMenu" },
          {
            label: "Window",
            submenu: [{ role: "minimize" }, { type: "separator" }, showOverlayItem]
          }
        ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getRendererUrl(windowType: "settings" | "float" | "selector"): string {
  const isDev = !app.isPackaged;
  if (isDev) {
    return `http://localhost:3000?window=${windowType}`;
  }
  return `file://${path.join(__dirname, "../build/index.html")}?window=${windowType}`;
}

function applySettingsWindowLayout(expanded: boolean) {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    return;
  }
  const targetW = expanded ? SETTINGS_EXPANDED_WIDTH : SETTINGS_COLLAPSED_WIDTH;
  const h = SETTINGS_WINDOW_HEIGHT;
  const b = settingsWindow.getBounds();

  // Previous min/max (e.g. maxWidth 96 when collapsed) would clamp setBounds, so the panel never grew.
  settingsWindow.setMinimumSize(64, h);
  settingsWindow.setMaximumSize(10000, h);
  settingsWindow.setBounds({ x: b.x, y: b.y, width: targetW, height: h }, true);
  settingsWindow.setMinimumSize(targetW, h);
  settingsWindow.setMaximumSize(targetW, h);
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: SETTINGS_EXPANDED_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    minWidth: SETTINGS_EXPANDED_WIDTH,
    minHeight: SETTINGS_WINDOW_HEIGHT,
    maxWidth: SETTINGS_EXPANDED_WIDTH,
    maxHeight: SETTINGS_WINDOW_HEIGHT,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  settingsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  settingsWindow.loadURL(getRendererUrl("settings"));

  settingsWindow.on("close", async (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    const response = await dialog.showMessageBox(settingsWindow!, {
      type: "question",
      buttons: ["Cancel", "Quit"],
      defaultId: 1,
      cancelId: 0,
      title: "Exit confirmation",
      message: "Are you sure you want to quit TableCam?"
    });
    if (response.response === 1) {
      isQuitting = true;
      app.quit();
    }
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

async function promptMacosCameraAccessIfNeeded() {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    const status = systemPreferences.getMediaAccessStatus("camera");
    if (status === "not-determined") {
      await systemPreferences.askForMediaAccess("camera");
    }
  } catch {
    // Non-fatal; renderer will still call getUserMedia.
  }
}

async function promptMacosMicrophoneAccessIfNeeded() {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "not-determined") {
      await systemPreferences.askForMediaAccess("microphone");
    }
  } catch {
    // Non-fatal; renderer can still request via getUserMedia.
  }
}

function createFloatWindow() {
  floatWindow = new BrowserWindow({
    width: WINDOW_SIZES.medium,
    height: WINDOW_SIZES.medium,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatWindow.loadURL(getRendererUrl("float"));
  floatWindow.webContents.once("did-finish-load", () => {
    raiseFloatAboveRegionSelector();
    const win = floatWindow;
    if (win && !win.isDestroyed()) {
      win.show();
    }
  });

  floatWindow.on("closed", () => {
    floatWindow = null;
  });
}

function createSelectorWindow(aspect: string) {
  if (selectorWindow && !selectorWindow.isDestroyed()) {
    selectorWindow.setIgnoreMouseEvents(false);
    selectorWindow.webContents.send("selector-active-mode");
    configureRegionSelectorStacking();
    raiseFloatAboveRegionSelector();
    selectorWindow.showInactive();
    return;
  }
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  selectorWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    movable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  configureRegionSelectorStacking();
  // Keep selector in current active space; avoid Space switching side effects.
  selectorWindow.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  selectorWindow.setMenuBarVisibility(false);
  selectorWindow.loadURL(`${getRendererUrl("selector")}&aspect=${encodeURIComponent(aspect)}`);
  selectorWindow.once("ready-to-show", () => {
    selectorWindow?.showInactive();
    raiseFloatAboveRegionSelector();
  });
  selectorWindow.on("closed", () => {
    selectorWindow = null;
    sendRegionOverlayState("closed");
  });
}

async function saveRecording(payload: {
  bytes: number[];
  mode: "region" | "camera" | "both";
  requestedFormat: "auto" | "mp4" | "webm-vp9" | "webm-vp8" | "webm" | "mov";
  sourceExt: "mp4" | "webm";
  micBytes?: number[];
  micSourceExt?: "mp4" | "webm";
}) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName =
    payload.mode === "camera"
      ? `tablecam-camera-${ts}`
      : payload.mode === "both"
        ? `tablecam-desktop-camera-${ts}`
        : `tablecam-desktop-region-${ts}`;

  const targetExt =
    payload.requestedFormat === "mov"
      ? "mov"
      : payload.requestedFormat === "mp4"
      ? "mp4"
      : payload.requestedFormat === "auto"
      ? payload.sourceExt
      : "webm";

  const defaultPath = path.join(app.getPath("downloads"), `${baseName}.${targetExt}`);
  const saveDialogOptions = {
    title: "Save Recording",
    defaultPath,
    buttonLabel: "Save",
    filters:
      targetExt === "mov"
        ? [{ name: "QuickTime Movie", extensions: ["mov"] }]
        : targetExt === "mp4"
        ? [{ name: "MPEG-4 Video", extensions: ["mp4"] }]
        : [{ name: "WebM Video", extensions: ["webm"] }]
  };
  const savePick = settingsWindow && !settingsWindow.isDestroyed()
    ? await dialog.showSaveDialog(settingsWindow, saveDialogOptions)
    : await dialog.showSaveDialog(saveDialogOptions);
  if (savePick.canceled || !savePick.filePath) {
    return {
      ok: false,
      savedPath: "",
      converted: false,
      canceled: true,
      error: "User cancelled save."
    };
  }
  const outputPath = savePick.filePath;

  const hasSeparateMic =
    Array.isArray(payload.micBytes) &&
    payload.micBytes.length > 0 &&
    (payload.micSourceExt === "webm" || payload.micSourceExt === "mp4");

  if (targetExt === payload.sourceExt && !hasSeparateMic) {
    await fs.writeFile(outputPath, Buffer.from(payload.bytes));
    return { ok: true, savedPath: outputPath, converted: false };
  }

  const tempSourcePath = path.join(app.getPath("temp"), `${baseName}.${payload.sourceExt}`);
  await fs.writeFile(tempSourcePath, Buffer.from(payload.bytes));
  const tempMicPath = hasSeparateMic ? path.join(app.getPath("temp"), `${baseName}-mic.${payload.micSourceExt}`) : "";
  if (hasSeparateMic) {
    await fs.writeFile(tempMicPath, Buffer.from(payload.micBytes!));
  }
  const ffmpegCmd = await resolveFfmpegPath();
  if (!ffmpegCmd) {
    return {
      ok: false,
      savedPath: tempSourcePath,
      converted: false,
      error: `No bundled FFmpeg found. Cannot convert to .${targetExt}.`,
      targetExt
    };
  }
  try {
    const sourceArgs = hasSeparateMic ? ["-i", tempSourcePath, "-i", tempMicPath] : ["-i", tempSourcePath];
    const mapArgs = hasSeparateMic ? ["-map", "0:v:0", "-map", "1:a:0"] : ["-map", "0:v:0", "-map", "0:a?"];
    let args: string[];
    if (targetExt === "mp4" || targetExt === "mov") {
      args = [
        "-y",
        ...sourceArgs,
        ...mapArgs,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        ...(targetExt === "mp4" ? ["-movflags", "+faststart"] : []),
        outputPath
      ];
    } else {
      // Keep WebM as WebM codecs; this path is used when merging backup mic into webm outputs.
      args = [
        "-y",
        ...sourceArgs,
        ...mapArgs,
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        "33",
        "-row-mt",
        "1",
        "-deadline",
        "realtime",
        "-cpu-used",
        "5",
        "-c:a",
        "libopus",
        "-b:a",
        "128k",
        outputPath
      ];
    }
    await execFileAsync(ffmpegCmd, args);
    await fs.unlink(tempSourcePath).catch(() => undefined);
    if (tempMicPath) {
      await fs.unlink(tempMicPath).catch(() => undefined);
    }
    return { ok: true, savedPath: outputPath, converted: true };
  } catch {
    // Keep source file and inform renderer conversion is unavailable.
    return {
      ok: false,
      savedPath: tempSourcePath,
      converted: false,
      error: `Conversion to .${targetExt} failed. Install ffmpeg (or add ffmpeg-static) to enable reliable ${targetExt.toUpperCase()} export.`,
      targetExt
    };
  }
}

function forwardToFloat(channel: string, payload: unknown) {
  if (!floatWindow || floatWindow.isDestroyed()) {
    return;
  }
  floatWindow.webContents.send(channel, payload);
}

function setupIpc() {
  ipcMain.on("shape-change", (_event, shape) => forwardToFloat("shape-change", shape));
  ipcMain.on("size-change", (_event, size: SizeType) => {
    const pixelSize = WINDOW_SIZES[size] ?? WINDOW_SIZES.medium;
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.setSize(pixelSize, pixelSize, true);
    }
    forwardToFloat("size-change", size);
  });
  ipcMain.on("filter-change", (_event, filter) => forwardToFloat("filter-change", filter));
  ipcMain.on("border-change", (_event, enabled) => forwardToFloat("border-change", enabled));
  ipcMain.on("border-color-change", (_event, color) => forwardToFloat("border-color-change", color));
  ipcMain.on("camera-source-change", (_event, deviceId) => forwardToFloat("camera-source-change", deviceId));
  ipcMain.on("background-settings-change", (_event, payload) =>
    forwardToFloat("background-settings-change", payload)
  );

  ipcMain.on("settings-layout-toggle", (_event, payload: unknown) => {
    const expanded =
      typeof payload === "object" &&
      payload !== null &&
      (payload as { expanded?: boolean }).expanded === true;
    applySettingsWindowLayout(expanded);
  });

  ipcMain.on("camera-ready", () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send("camera-ready");
    }
  });

  ipcMain.on("camera-loading", () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send("camera-loading");
    }
  });

  ipcMain.on("minimize-float-window", () => {
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.minimize();
    }
  });

  ipcMain.on("close-float-window", () => {
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.hide();
    }
  });

  ipcMain.on("show-float-window", () => {
    showFloatWindow();
  });

  ipcMain.on("open-region-selector", (_event, payload) => {
    const aspect = typeof payload === "string" ? payload : "16:9";
    createSelectorWindow(aspect);
    sendRegionOverlayState("selecting");
  });

  ipcMain.on("region-selected", (_event, payload) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.showInactive();
      settingsWindow.moveTop();
      settingsWindow.webContents.send("region-selected", payload);
    }
    raiseFloatAboveRegionSelector();
    sendRegionOverlayState("passive");
    if (selectorWindow && !selectorWindow.isDestroyed()) {
      selectorWindow.setIgnoreMouseEvents(true, { forward: true });
      selectorWindow.webContents.send("selector-passive-mode");
      selectorWindow.showInactive();
    }
  });

  ipcMain.on("cancel-region-selector", () => {
    sendRegionOverlayState("closed");
    if (selectorWindow && !selectorWindow.isDestroyed()) {
      selectorWindow.close();
    }
  });

  ipcMain.on("recording-finished", () => {
    sendRegionOverlayState("closed");
    if (isRecordingActive && selectorWindow && !selectorWindow.isDestroyed()) {
      selectorWindow.close();
    }
    isRecordingActive = false;
  });

  ipcMain.on("recording-started", () => {
    isRecordingActive = true;
  });

  ipcMain.handle("get-desktop-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      fetchWindowIcons: false,
      thumbnailSize: { width: 0, height: 0 }
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name
    }));
  });

  ipcMain.handle("save-recording", async (_event, payload) => {
    return saveRecording(payload);
  });

  ipcMain.handle("check-ffmpeg", async () => {
    const ffmpegCmd = await resolveFfmpegPath();
    return { ok: Boolean(ffmpegCmd), path: ffmpegCmd || "unavailable" };
  });

  ipcMain.handle("macos-camera-access-status", () => {
    if (process.platform !== "darwin") {
      return { platform: process.platform, camera: "not-applicable" as const };
    }
    return { platform: "darwin" as const, camera: systemPreferences.getMediaAccessStatus("camera") };
  });

  ipcMain.handle("request-macos-camera-access", async () => {
    if (process.platform !== "darwin") {
      return { granted: true, camera: "not-applicable" as const };
    }
    const before = systemPreferences.getMediaAccessStatus("camera");
    if (before === "granted") {
      return { granted: true, camera: "granted" as const };
    }
    if (before === "denied") {
      return { granted: false, camera: "denied" as const };
    }
    const granted = await systemPreferences.askForMediaAccess("camera");
    return { granted, camera: granted ? ("granted" as const) : ("denied" as const) };
  });

  ipcMain.handle("macos-microphone-access-status", () => {
    if (process.platform !== "darwin") {
      return { platform: process.platform, microphone: "not-applicable" as const };
    }
    return {
      platform: "darwin" as const,
      microphone: systemPreferences.getMediaAccessStatus("microphone")
    };
  });

  ipcMain.handle("request-macos-microphone-access", async () => {
    if (process.platform !== "darwin") {
      return { granted: true, microphone: "not-applicable" as const };
    }
    const before = systemPreferences.getMediaAccessStatus("microphone");
    if (before === "granted") {
      return { granted: true, microphone: "granted" as const };
    }
    if (before === "denied") {
      return { granted: false, microphone: "denied" as const };
    }
    const granted = await systemPreferences.askForMediaAccess("microphone");
    return { granted, microphone: granted ? ("granted" as const) : ("denied" as const) };
  });
}

app.whenReady().then(() => {
  createApplicationMenu();
  setupIpc();
  createSettingsWindow();
  createFloatWindow();
  raiseFloatAboveRegionSelector();
  void promptMacosCameraAccessIfNeeded();
  void promptMacosMicrophoneAccessIfNeeded();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSettingsWindow();
      createFloatWindow();
      raiseFloatAboveRegionSelector();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
