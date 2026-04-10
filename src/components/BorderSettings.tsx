import Form from "react-bootstrap/Form";

interface BorderSettingsProps {
  enabled: boolean;
  color: string;
  onEnabledChange: (enabled: boolean) => void;
  onColorChange: (color: string) => void;
}

export default function BorderSettings({
  enabled,
  color,
  onEnabledChange,
  onColorChange
}: BorderSettingsProps) {
  return (
    <div className="panel-block">
      <h5>Border</h5>
      <p className="panel-help">Show or hide border and customize the border color.</p>
      <Form.Check
        type="switch"
        id="border-switch"
        label="Enable Border"
        checked={enabled}
        onChange={(event) => onEnabledChange(event.target.checked)}
      />
      <div className="color-row">
        <span>Border Color</span>
        <input
          type="color"
          value={color}
          onChange={(event) => onColorChange(event.target.value)}
          disabled={!enabled}
        />
      </div>
    </div>
  );
}
