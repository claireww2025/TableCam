import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { useRecording, type AspectPreset, type RecordMode, type RecordingFormat } from "../contexts/RecordingContext";

export default function ScreenRecorder() {
  const {
    mode,
    setMode,
    aspect,
    setAspect,
    format,
    setFormat,
    micEnabled,
    setMicEnabled,
    pipEnabled,
    setPipEnabled,
    sessionActive,
    checking,
    preflightItems,
    preflightGuide,
    regionOverlay,
    outputResolution,
    runPreflight,
    handleChooseDesktop,
    status,
    error
  } = useRecording();

  return (
    <div className="panel-block">
      <h5>Screen Recording</h5>
      <p className="panel-help">
        Record a selected desktop region with common aspect ratios, or record camera-only video. Use the red circle and
        square in the left bar to start/pause and stop.
      </p>

      <Form.Group className="mb-2">
        <Form.Label>Recording Source</Form.Label>
        <Form.Select value={mode} onChange={(e) => setMode(e.target.value as RecordMode)} disabled={sessionActive}>
          <option value="screen">Desktop area</option>
          <option value="camera">Camera only</option>
        </Form.Select>
      </Form.Group>
      <Form.Group className="mb-2">
        <Form.Label>Format</Form.Label>
        <Form.Select
          value={format}
          onChange={(e) => setFormat(e.target.value as RecordingFormat)}
          disabled={sessionActive}
        >
          <option value="mov">MOV (default)</option>
          <option value="auto">Auto (best available)</option>
          <option value="mp4">MP4 (H.264)</option>
          <option value="webm-vp9">WebM (VP9)</option>
          <option value="webm-vp8">WebM (VP8)</option>
          <option value="webm">WebM (generic)</option>
        </Form.Select>
      </Form.Group>

      {mode === "screen" ? (
        <>
          <div className="d-flex gap-2 mb-2">
            <Button variant="outline-light" size="sm" onClick={handleChooseDesktop} disabled={sessionActive}>
              Select Desktop Source
            </Button>
            <Form.Select
              value={aspect}
              onChange={(e) => setAspect(e.target.value as AspectPreset)}
              disabled={sessionActive}
              size="sm"
            >
              <option value="free">Free</option>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </Form.Select>
          </div>
          <div className="d-flex gap-2 mb-2 flex-wrap">
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => window.electronAPI?.send("open-region-selector", aspect)}
              disabled={sessionActive}
            >
              Draw Red Rectangle On Desktop
            </Button>
            {regionOverlay !== "idle" ? (
              <Button
                variant="outline-warning"
                size="sm"
                onClick={() => window.electronAPI?.send("cancel-region-selector")}
                disabled={sessionActive}
              >
                Cancel desktop overlay
              </Button>
            ) : null}
          </div>
          {regionOverlay === "passive" ? (
            <small className="text-secondary d-block mb-2">
              Red frame is on screen. Start recording when ready, or cancel to remove the overlay without recording.
            </small>
          ) : null}
          <Form.Check
            className="mb-2"
            type="switch"
            id="rec-mic"
            label="Include microphone audio"
            checked={micEnabled}
            disabled={sessionActive}
            onChange={(e) => setMicEnabled(e.target.checked)}
          />
          <Form.Check
            className="mb-2"
            type="switch"
            id="rec-pip"
            label="Overlay floating camera in corner (PIP)"
            checked={pipEnabled}
            disabled={sessionActive}
            onChange={(e) => setPipEnabled(e.target.checked)}
          />
          <small className="text-secondary d-block mt-2">
            Use &quot;Draw Red Rectangle On Desktop&quot; to choose area ({aspect}), output:{" "}
            {aspect === "free" ? "dynamic from selected region" : `${outputResolution.w} x ${outputResolution.h}`}
          </small>
        </>
      ) : (
        <small className="text-secondary d-block mb-2">
          Camera-only mode records your selected camera feed as a standalone video.
        </small>
      )}

      <div className="d-flex gap-2 mt-3">
        <Button variant="outline-info" size="sm" onClick={runPreflight} disabled={sessionActive || checking}>
          {checking ? "Checking..." : "Preflight Check"}
        </Button>
      </div>

      {preflightItems.length > 0 ? (
        <div className="record-preflight mt-2">
          {preflightItems.map((item) => (
            <div key={item.label} className={`record-preflight-item ${item.ok ? "ok" : "bad"}`}>
              <strong>{item.ok ? "PASS" : "FAIL"}</strong> {item.label}: {item.detail}
            </div>
          ))}
          {preflightGuide.length > 0 ? (
            <div className="record-preflight-guide">
              <strong>Setup guidance:</strong>
              <ul>
                {preflightGuide.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <small className="text-secondary d-block mt-2">{status}</small>
      {error ? (
        <Alert variant="warning" className="mt-2 mb-0 py-2">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
