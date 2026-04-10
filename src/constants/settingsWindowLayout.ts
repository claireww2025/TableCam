/**
 * Collapsible settings shell: icon rail vs full panel. Payload is sent from the renderer;
 * `public/main.ts` listens on the same channel (keep the string identical).
 */
export const SETTINGS_LAYOUT_TOGGLE_IPC = "settings-layout-toggle" as const;

export type SettingsLayoutIpcPayload = { expanded: boolean };

/**
 * Mirror of `BrowserWindow` bounds in `public/main.ts` — update both when changing layout.
 */
export const SETTINGS_WINDOW_COLLAPSED_WIDTH_PX = 96;
export const SETTINGS_WINDOW_EXPANDED_WIDTH_PX = 420;
export const SETTINGS_WINDOW_HEIGHT_PX = 680;
