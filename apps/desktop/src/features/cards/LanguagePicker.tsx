import { useMemo } from "react";
import { SUPPORTED_LANGUAGES } from "../../domain/learning";
import { Combobox, type ComboboxOption } from "../../components/Combobox";

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
  const options: ComboboxOption<string>[] = useMemo(
    () =>
      Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
        value: code,
        label: name,
      })),
    [],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <Combobox
        value={value}
        onChange={(v) => onChange(v)}
        options={options}
        placeholder="-- Choose Front Language --"
        searchPlaceholder="Search languages..."
        noOptionsMessage="No languages match"
        disabled={disabled}
      />
      {!value && (
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          Choose a front language to enable YouGlish lookup.
        </span>
      )}
      {value && !isManual && detectedLanguage && (
        <span style={{ fontSize: "11px", color: "var(--link)", fontWeight: 500 }}>
          Auto-detected: {SUPPORTED_LANGUAGES[detectedLanguage] ?? detectedLanguage}
        </span>
      )}
    </div>
  );
}
