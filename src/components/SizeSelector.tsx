import Form from "react-bootstrap/Form";
import { SizeType } from "../types";

interface SizeSelectorProps {
  value: SizeType;
  onChange: (value: SizeType) => void;
}

const sizeOptions: Array<{ value: SizeType; label: string; px: number }> = [
  { value: "small", label: "Small", px: 160 },
  { value: "medium", label: "Medium", px: 240 },
  { value: "large", label: "Large", px: 320 },
  { value: "xlarge", label: "XLarge", px: 400 }
];

export default function SizeSelector({ value, onChange }: SizeSelectorProps) {
  return (
    <div className="panel-block">
      <h5>Size</h5>
      <p className="panel-help">Resize the floating window dimensions.</p>
      <div className="size-options">
        {sizeOptions.map((option) => (
          <label key={option.value} className={`size-chip ${value === option.value ? "active" : ""}`}>
            <input
              type="radio"
              name="camera-size"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label} ({option.px}px)
          </label>
        ))}
      </div>
      <Form.Range
        min={0}
        max={sizeOptions.length - 1}
        value={sizeOptions.findIndex((option) => option.value === value)}
        onChange={(event) => onChange(sizeOptions[Number(event.target.value)].value)}
      />
    </div>
  );
}
