import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { useEffect, useRef, useState } from "react";
import {
  useRecording,
  type AspectPreset,
  type RecordMode,
  type RecordingAudioSource,
  type RecordingFormat
} from "../contexts/RecordingContext";

export default function ScreenRecorder() {
  const {
    mode,
    setMode,
    aspect,
    setAspect,
    format,
    setFormat,
    audioSource,
    setAudioSource,
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
  const [micLevel, setMicLevel] = useState(0);
  const [micMeterError, setMicMeterError] = useState("");
  const [micTestBusy, setMicTestBusy] = useState(false);
  const [micTestError, setMicTestError] = useState("");
  const [micTestUrl, setMicTestUrl] = useState("");
  const [micPermission, setMicPermission] = useState<string>("");
  const [micPermissionBusy, setMicPermissionBusy] = useState(false);
  const meterRafRef = useRef<number | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const meterGainRef = useRef<GainNode | null>(null);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const meterAnalyserRef = useRef<AnalyserNode | null>(null);
  const stopMeterRef = useRef<() => void>(() => undefined);

  const showDesktopControls = mode === "region" || mode === "both";
  const canUseSystemAudio = showDesktopControls;
  const includesMicAudio = audioSource === "mic" || audioSource === "both" || (!canUseSystemAudio && audioSource === "system");
  const isMac = /Mac|iPhone|iPod|iPad/i.test(navigator.platform || "");

  const acquireMicStream = async (): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
    } catch {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  };

  useEffect(() => {
    const stopMeter = () => {
      if (meterRafRef.current) {
        window.cancelAnimationFrame(meterRafRef.current);
        meterRafRef.current = null;
      }
      meterAnalyserRef.current = null;
      meterGainRef.current = null;
      meterStreamRef.current?.getTracks().forEach((track) => track.stop());
      meterStreamRef.current = null;
      const ctx = meterContextRef.current;
      meterContextRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => undefined);
      }
      setMicLevel(0);
    };
    stopMeterRef.current = stopMeter;

    const startMeter = async () => {
      if (!includesMicAudio || sessionActive) {
        setMicMeterError("");
        stopMeter();
        return;
      }
      try {
        const stream = await acquireMicStream();
        const Ctx =
          window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) {
          setMicMeterError("Microphone meter is unavailable in this runtime.");
          stopMeter();
          return;
        }
        const ctx = new Ctx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        analyser.fftSize = 1024;
        src.connect(analyser);
        analyser.connect(gain);
        gain.connect(ctx.destination);
        await ctx.resume().catch(() => undefined);
        meterContextRef.current = ctx;
        meterStreamRef.current = stream;
        meterAnalyserRef.current = analyser;
        meterGainRef.current = gain;
        setMicMeterError("");

        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          const node = meterAnalyserRef.current;
          if (!node) {
            return;
          }
          node.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) {
            const centered = (data[i] - 128) / 128;
            sum += centered * centered;
          }
          const rms = Math.sqrt(sum / data.length);
          const normalized = Math.min(100, Math.max(0, Math.round(rms * 220)));
          setMicLevel((prev) => Math.max(Math.round(prev * 0.65), normalized));
          meterRafRef.current = window.requestAnimationFrame(tick);
        };
        meterRafRef.current = window.requestAnimationFrame(tick);
      } catch {
        setMicMeterError("Cannot read microphone level. Check microphone permission.");
        stopMeter();
      }
    };

    void startMeter();
    return () => {
      stopMeter();
      stopMeterRef.current = () => undefined;
    };
  }, [includesMicAudio, sessionActive]);

  useEffect(() => {
    if (canUseSystemAudio) {
      return;
    }
    if (audioSource === "system" || audioSource === "both") {
      setAudioSource("mic");
    }
  }, [audioSource, canUseSystemAudio, setAudioSource]);

  const refreshMicPermission = async () => {
    if (!isMac || typeof window.electronAPI?.invoke !== "function") {
      return;
    }
    try {
      const p = await window.electronAPI.invoke("macos-microphone-access-status");
      setMicPermission(String(p?.microphone || ""));
    } catch {
      setMicPermission("");
    }
  };

  useEffect(() => {
    if (!includesMicAudio || sessionActive) {
      return;
    }
    void refreshMicPermission();
  }, [includesMicAudio, sessionActive]);

  const requestMicPermission = async () => {
    if (!isMac || typeof window.electronAPI?.invoke !== "function") {
      return;
    }
    setMicPermissionBusy(true);
    try {
      await window.electronAPI.invoke("request-macos-microphone-access");
      await refreshMicPermission();
    } finally {
      setMicPermissionBusy(false);
    }
  };

  useEffect(() => {
    const onStopMeter = () => stopMeterRef.current();
    window.addEventListener("tablecam-stop-mic-meter", onStopMeter);
    return () => window.removeEventListener("tablecam-stop-mic-meter", onStopMeter);
  }, []);

  useEffect(
    () => () => {
      if (micTestUrl) {
        URL.revokeObjectURL(micTestUrl);
      }
    },
    [micTestUrl]
  );

  const handleMicTest = async () => {
    if (sessionActive || micTestBusy) {
      return;
    }
    if (!includesMicAudio) {
      setMicTestError("Current audio source does not include microphone.");
      return;
    }
    setMicTestBusy(true);
    setMicTestError("");
    try {
      const sourceTrack = meterStreamRef.current?.getAudioTracks().find((t) => t.readyState === "live") || null;
      const localStream = sourceTrack
        ? new MediaStream([sourceTrack.clone()])
        : await acquireMicStream();

      const tinyCanvas = document.createElement("canvas");
      tinyCanvas.width = 2;
      tinyCanvas.height = 2;
      const tinyCtx = tinyCanvas.getContext("2d");
      if (tinyCtx) {
        tinyCtx.fillStyle = "#000";
        tinyCtx.fillRect(0, 0, tinyCanvas.width, tinyCanvas.height);
      }
      const tinyVideo = tinyCanvas.captureStream(1);
      const mergedTestStream = new MediaStream([
        ...tinyVideo.getVideoTracks(),
        ...localStream.getAudioTracks().map((track) => track.clone())
      ]);

      const candidateTypes = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
      const mimeType = candidateTypes.find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        localStream.getTracks().forEach((t) => t.stop());
        mergedTestStream.getTracks().forEach((t) => t.stop());
        throw new Error("NO_SUPPORTED_AUDIO_MIME");
      }

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(mergedTestStream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      await new Promise<void>((resolve) => {
        recorder.onstop = () => {
          localStream.getTracks().forEach((t) => t.stop());
          mergedTestStream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
          const nextUrl = URL.createObjectURL(blob);
          setMicTestUrl((prev) => {
            if (prev) {
              URL.revokeObjectURL(prev);
            }
            return nextUrl;
          });
          resolve();
        };
        recorder.start(120);
        window.setTimeout(() => {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, 2500);
      });
    } catch (e) {
      const err = e as Error | DOMException | undefined;
      if (err?.message === "NO_SUPPORTED_AUDIO_MIME") {
        setMicTestError("Audio test recording is not supported in this runtime.");
      } else {
        setMicTestError("Microphone test failed. Check microphone permission and retry.");
      }
    } finally {
      setMicTestBusy(false);
    }
  };

  return (
    <div className="panel-block">
      <h5>Screen Recording</h5>
      <p className="panel-help">
        Choose the red-frame desktop region, the camera feed, or both together. Optional microphone audio can be mixed
        into the recording. Use the red circle and square in the left bar to start or pause and stop.
      </p>

      <Form.Group className="mb-2">
        <Form.Label>Recording source</Form.Label>
        <Form.Select value={mode} onChange={(e) => setMode(e.target.value as RecordMode)} disabled={sessionActive}>
          <option value="region">Red frame region (desktop crop)</option>
          <option value="camera">Camera only</option>
          <option value="both">Red frame region + camera (picture-in-picture)</option>
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

      {showDesktopControls ? (
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
          {mode === "both" ? (
            <small className="text-secondary d-block mb-2">
              Camera appears in the corner over the cropped desktop. Pick the camera device in the Camera panel.
            </small>
          ) : null}
          <small className="text-secondary d-block mb-2">
            Use &quot;Draw Red Rectangle On Desktop&quot; to choose area ({aspect}), output:{" "}
            {aspect === "free" ? "dynamic from selected region" : `${outputResolution.w} x ${outputResolution.h}`}
          </small>
        </>
      ) : (
        <small className="text-secondary d-block mb-2">
          Camera-only mode records your selected camera feed. Pick the device in the Camera panel.
        </small>
      )}

      <Form.Group className="mb-2">
        <Form.Label>Audio source</Form.Label>
        <Form.Select
          value={audioSource}
          onChange={(e) => setAudioSource(e.target.value as RecordingAudioSource)}
          disabled={sessionActive}
        >
          {canUseSystemAudio ? (
            <>
              <option value="none">None</option>
              <option value="mic">Microphone only</option>
              <option value="system">System audio only</option>
              <option value="both">Microphone + system audio</option>
            </>
          ) : (
            <>
              <option value="none">None</option>
              <option value="mic">Microphone only</option>
            </>
          )}
        </Form.Select>
      </Form.Group>
      {!canUseSystemAudio ? (
        <small className="text-secondary d-block mb-2">
          Camera-only mode supports microphone audio, not system audio.
        </small>
      ) : null}
      {includesMicAudio && isMac ? (
        <div className="mb-2">
          <small className="text-secondary d-block">
            Microphone permission: <strong>{micPermission || "unknown"}</strong>
          </small>
          {micPermission !== "granted" ? (
            <Button
              variant="outline-warning"
              size="sm"
              className="mt-1"
              onClick={() => void requestMicPermission()}
              disabled={micPermissionBusy || sessionActive}
            >
              {micPermissionBusy ? "Requesting..." : "Request microphone permission (macOS)"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {includesMicAudio && !sessionActive ? (
        <div className="mb-2">
          <small className="text-secondary d-block mb-1">Microphone input level</small>
          <div className="progress" style={{ height: 8 }}>
            <div
              className={`progress-bar ${micLevel > 55 ? "bg-success" : "bg-info"}`}
              role="progressbar"
              style={{ width: `${micLevel}%`, transition: "width 80ms linear" }}
              aria-valuenow={micLevel}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          {micMeterError ? <small className="text-warning d-block mt-1">{micMeterError}</small> : null}
          <div className="d-flex gap-2 mt-2 align-items-center">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => void handleMicTest()}
              disabled={micTestBusy || sessionActive}
            >
              {micTestBusy ? "Testing..." : "Sound Test (2.5s)"}
            </Button>
            <small className="text-secondary">Speak now, then play the clip.</small>
          </div>
          {micTestError ? <small className="text-warning d-block mt-1">{micTestError}</small> : null}
          {micTestUrl ? (
            <audio controls src={micTestUrl} className="w-100 mt-2">
              <track kind="captions" />
            </audio>
          ) : null}
        </div>
      ) : null}

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
