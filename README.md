# TableCam

TableCam is a desktop camera utility built with Electron + React.  
It provides a floating camera overlay (always on top) and a practical screen recording workflow for demos, tutorials, and remote presentations.

---

## Download

- Latest macOS zip package: [TableCam Releases](https://github.com/claireww2025/TableCam/releases)
- Direct download (current): [TableCam-v0.3.0-darwin-x64.zip](https://github.com/claireww2025/TableCam/releases/latest/download/TableCam-v0.3.0-darwin-x64.zip)
- Current release file name: `TableCam-v0.3.0-darwin-x64.zip`

> **Platform note:** The packaged app currently supports **macOS only**.  
> Windows and Linux builds are not officially supported in this repository yet.

---

## Why TableCam

Many screen recording tools either hide camera controls behind complex menus or make the overlay hard to manage while presenting.  
TableCam is designed around quick operation:

- Keep the camera overlay visible above other windows
- Configure appearance from a compact settings panel
- Start, pause, resume, and stop recording from icon-only controls
- Save recordings through a native system Save dialog

---

## Core Features

### Floating Camera Window

- Frameless overlay window
- Always-on-top behavior
- Works independently from the settings window
- Fast show/hide support via controls and shortcuts

### Camera Appearance Controls

- Shape presets (circle, rounded, square, etc.)
- Multiple size presets
- Visual filters (grayscale, sepia, blur, contrast, etc.)
- Optional border and custom border color

### Virtual Background

- `none`, `blur`, `preset`, and `custom image` modes
- Person segmentation powered by MediaPipe image segmentation
- Preserves style filter rendering on the subject layer

### Recording Workflow

- Screen recording with selectable region
- Aspect presets (`free`, `16:9`, `9:16`, `4:3`, `3:4`)
- Optional microphone capture
- Optional camera picture-in-picture (PiP)
- Recording controls on the left rail:
  - red circle = start / pause / resume
  - square = stop
  - live timer = elapsed recording time

### Save-on-Stop

When recording stops, TableCam opens a native Save dialog automatically.  
You choose filename and destination before final output is written.

---

## Platform Requirements

- macOS (primary target in current packaging flow)
- Node.js 18+ recommended
- npm 9+ recommended

> The codebase is cross-platform aware (Electron), but release packaging in this project is currently focused on macOS zip output.

---

## Installation (Development)

```bash
npm install
```

---

## Running Locally

Start the app in development mode:

```bash
npm run desktop
```

This command:
1. Builds the React renderer (`build/`)
2. Compiles Electron entry scripts from `public/*.ts` into `public/*.js`
3. Launches Electron

---

## How to Use TableCam

### 1) Configure Camera Overlay

1. Open the settings window
2. Select camera source
3. Adjust shape, size, filter, border, and background
4. Click **Show overlay** if hidden

### 2) Screen Recording

1. Go to the **Record** panel
2. Choose recording mode:
   - `Desktop area` (screen capture)
   - `Camera only`
3. (Desktop mode) choose source/region and aspect
4. Optional:
   - enable microphone
   - enable camera PiP
5. Use left rail controls:
   - red circle to start
   - red circle again to pause/resume
   - square to stop
6. On stop, choose output path in Save dialog

### 3) Output Format

Available format options include `mov`, `mp4`, and `webm` variants.  
When conversion is required, ffmpeg integration is used when available.

---

## Build and Packaging

### Build renderer

```bash
npm run build
```

### Build Electron scripts

```bash
npm run build:electron
```

### Type-check project

```bash
npx tsc --noEmit
```

### Create distributables

```bash
npm run make
```

### Create zip release and copy to `release/`

```bash
npm run release:zip
```

---

## Permissions (macOS)

TableCam may request:

- **Camera** (overlay preview and PiP)
- **Microphone** (optional audio recording)
- **Screen Recording** (desktop capture)

Grant them in:

`System Settings -> Privacy & Security`

If permissions were denied earlier, enable them manually and restart the app.

---

## Project Structure

- `src/` - React UI, contexts, components, styling
- `public/main.ts` - Electron main process (window lifecycle, IPC, file save)
- `public/preload.ts` - secure IPC bridge API
- `scripts/` - helper scripts (e.g., release zip copy)
- `forge.config.js` - Electron Forge packaging config

---

## Troubleshooting

### Camera not visible

- Verify camera permission in system settings
- Confirm valid camera device selected in settings panel
- Use **Show overlay** to re-open hidden float window

### No screen capture

- Grant Screen Recording permission
- Re-select desktop source/region
- Restart app after changing permission settings

### Save dialog does not appear after stop

- Ensure you are using the latest packaged build
- Check that recording actually reached `stop` (square button)
- Verify app is not blocked by system modal dialogs

### Format conversion failed

- Try `mov` or `webm` first
- Keep source recording and retry export format

---

## Contributing

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening issues or pull requests.

---

## License

MIT License. See [`LICENSE`](./LICENSE).

