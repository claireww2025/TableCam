import Form from "react-bootstrap/Form";
import { FilterType } from "../types";

interface FilterSelectorProps {
  value: FilterType;
  onChange: (value: FilterType) => void;
}

const filterOptions: Array<{ value: FilterType; label: string }> = [
  { value: "none", label: "None" },
  { value: "grayscale", label: "Grayscale" },
  { value: "sepia", label: "Sepia" },
  { value: "invert", label: "Invert" },
  { value: "blur", label: "Blur" },
  { value: "brightness", label: "Brightness" },
  { value: "contrast", label: "Contrast" }
];

export default function FilterSelector({ value, onChange }: FilterSelectorProps) {
  return (
    <div className="panel-block">
      <h5>Filter</h5>
      <p className="panel-help">Apply CSS filter effects to the live preview.</p>
      <Form.Select value={value} onChange={(event) => onChange(event.target.value as FilterType)}>
        {filterOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Form.Select>
    </div>
  );
}
