import { useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Form from "react-bootstrap/Form";
import { BackgroundMode } from "../types";
import {
  BACKGROUND_PRESET_KEYS,
  BACKGROUND_PRESET_LABELS,
  BACKGROUND_PRESET_SWATCHES,
  BackgroundPresetKey
} from "../constants/backgroundPresets";

const MAX_STORED_BG_CHARS = 750_000;

interface BackgroundSettingsProps {
  mode: BackgroundMode;
  preset: string;
  customImage: string;
  onModeChange: (mode: BackgroundMode) => void;
  onPresetChange: (preset: string) => void;
  onCustomImageChange: (dataUrl: string) => void;
}

async function compressImageFile(file: File, maxSide: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let w = bitmap.width;
  let h = bitmap.height;
  if (w > maxSide || h > maxSide) {
    if (w >= h) {
      h = Math.round((h / w) * maxSide);
      w = maxSide;
    } else {
      w = Math.round((w / h) * maxSide);
      h = maxSide;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas not available");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export default function BackgroundSettings({
  mode,
  preset,
  customImage,
  onModeChange,
  onPresetChange,
  onCustomImageChange
}: BackgroundSettingsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadHint, setUploadHint] = useState<string | null>(null);

  const handleFile = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file || !file.type.startsWith("image/")) {
      return;
    }
    setUploadHint(null);
    try {
      let data = await compressImageFile(file, 960, 0.82);
      if (data.length > MAX_STORED_BG_CHARS) {
        data = await compressImageFile(file, 640, 0.68);
      }
      if (data.length > MAX_STORED_BG_CHARS) {
        setUploadHint("Image is still too large after compression. Try a smaller file.");
        return;
      }
      onCustomImageChange(data);
      onModeChange("custom");
      setUploadHint("Background image saved.");
    } catch {
      setUploadHint("Could not read that image.");
    }
  };

  return (
    <div className="panel-block">
      <h5>Virtual background</h5>
      <p className="panel-help">
        Blur, gradient presets, or your own image behind you. Uses on-device segmentation (first load downloads a small
        model). Works best with good lighting.
      </p>
      <Form.Group className="mb-3">
        <Form.Label>Mode</Form.Label>
        <Form.Select value={mode} onChange={(e) => onModeChange(e.target.value as BackgroundMode)}>
          <option value="none">None (original camera)</option>
          <option value="blur">Blur background</option>
          <option value="preset">Preset gradient</option>
          <option value="custom">Custom image</option>
        </Form.Select>
      </Form.Group>
      {mode === "preset" ? (
        <Form.Group className="mb-3">
          <Form.Label>Preset</Form.Label>
          <div className="bg-preset-grid">
            {BACKGROUND_PRESET_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`bg-preset-swatch ${preset === key ? "active" : ""}`}
                style={{ background: BACKGROUND_PRESET_SWATCHES[key] }}
                title={BACKGROUND_PRESET_LABELS[key]}
                onClick={() => onPresetChange(key)}
                aria-label={BACKGROUND_PRESET_LABELS[key]}
              />
            ))}
          </div>
          <Form.Text muted>Selected: {BACKGROUND_PRESET_LABELS[preset as BackgroundPresetKey] ?? preset}</Form.Text>
        </Form.Group>
      ) : null}
      {mode === "custom" ? (
        <Form.Group className="mb-2">
          <Form.Label>Upload image</Form.Label>
          <Form.Control
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleFile((e.target as HTMLInputElement).files)}
          />
          {customImage ? (
            <div className="bg-custom-preview-wrap mt-2">
              <img src={customImage} alt="Custom background preview" className="bg-custom-preview" />
              <button type="button" className="btn btn-link btn-sm text-danger p-0 mt-1" onClick={() => onCustomImageChange("")}>
                Remove image
              </button>
            </div>
          ) : null}
        </Form.Group>
      ) : null}
      {uploadHint ? (
        <Alert variant={uploadHint.includes("Could not") || uploadHint.includes("too large") ? "warning" : "info"} className="py-2 mb-0">
          {uploadHint}
        </Alert>
      ) : null}
    </div>
  );
}
