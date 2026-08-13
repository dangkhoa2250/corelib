import { useRef } from "react";

export interface ToolbarColorControlProps {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (color: string) => void;
  variant: "text" | "highlight";
}

/**
 * Toolbar color control with a themed trigger. Clicking the trigger opens
 * the native color picker so the full system color grid stays available.
 */
export function ToolbarColorControl({
  label,
  value,
  disabled = false,
  onChange,
  variant,
}: ToolbarColorControlProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hexValue =
    value.startsWith("#") && value.length === 7
      ? value
      : variant === "text"
        ? "#1d1d1f"
        : "#ffff00";

  return (
    <div className="card-rich-text-editor__color-control-root">
      <button
        aria-label={label}
        className="card-rich-text-editor__color-trigger"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => inputRef.current?.click()}
        title={label}
        type="button"
      >
        {variant === "text" ? (
          <span className="card-rich-text-editor__color-glyph" style={{ color: value }}>
            A
            <span
              className="card-rich-text-editor__color-glyph-bar"
              style={{ background: value }}
            />
          </span>
        ) : (
          <span
            className="card-rich-text-editor__color-trigger-swatch"
            style={{ background: value }}
          />
        )}
      </button>
      <input
        ref={inputRef}
        aria-label={`${label} picker`}
        className="card-rich-text-editor__color-native-input"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={hexValue}
      />
    </div>
  );
}
