import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import { CameraDevice } from "../types";

interface CameraSourceProps {
  devices: CameraDevice[];
  value: string;
  onChange: (value: string) => void;
  error: string;
  onRetry?: () => void;
}

const isMacOs =
  typeof navigator !== "undefined" &&
  (/Mac|iPhone|iPod|iPad/i.test(navigator.platform || "") || /Mac OS X/.test(navigator.userAgent));

export default function CameraSource({ devices, value, onChange, error, onRetry }: CameraSourceProps) {
  const [macBusy, setMacBusy] = useState(false);
  const hasElectronInvoke = typeof window.electronAPI?.invoke === "function";

  const requestMacAccess = async () => {
    if (!hasElectronInvoke) {
      return;
    }
    setMacBusy(true);
    try {
      const result = await window.electronAPI!.invoke("request-macos-camera-access");
      if (!result.granted && result.camera === "denied") {
        // User must flip the switch in System Settings.
      }
      onRetry?.();
    } finally {
      setMacBusy(false);
    }
  };

  return (
    <div className="panel-block">
      <h5>Camera Source</h5>
      <p className="panel-help">Choose your physical or virtual camera input.</p>

      {isMacOs ? (
        <Alert variant="info" className="py-2 small camera-mac-hint">
          <strong>macOS 摄像头权限说明 / Camera on macOS</strong>
          <p className="mb-2 mt-2">
            系统<strong>不能</strong>让您手动“添加”应用到摄像头列表。请先点击下方按钮或启动应用时允许弹窗；之后再到
            <strong> 系统设置 → 隐私与安全性 → 摄像头 </strong>
            中打开 <strong>TableCam</strong>（若用终端开发运行则为 <strong>Electron</strong>）。
          </p>
          <p className="mb-0">
            You cannot manually add apps to the Camera list. Trigger the permission prompt first (button below or when the
            app starts), then enable <strong>TableCam</strong> under <strong>System Settings → Privacy &amp; Security →
            Camera</strong> (or <strong>Electron</strong> when developing from the terminal).
          </p>
        </Alert>
      ) : null}

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="d-flex flex-wrap gap-2 mb-2">
        {isMacOs && hasElectronInvoke ? (
          <Button type="button" variant="outline-info" size="sm" disabled={macBusy} onClick={() => void requestMacAccess()}>
            {macBusy ? "Requesting…" : "Request camera permission (macOS)"}
          </Button>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="outline-secondary" size="sm" onClick={onRetry}>
            Retry camera list
          </Button>
        ) : null}
      </div>

      <Form.Select value={value} onChange={(event) => onChange(event.target.value)} disabled={devices.length === 0}>
        {devices.map((device, index) => (
          <option key={device.deviceId || `device-${index}`} value={device.deviceId}>
            {device.label || `Camera ${index + 1}`}
          </option>
        ))}
      </Form.Select>
    </div>
  );
}
