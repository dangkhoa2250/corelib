const PRESETS = [
  "#3778d4",
  "#e84c3d",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#95a5a6",
];

interface StatisticsColorPickerProps {
  baseColor: string;
  onChange(baseColor: string): void;
}

export function StatisticsColorPicker({
  baseColor,
  onChange,
}: StatisticsColorPickerProps) {
  return (
    <div className="statistics-color-picker">
      <span className="statistics-color-picker__label">Chart color</span>
      <div className="statistics-color-picker__swatches">
        {PRESETS.map((color) => {
          const isSelected = baseColor.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              className="statistics-color-picker__swatch"
              aria-label={`Set chart color to ${color}`}
              aria-pressed={isSelected}
              style={{ backgroundColor: color }}
              onClick={() => onChange(color)}
            />
          );
        })}
        <label className="statistics-color-picker__custom">
          <span className="sr-only">Custom chart color</span>
          <input
            aria-label="Custom chart color"
            type="color"
            value={baseColor}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
