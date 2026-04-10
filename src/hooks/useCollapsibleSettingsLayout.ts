import { useCallback, useEffect, useMemo, useState } from "react";
import type { PanelType } from "../components/Sidebar";
import { SETTINGS_LAYOUT_TOGGLE_IPC, type SettingsLayoutIpcPayload } from "../constants/settingsWindowLayout";

export interface CollapsibleSettingsLayoutState {
  activePanel: PanelType;
  /** Select a section and expand the control sheet. */
  selectPanel: (panel: PanelType) => void;
  /** Collapse to the icon rail only. */
  collapsePanel: () => void;
  sheetExpanded: boolean;
  /** For the root `<main>` element. */
  mainClassName: string;
  /** Pass to the content `<section hidden={…}>`. */
  contentHidden: boolean;
}

/**
 * Collapsible settings chrome: panel expanded by default, can be collapsed to icon rail.
 * When `syncWithElectron` is true, notifies the main process to resize the settings `BrowserWindow`.
 */
export function useCollapsibleSettingsLayout(syncWithElectron: boolean): CollapsibleSettingsLayoutState {
  const [activePanel, setActivePanel] = useState<PanelType>("camera");
  const [sheetExpanded, setSheetExpanded] = useState(true);

  const selectPanel = useCallback((panel: PanelType) => {
    setActivePanel(panel);
    setSheetExpanded(true);
  }, []);

  const collapsePanel = useCallback(() => {
    setSheetExpanded(false);
  }, []);

  useEffect(() => {
    if (!syncWithElectron) {
      return;
    }
    const send = window.electronAPI?.send;
    if (!send) {
      return;
    }
    const payload: SettingsLayoutIpcPayload = { expanded: sheetExpanded };
    send(SETTINGS_LAYOUT_TOGGLE_IPC, payload);
  }, [syncWithElectron, sheetExpanded]);

  const mainClassName = useMemo(
    () =>
      `settings-layout ${sheetExpanded ? "settings-layout--expanded" : "settings-layout--collapsed"}`,
    [sheetExpanded]
  );

  return {
    activePanel,
    selectPanel,
    collapsePanel,
    sheetExpanded,
    mainClassName,
    contentHidden: !sheetExpanded
  };
}
