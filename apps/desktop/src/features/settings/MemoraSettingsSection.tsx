import { useEffect, useState } from "react";

import type { MemoraSettings } from "../../domain/learning";

interface MemoraSettingsSectionProps {
  load: () => Promise<MemoraSettings>;
  save: (settings: MemoraSettings) => Promise<MemoraSettings>;
}

const DEFAULT_NEW_CARDS = 20;
const DEFAULT_RETENTION_PERCENT = 90;

function parseInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number.parseInt(value.trim(), 10);
}

export function MemoraSettingsSection({ load, save }: MemoraSettingsSectionProps) {
  const [newCards, setNewCards] = useState("");
  const [retentionPercent, setRetentionPercent] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((settings) => {
        if (cancelled) return;
        setNewCards(String(settings.newCardsPerDay));
        setRetentionPercent(String(Math.round(settings.desiredRetention * 100)));
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const newCardsValue = parseInteger(newCards);
  const retentionValue = parseInteger(retentionPercent);
  const newCardsValid = newCardsValue !== null && newCardsValue >= 0 && newCardsValue <= 999;
  const retentionValid = retentionValue !== null && retentionValue >= 80 && retentionValue <= 97;
  const canSave = newCardsValid && retentionValid && !saving;

  const handleSave = async () => {
    if (!newCardsValid || !retentionValid) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await save({
        newCardsPerDay: newCardsValue,
        desiredRetention: retentionValue / 100,
      });
      setSuccess(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    setNewCards(String(DEFAULT_NEW_CARDS));
    setRetentionPercent(String(DEFAULT_RETENTION_PERCENT));
    setSuccess(false);
    setError(null);
  };

  return (
    <section className="settings-page__section" aria-labelledby="memora-heading">
      <div className="settings-page__section-heading">
        <div>
          <h2 id="memora-heading">Memora</h2>
          <p>Set how many new cards Memora introduces each day.</p>
        </div>
      </div>

      <label className="settings-page__field">
        <span>New cards per day</span>
        <span className="settings-page__number-row">
          <input
            aria-label="New cards per day"
            inputMode="numeric"
            max={999}
            min={0}
            onChange={(event) => {
              setNewCards(event.target.value);
              setSuccess(false);
            }}
            type="number"
            value={newCards}
          />
        </span>
      </label>

      <button
        aria-expanded={advancedOpen}
        className="settings-page__disclosure"
        onClick={() => setAdvancedOpen((open) => !open)}
        type="button"
      >
        Advanced
      </button>

      {advancedOpen ? (
        <>
          <label className="settings-page__field">
            <span>Desired retention</span>
            <span className="settings-page__number-row">
              <input
                aria-label="Desired retention"
                inputMode="numeric"
                max={97}
                min={80}
                onChange={(event) => {
                  setRetentionPercent(event.target.value);
                  setSuccess(false);
                }}
                type="number"
                value={retentionPercent}
              />
              <span className="settings-page__number-suffix">%</span>
            </span>
          </label>

          <dl className="settings-page__policy">
            <div className="settings-page__policy-row">
              <dt>Learning steps</dt>
              <dd>1 minute → 10 minutes</dd>
            </div>
            <div className="settings-page__policy-row">
              <dt>Relearning step</dt>
              <dd>10 minutes</dd>
            </div>
          </dl>
        </>
      ) : null}

      <div className="settings-page__actions">
        <button disabled={!canSave} onClick={() => void handleSave()} type="button">
          {saving ? "Saving…" : "Save Memora settings"}
        </button>
        <button
          className="settings-page__secondary-button"
          onClick={handleRestoreDefaults}
          type="button"
        >
          Restore defaults
        </button>
      </div>

      {error ? (
        <p className="settings-page__error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className="settings-page__success">Saved.</p> : null}
    </section>
  );
}
