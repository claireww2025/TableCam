import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import type { CollapsibleSettingsLayoutState } from "../hooks/useCollapsibleSettingsLayout";

interface SettingsMainProps {
  layout: CollapsibleSettingsLayoutState;
  children: ReactNode;
}

/**
 * Settings window shell: left `Sidebar` + optional content region (hidden when collapsed).
 */
export default function SettingsMain({ layout, children }: SettingsMainProps) {
  const { activePanel, selectPanel, collapsePanel, sheetExpanded, mainClassName, contentHidden } = layout;

  return (
    <main className={mainClassName}>
      <Sidebar
        activePanel={activePanel}
        onSelect={selectPanel}
        sheetExpanded={sheetExpanded}
        onCollapseSheet={collapsePanel}
      />
      <section className="settings-content" hidden={contentHidden}>
        {children}
      </section>
    </main>
  );
}
