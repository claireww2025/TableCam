/** Preset keys for virtual background gradients (drawn on canvas behind the person). */
export const BACKGROUND_PRESET_KEYS = ["ocean", "sunset", "forest", "studio", "dark", "aurora"] as const;
export type BackgroundPresetKey = (typeof BACKGROUND_PRESET_KEYS)[number];

const PRESETS: Record<BackgroundPresetKey, Array<{ t: number; c: string }>> = {
  ocean: [
    { t: 0, c: "#0c2461" },
    { t: 1, c: "#1e90ff" }
  ],
  sunset: [
    { t: 0, c: "#ff6b6b" },
    { t: 0.5, c: "#feca57" },
    { t: 1, c: "#ff9ff3" }
  ],
  forest: [
    { t: 0, c: "#0d3b1a" },
    { t: 1, c: "#2ecc71" }
  ],
  studio: [
    { t: 0, c: "#2d1b69" },
    { t: 1, c: "#6366f1" }
  ],
  dark: [
    { t: 0, c: "#1a1a2e" },
    { t: 1, c: "#16213e" }
  ],
  aurora: [
    { t: 0, c: "#0f0c29" },
    { t: 0.5, c: "#302b63" },
    { t: 1, c: "#24243e" }
  ]
};

export function fillPresetBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  key: string
): void {
  const spec = PRESETS[key as BackgroundPresetKey] ?? PRESETS.dark;
  const g = ctx.createLinearGradient(0, 0, width, height);
  spec.forEach(({ t, c }) => g.addColorStop(t, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

export const BACKGROUND_PRESET_LABELS: Record<BackgroundPresetKey, string> = {
  ocean: "Ocean",
  sunset: "Sunset",
  forest: "Forest",
  studio: "Studio",
  dark: "Dark",
  aurora: "Aurora"
};

/** CSS backgrounds for small swatches in settings UI. */
export const BACKGROUND_PRESET_SWATCHES: Record<BackgroundPresetKey, string> = {
  ocean: "linear-gradient(135deg, #0c2461, #1e90ff)",
  sunset: "linear-gradient(135deg, #ff6b6b, #feca57)",
  forest: "linear-gradient(135deg, #0d3b1a, #2ecc71)",
  studio: "linear-gradient(135deg, #2d1b69, #6366f1)",
  dark: "linear-gradient(180deg, #1a1a2e, #16213e)",
  aurora: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)"
};
