"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const WINDOW_SIZES = {
    small: 160,
    medium: 240,
    large: 320,
    xlarge: 400
};
/** Settings window: icon rail only vs full panel (sync with `src/constants/settingsWindowLayout.ts`). */
const SETTINGS_COLLAPSED_WIDTH = 96;
const SETTINGS_EXPANDED_WIDTH = 420;
const SETTINGS_WINDOW_HEIGHT = 680;
let settingsWindow = null;
let floatWindow = null;
let selectorWindow = null;
let isQuitting = false;
let isRecordingActive = false;
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
let devFfmpegPath;
try {
    // Development-only ffmpeg path from dependency.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    devFfmpegPath = require("ffmpeg-static");
}
catch {
    devFfmpegPath = undefined;
}
function getPackagedFfmpegCandidatePaths() {
    const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    const candidates = [path_1.default.join(process.resourcesPath, "bin", binaryName), path_1.default.join(process.resourcesPath, binaryName)];
    if (devFfmpegPath) {
        candidates.push(path_1.default.join(process.resourcesPath, path_1.default.basename(devFfmpegPath)));
    }
    return candidates;
}
async function resolveFfmpegPath() {
    const candidates = electron_1.app.isPackaged
        ? getPackagedFfmpegCandidatePaths()
        : [devFfmpegPath, "ffmpeg"].filter(Boolean);
    for (const candidate of candidates) {
        if (candidate === "ffmpeg") {
            try {
                await execFileAsync(candidate, ["-version"]);
                return candidate;
            }
            catch {
                continue;
            }
        }
        try {
            await fs_1.promises.access(candidate);
            return candidate;
        }
        catch {
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
    }
    else {
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
    }
    else {
        selectorWindow.setAlwaysOnTop(true);
    }
}
function sendRegionOverlayState(state) {
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
    const showOverlayItem = {
        label: "Show Camera Overlay",
        accelerator: "CmdOrCtrl+Shift+O",
        click: () => showFloatWindow()
    };
    const template = process.platform === "darwin"
        ? [
            {
                label: electron_1.app.name,
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
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
function getRendererUrl(windowType) {
    const isDev = !electron_1.app.isPackaged;
    if (isDev) {
        return `http://localhost:3000?window=${windowType}`;
    }
    return `file://${path_1.default.join(__dirname, "../build/index.html")}?window=${windowType}`;
}
function applySettingsWindowLayout(expanded) {
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
    settingsWindow = new electron_1.BrowserWindow({
        width: SETTINGS_EXPANDED_WIDTH,
        height: SETTINGS_WINDOW_HEIGHT,
        minWidth: SETTINGS_EXPANDED_WIDTH,
        minHeight: SETTINGS_WINDOW_HEIGHT,
        maxWidth: SETTINGS_EXPANDED_WIDTH,
        maxHeight: SETTINGS_WINDOW_HEIGHT,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
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
        const response = await electron_1.dialog.showMessageBox(settingsWindow, {
            type: "question",
            buttons: ["Cancel", "Quit"],
            defaultId: 1,
            cancelId: 0,
            title: "Exit confirmation",
            message: "Are you sure you want to quit TableCam?"
        });
        if (response.response === 1) {
            isQuitting = true;
            electron_1.app.quit();
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
        const status = electron_1.systemPreferences.getMediaAccessStatus("camera");
        if (status === "not-determined") {
            await electron_1.systemPreferences.askForMediaAccess("camera");
        }
    }
    catch {
        // Non-fatal; renderer will still call getUserMedia.
    }
}
async function promptMacosMicrophoneAccessIfNeeded() {
    if (process.platform !== "darwin") {
        return;
    }
    try {
        const status = electron_1.systemPreferences.getMediaAccessStatus("microphone");
        if (status === "not-determined") {
            await electron_1.systemPreferences.askForMediaAccess("microphone");
        }
    }
    catch {
        // Non-fatal; renderer can still request via getUserMedia.
    }
}
function createFloatWindow() {
    floatWindow = new electron_1.BrowserWindow({
        width: WINDOW_SIZES.medium,
        height: WINDOW_SIZES.medium,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        alwaysOnTop: true,
        resizable: false,
        hasShadow: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
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
function createSelectorWindow(aspect) {
    if (selectorWindow && !selectorWindow.isDestroyed()) {
        selectorWindow.setIgnoreMouseEvents(false);
        selectorWindow.webContents.send("selector-active-mode");
        configureRegionSelectorStacking();
        raiseFloatAboveRegionSelector();
        selectorWindow.showInactive();
        return;
    }
    const cursorPoint = electron_1.screen.getCursorScreenPoint();
    const display = electron_1.screen.getDisplayNearestPoint(cursorPoint);
    selectorWindow = new electron_1.BrowserWindow({
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
            preload: path_1.default.join(__dirname, "preload.js"),
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
async function saveRecording(payload) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = payload.mode === "camera"
        ? `tablecam-camera-${ts}`
        : payload.mode === "both"
            ? `tablecam-desktop-camera-${ts}`
            : `tablecam-desktop-region-${ts}`;
    const targetExt = payload.requestedFormat === "mov"
        ? "mov"
        : payload.requestedFormat === "mp4"
            ? "mp4"
            : payload.requestedFormat === "auto"
                ? payload.sourceExt
                : "webm";
    const defaultPath = path_1.default.join(electron_1.app.getPath("downloads"), `${baseName}.${targetExt}`);
    const saveDialogOptions = {
        title: "Save Recording",
        defaultPath,
        buttonLabel: "Save",
        filters: targetExt === "mov"
            ? [{ name: "QuickTime Movie", extensions: ["mov"] }]
            : targetExt === "mp4"
                ? [{ name: "MPEG-4 Video", extensions: ["mp4"] }]
                : [{ name: "WebM Video", extensions: ["webm"] }]
    };
    const savePick = settingsWindow && !settingsWindow.isDestroyed()
        ? await electron_1.dialog.showSaveDialog(settingsWindow, saveDialogOptions)
        : await electron_1.dialog.showSaveDialog(saveDialogOptions);
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
    const hasSeparateMic = Array.isArray(payload.micBytes) &&
        payload.micBytes.length > 0 &&
        (payload.micSourceExt === "webm" || payload.micSourceExt === "mp4");
    if (targetExt === payload.sourceExt && !hasSeparateMic) {
        await fs_1.promises.writeFile(outputPath, Buffer.from(payload.bytes));
        return { ok: true, savedPath: outputPath, converted: false };
    }
    const tempSourcePath = path_1.default.join(electron_1.app.getPath("temp"), `${baseName}.${payload.sourceExt}`);
    await fs_1.promises.writeFile(tempSourcePath, Buffer.from(payload.bytes));
    const tempMicPath = hasSeparateMic ? path_1.default.join(electron_1.app.getPath("temp"), `${baseName}-mic.${payload.micSourceExt}`) : "";
    if (hasSeparateMic) {
        await fs_1.promises.writeFile(tempMicPath, Buffer.from(payload.micBytes));
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
        let args;
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
        }
        else {
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
        await fs_1.promises.unlink(tempSourcePath).catch(() => undefined);
        if (tempMicPath) {
            await fs_1.promises.unlink(tempMicPath).catch(() => undefined);
        }
        return { ok: true, savedPath: outputPath, converted: true };
    }
    catch {
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
function forwardToFloat(channel, payload) {
    if (!floatWindow || floatWindow.isDestroyed()) {
        return;
    }
    floatWindow.webContents.send(channel, payload);
}
function setupIpc() {
    electron_1.ipcMain.on("shape-change", (_event, shape) => forwardToFloat("shape-change", shape));
    electron_1.ipcMain.on("size-change", (_event, size) => {
        const pixelSize = WINDOW_SIZES[size] ?? WINDOW_SIZES.medium;
        if (floatWindow && !floatWindow.isDestroyed()) {
            floatWindow.setSize(pixelSize, pixelSize, true);
        }
        forwardToFloat("size-change", size);
    });
    electron_1.ipcMain.on("filter-change", (_event, filter) => forwardToFloat("filter-change", filter));
    electron_1.ipcMain.on("border-change", (_event, enabled) => forwardToFloat("border-change", enabled));
    electron_1.ipcMain.on("border-color-change", (_event, color) => forwardToFloat("border-color-change", color));
    electron_1.ipcMain.on("camera-source-change", (_event, deviceId) => forwardToFloat("camera-source-change", deviceId));
    electron_1.ipcMain.on("background-settings-change", (_event, payload) => forwardToFloat("background-settings-change", payload));
    electron_1.ipcMain.on("settings-layout-toggle", (_event, payload) => {
        const expanded = typeof payload === "object" &&
            payload !== null &&
            payload.expanded === true;
        applySettingsWindowLayout(expanded);
    });
    electron_1.ipcMain.on("camera-ready", () => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.webContents.send("camera-ready");
        }
    });
    electron_1.ipcMain.on("camera-loading", () => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.webContents.send("camera-loading");
        }
    });
    electron_1.ipcMain.on("minimize-float-window", () => {
        if (floatWindow && !floatWindow.isDestroyed()) {
            floatWindow.minimize();
        }
    });
    electron_1.ipcMain.on("close-float-window", () => {
        if (floatWindow && !floatWindow.isDestroyed()) {
            floatWindow.hide();
        }
    });
    electron_1.ipcMain.on("show-float-window", () => {
        showFloatWindow();
    });
    electron_1.ipcMain.on("open-region-selector", (_event, payload) => {
        const aspect = typeof payload === "string" ? payload : "16:9";
        createSelectorWindow(aspect);
        sendRegionOverlayState("selecting");
    });
    electron_1.ipcMain.on("region-selected", (_event, payload) => {
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
    electron_1.ipcMain.on("cancel-region-selector", () => {
        sendRegionOverlayState("closed");
        if (selectorWindow && !selectorWindow.isDestroyed()) {
            selectorWindow.close();
        }
    });
    electron_1.ipcMain.on("recording-finished", () => {
        sendRegionOverlayState("closed");
        if (isRecordingActive && selectorWindow && !selectorWindow.isDestroyed()) {
            selectorWindow.close();
        }
        isRecordingActive = false;
    });
    electron_1.ipcMain.on("recording-started", () => {
        isRecordingActive = true;
    });
    electron_1.ipcMain.handle("get-desktop-sources", async () => {
        const sources = await electron_1.desktopCapturer.getSources({
            types: ["screen", "window"],
            fetchWindowIcons: false,
            thumbnailSize: { width: 0, height: 0 }
        });
        return sources.map((source) => ({
            id: source.id,
            name: source.name
        }));
    });
    electron_1.ipcMain.handle("save-recording", async (_event, payload) => {
        return saveRecording(payload);
    });
    electron_1.ipcMain.handle("check-ffmpeg", async () => {
        const ffmpegCmd = await resolveFfmpegPath();
        return { ok: Boolean(ffmpegCmd), path: ffmpegCmd || "unavailable" };
    });
    electron_1.ipcMain.handle("macos-camera-access-status", () => {
        if (process.platform !== "darwin") {
            return { platform: process.platform, camera: "not-applicable" };
        }
        return { platform: "darwin", camera: electron_1.systemPreferences.getMediaAccessStatus("camera") };
    });
    electron_1.ipcMain.handle("request-macos-camera-access", async () => {
        if (process.platform !== "darwin") {
            return { granted: true, camera: "not-applicable" };
        }
        const before = electron_1.systemPreferences.getMediaAccessStatus("camera");
        if (before === "granted") {
            return { granted: true, camera: "granted" };
        }
        if (before === "denied") {
            return { granted: false, camera: "denied" };
        }
        const granted = await electron_1.systemPreferences.askForMediaAccess("camera");
        return { granted, camera: granted ? "granted" : "denied" };
    });
    electron_1.ipcMain.handle("macos-microphone-access-status", () => {
        if (process.platform !== "darwin") {
            return { platform: process.platform, microphone: "not-applicable" };
        }
        return {
            platform: "darwin",
            microphone: electron_1.systemPreferences.getMediaAccessStatus("microphone")
        };
    });
    electron_1.ipcMain.handle("request-macos-microphone-access", async () => {
        if (process.platform !== "darwin") {
            return { granted: true, microphone: "not-applicable" };
        }
        const before = electron_1.systemPreferences.getMediaAccessStatus("microphone");
        if (before === "granted") {
            return { granted: true, microphone: "granted" };
        }
        if (before === "denied") {
            return { granted: false, microphone: "denied" };
        }
        const granted = await electron_1.systemPreferences.askForMediaAccess("microphone");
        return { granted, microphone: granted ? "granted" : "denied" };
    });
}
electron_1.app.whenReady().then(() => {
    createApplicationMenu();
    setupIpc();
    createSettingsWindow();
    createFloatWindow();
    raiseFloatAboveRegionSelector();
    void promptMacosCameraAccessIfNeeded();
    void promptMacosMicrophoneAccessIfNeeded();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createSettingsWindow();
            createFloatWindow();
            raiseFloatAboveRegionSelector();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
