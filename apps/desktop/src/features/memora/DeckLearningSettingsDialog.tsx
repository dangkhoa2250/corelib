import { useId, useState } from "react";

import type { DeckLearningSettings } from "../../domain/learning";

interface DeckLearningSettingsDialogProps {
  deckName: string;
  settings: DeckLearningSettings;
  onSave: (newCardsPerDay: number | null) => Promise<DeckLearningSettings>;
  onCancel: () => void;
}

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number.parseInt(value.trim(), 10);
}

export function DeckLearningSettingsDialog({ deckName, settings, onSave, onCancel }: DeckLearningSettingsDialogProps) {
  const headingId = useId();
  const [useCustom, setUseCustom] = useState(settings.newCardsPerDay !== null);
  const [customValue, setCustomValue] = useState(
    settings.newCardsPerDay !== null ? String(settings.newCardsPerDay) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customNumber = parseInteger(customValue);
  const customValid = customNumber !== null && customNumber >= 0 && customNumber <= 999;
  const canSave = !saving && (!useCustom || customValid);

  const handleSave = async () => {
    if (useCustom && !customValid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(useCustom ? customNumber : null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="deck-learning-dialog__backdrop" aria-modal="true" role="dialog" aria-labelledby={headingId}>
      <div className="deck-learning-dialog">
        <div className="deck-learning-dialog__header">
          <h2 id={headingId}>Learning settings for {deckName}</h2>
          <button
            aria-label="Close learning settings"
            className="deck-learning-dialog__close"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </div>

        <fieldset className="deck-learning-dialog__options">
          <label className="deck-learning-dialog__option">
            <input
              aria-label="Use Memora default"
              checked={!useCustom}
              name="deck-learning-mode"
              onChange={() => setUseCustom(false)}
              type="radio"
            />
            <span>Use Memora default ({settings.inheritedNewCardsPerDay}/day)</span>
          </label>
          <label className="deck-learning-dialog__option">
            <input
              checked={useCustom}
              name="deck-learning-mode"
              onChange={() => setUseCustom(true)}
              type="radio"
            />
            <span>Custom limit</span>
          </label>
        </fieldset>

        <label className="deck-learning-dialog__field">
          <span>Custom new cards per day</span>
          <input
            aria-label="Custom new cards per day"
            disabled={!useCustom}
            inputMode="numeric"
            max={999}
            min={0}
            onChange={(event) => setCustomValue(event.target.value)}
            type="number"
            value={customValue}
          />
        </label>

        <div className="deck-learning-dialog__actions">
          <button disabled={!canSave} onClick={() => void handleSave()} type="button">
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className="deck-learning-dialog__secondary"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>

        {error ? (
          <p className="deck-learning-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
