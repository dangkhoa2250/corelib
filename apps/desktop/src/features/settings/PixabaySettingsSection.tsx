import { useEffect, useState } from "react";

interface PixabaySettingsSectionProps {
  check: () => Promise<boolean>;
  save: (key: string) => Promise<void>;
  remove: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Pixabay API key management. The key lives in the OS keychain through the
 * Tauri bridge and is never written to localStorage or embedded in cards.
 */
export function PixabaySettingsSection({ check, save, remove }: PixabaySettingsSectionProps) {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void check()
      .then((stored) => {
        if (!cancelled) setHasKey(stored);
      })
      .catch((checkError) => {
        if (!cancelled) setError(errorMessage(checkError));
      });
    return () => {
      cancelled = true;
    };
  }, [check]);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await save(trimmed);
      setHasKey(true);
      setKey("");
      setSuccess(true);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await remove();
      setHasKey(false);
      setSuccess(true);
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-page__section" aria-labelledby="pixabay-heading">
      <div className="settings-page__section-heading">
        <div>
          <h2 id="pixabay-heading">Media</h2>
          <p>Add a Pixabay API key to search stock images when making flashcards.</p>
        </div>
      </div>

      <label className="settings-page__field">
        <span>Pixabay API key</span>
        <span className="settings-page__secret-input">
          <input
            aria-label="Pixabay API key"
            autoComplete="off"
            onChange={(event) => {
              setKey(event.target.value);
              setSuccess(false);
            }}
            placeholder={hasKey ? "••••••••••••••••" : "Enter Pixabay API key"}
            style={{ color: "var(--text-primary)" }}
            type="password"
            value={key}
          />
        </span>
      </label>

      <div className="settings-page__actions">
        <button
          disabled={saving || !key.trim()}
          onClick={() => void handleSave()}
          type="button"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {hasKey ? (
          <button
            className="settings-page__secondary-button"
            disabled={saving}
            onClick={() => void handleRemove()}
            type="button"
          >
            Remove
          </button>
        ) : null}
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
