import { SUPPORTED_LANGUAGES } from "../../domain/learning";

interface LanguagePickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  detectedLanguage?: string | null;
  isManual?: boolean;
}

export function LanguagePicker({
  value,
  onChange,
  disabled = false,
  detectedLanguage,
  isManual = false,
}: LanguagePickerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <select
        aria-label="Front Language"
        value={value ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === "" ? null : val);
        }}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "8px 12px",
          fontSize: "14px",
          border: "1px solid var(--color-border-strong, #ccc)",
          borderRadius: "8px",
          background: "var(--color-input-bg, #fff)",
          color: "var(--color-text-primary, #000)",
          outline: "none",
        }}
      >
        <option value="">-- Choose Front Language --</option>
        {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
      {!value && (
        <span style={{ fontSize: "12px", color: "var(--color-text-tertiary, #666)" }}>
          Choose a front language to enable YouGlish lookup.
        </span>
      )}
      {value && !isManual && detectedLanguage && (
        <span style={{ fontSize: "11px", color: "#007aff", fontWeight: 500 }}>
          Auto-detected: {SUPPORTED_LANGUAGES[detectedLanguage] ?? detectedLanguage}
        </span>
      )}
    </div>
  );
}
