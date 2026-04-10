export type ShapeType =
  | "circle"
  | "square"
  | "rounded"
  | "heart"
  | "star"
  | "diamond"
  | "hexagon"
  | "triangle";

export type SizeType = "small" | "medium" | "large" | "xlarge";

export type FilterType =
  | "none"
  | "grayscale"
  | "sepia"
  | "invert"
  | "blur"
  | "brightness"
  | "contrast";

/** Virtual background: none = raw camera; blur / preset / custom use segmentation (MediaPipe). */
export type BackgroundMode = "none" | "blur" | "preset" | "custom";

export interface BackgroundSettingsPayload {
  mode: BackgroundMode;
  preset: string;
  customImage: string;
}

export interface CameraSettings {
  deviceId: string;
  shape: ShapeType;
  size: SizeType;
  filter: FilterType;
  borderEnabled: boolean;
  borderColor: string;
  backgroundMode: BackgroundMode;
  /** Key into `BACKGROUND_PRESET_KEYS` when mode is `preset`. */
  backgroundPreset: string;
  /** JPEG/PNG data URL when mode is `custom` (may be empty). */
  backgroundCustomImage: string;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}
