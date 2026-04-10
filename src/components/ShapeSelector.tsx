import Form from "react-bootstrap/Form";
import { ShapeType } from "../types";

interface ShapeSelectorProps {
  value: ShapeType;
  onChange: (value: ShapeType) => void;
}

const shapeOptions: Array<{ value: ShapeType; label: string }> = [
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded Square" },
  { value: "heart", label: "Heart" },
  { value: "star", label: "Star" },
  { value: "diamond", label: "Diamond" },
  { value: "hexagon", label: "Hexagon" },
  { value: "triangle", label: "Triangle" }
];

export default function ShapeSelector({ value, onChange }: ShapeSelectorProps) {
  return (
    <div className="panel-block">
      <h5>Shape</h5>
      <p className="panel-help">Set the visual mask style for the floating camera frame.</p>
      <Form.Select value={value} onChange={(event) => onChange(event.target.value as ShapeType)}>
        {shapeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Form.Select>
    </div>
  );
}
