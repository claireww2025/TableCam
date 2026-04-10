"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
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
];
const electronAPI = {
    send: (channel, payload) => {
        electron_1.ipcRenderer.send(channel, payload);
    },
    invoke: (channel, payload) => {
        return electron_1.ipcRenderer.invoke(channel, payload);
    },
    on: (channel, listener) => {
        const wrappedListener = (_event, payload) => listener(payload);
        electron_1.ipcRenderer.on(channel, wrappedListener);
        return () => electron_1.ipcRenderer.removeListener(channel, wrappedListener);
    }
};
electron_1.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
