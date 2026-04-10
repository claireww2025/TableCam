import { ReactNode } from "react";
import {
  Camera,
  ChevronLeft,
  Circle,
  Frame,
  Layers,
  ScanLine,
  SlidersHorizontal,
  Video
} from "lucide-react";
import { useRecording } from "../contexts/RecordingContext";

export type PanelType =
  | "camera"
  | "shape"
  | "size"
  | "filter"
  | "border"
  | "background"
  | "record";

interface SidebarProps {
  activePanel: PanelType;
  onSelect: (panel: PanelType) => void;
  sheetExpanded: boolean;
  onCollapseSheet: () => void;
}

const sidebarItems: Array<{ id: PanelType; label: string; short: string; icon: ReactNode }> = [
  { id: "camera", label: "Camera", short: "Camera", icon: <Camera size={18} /> },
  { id: "shape", label: "Shape", short: "Shape", icon: <Circle size={18} /> },
  { id: "size", label: "Size", short: "Size", icon: <ScanLine size={18} /> },
  { id: "filter", label: "Filter", short: "Filter", icon: <SlidersHorizontal size={18} /> },
  { id: "border", label: "Border", short: "Border", icon: <Frame size={18} /> },
  { id: "background", label: "Background", short: "BG", icon: <Layers size={18} /> },
  { id: "record", label: "Record", short: "Record", icon: <Video size={18} /> }
];

function SidebarRecordingRail() {
  const { elapsedLabel, sessionActive, capturePaused, toggleRecordPause, stopRecord } = useRecording();

  return (
    <div className="sidebar-recording-rail">
      <div className="sidebar-rec-timer" title="Recording time" aria-live="polite">
        {elapsedLabel}
      </div>
      <button
        type="button"
        className={`sidebar-rec-dot ${sessionActive && !capturePaused ? "sidebar-rec-dot--blink" : ""}`}
        onClick={() => toggleRecordPause()}
        aria-label={sessionActive ? (capturePaused ? "Resume recording" : "Pause recording") : "Start recording"}
        title={sessionActive ? (capturePaused ? "Resume" : "Pause") : "Start"}
      />
      <button
        type="button"
        className="sidebar-rec-stop"
        onClick={() => stopRecord()}
        disabled={!sessionActive}
        aria-label="Stop and save recording"
        title="Stop"
      />
    </div>
  );
}

export default function Sidebar({ activePanel, onSelect, sheetExpanded, onCollapseSheet }: SidebarProps) {
  return (
    <aside className="settings-sidebar">
      {sheetExpanded ? (
        <button
          type="button"
          className="sidebar-collapse-sheet"
          onClick={onCollapseSheet}
          aria-label="Collapse settings panel"
          title="Collapse to icon bar only"
        >
          <ChevronLeft size={17} strokeWidth={2.5} />
          <span className="sidebar-collapse-sheet-text">Hide</span>
        </button>
      ) : null}
      <div className="settings-sidebar-nav">
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-btn ${activePanel === item.id ? "active" : ""}`}
            onClick={() => onSelect(item.id)}
            aria-label={item.label}
            title={item.label}
          >
            {item.icon}
            <span className="sidebar-btn-text">{item.short}</span>
          </button>
        ))}
      </div>
      <SidebarRecordingRail />
    </aside>
  );
}
