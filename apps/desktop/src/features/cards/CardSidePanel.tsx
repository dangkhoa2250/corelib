import { useState, useEffect } from "react";
import type { Deck, CardBrowserRow } from "../../domain/learning";
import { createCard, updateAndMoveCard } from "../../lib/learning";
import { detectLanguage } from "../../lib/languageDetector";
import { LanguagePicker } from "./LanguagePicker";
import { Combobox } from "../../components/Combobox";

export interface CardSidePanelProps {
  card: CardBrowserRow | null;
  decks: Deck[];
  onClose: () => void;
  onSaveSuccess: () => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  createCard?: typeof createCard;
  updateAndMoveCard?: typeof updateAndMoveCard;
}

export function CardSidePanel({
  card,
  decks,
  onClose,
  onSaveSuccess,
  onDirtyStateChange,
  createCard: customCreate = createCard,
  updateAndMoveCard: customUpdateAndMove = updateAndMoveCard,
}: CardSidePanelProps) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tags, setTags] = useState("");
  const [deckId, setDeckId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frontLanguage, setFrontLanguage] = useState<string | null>(null);
  const [isManualLanguage, setIsManualLanguage] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);

  useEffect(() => {
    if (card) {
      setFront(card.front);
      setBack(card.back);
      setTags(card.tags.join(", "));
      setDeckId(card.deckId ?? decks[0]?.id ?? "");
      setError(null);
      setFrontLanguage(card.frontLanguage ?? null);
      setIsManualLanguage(!!card.frontLanguage);
      setDetectedLanguage(detectLanguage(card.front));
    }
  }, [card, decks]);

  const handleFrontChange = (text: string) => {
    setFront(text);
    if (!isManualLanguage) {
      const lang = detectLanguage(text);
      setDetectedLanguage(lang);
      setFrontLanguage(lang);
    }
  };

  const handleLanguageChange = (lang: string | null) => {
    setFrontLanguage(lang);
    setIsManualLanguage(true);
  };

  const isDirty =
    !card
      ? false
      : front !== (card.front ?? "") ||
        back !== (card.back ?? "") ||
        tags !== (card.tags.join(", ") ?? "") ||
        deckId !== (card.deckId ?? decks[0]?.id ?? "") ||
        frontLanguage !== (card.frontLanguage ?? null);

  // Notify parent of dirty changes
  useEffect(() => {
    onDirtyStateChange?.(isDirty);
    return () => {
      onDirtyStateChange?.(false);
    };
  }, [isDirty, onDirtyStateChange]);

  const handleClose = () => {
    if (isDirty) {
      if (!window.confirm("You have unsaved changes. Discard changes?")) {
        return;
      }
    }
    onClose();
  };

  if (!card) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim()) {
      setError("Front is required");
      return;
    }
    if (!back.trim()) {
      setError("Back is required");
      return;
    }
    if (!deckId) {
      setError("Deck is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const tagList = tags
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);

      if (card.id) {
        // Edit mode: update content + optional deck move in one atomic operation.
        await customUpdateAndMove({
          cardId: card.id,
          front,
          back,
          tags: tagList,
          destinationDeckId: deckId !== card.deckId ? deckId : null,
          frontLanguage,
        });
      } else {
        // Create mode
        const deck = decks.find(d => d.id === deckId);
        const deckName = deck ? deck.name : "";
        await customCreate({
          deckName,
          front,
          back,
          tags: tagList,
          frontLanguage,
        });
      }
      onSaveSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const isNewCard = !card.id;

  return (
    <div className="card-side-panel" role="dialog" aria-label={isNewCard ? "Add Card" : "Edit Card"}>
      <div className="card-side-panel__backdrop" onClick={handleClose} />
      <div className="card-side-panel__content">
        <div className="card-side-panel__header">
          <h2 className="card-side-panel__title">{isNewCard ? "Add Card" : "Edit Card"}</h2>
          <button className="card-side-panel__close-btn" type="button" onClick={handleClose}>
            ✕
          </button>
        </div>

        <form className="card-side-panel__form" onSubmit={handleSave}>
          {error && (
            <div className="card-side-panel__error" role="alert">
              {error}
            </div>
          )}

          <div className="card-side-panel__field">
            <label className="card-side-panel__label">Deck</label>
            <Combobox
              value={deckId}
              onChange={(v) => setDeckId(v)}
              options={decks.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              disabled={saving}
              ariaLabel="Deck"
            />
          </div>

          <div className="card-side-panel__field">
            <label className="card-side-panel__label">Front</label>
            <textarea
              className="card-side-panel__textarea"
              rows={4}
              value={front}
              onChange={e => handleFrontChange(e.target.value)}
              placeholder="Card front content"
              aria-label="Front"
            />
          </div>

          <div className="card-side-panel__field">
            <label className="card-side-panel__label">Front Language</label>
            <LanguagePicker
              value={frontLanguage}
              onChange={handleLanguageChange}
              disabled={saving}
              detectedLanguage={detectedLanguage}
              isManual={isManualLanguage}
            />
          </div>

          <div className="card-side-panel__field">
            <label className="card-side-panel__label">Back</label>
            <textarea
              className="card-side-panel__textarea"
              rows={4}
              value={back}
              onChange={e => setBack(e.target.value)}
              placeholder="Card back content"
              aria-label="Back"
            />
          </div>

          <div className="card-side-panel__field">
            <label className="card-side-panel__label">Tags (comma-separated)</label>
            <input
              className="card-side-panel__input"
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. biology, exam1"
              aria-label="Tags"
            />
          </div>

          <div className="card-side-panel__actions">
            <button
              className="card-side-panel__btn-cancel"
              type="button"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="card-side-panel__btn-save"
              type="submit"
              disabled={saving}
            >
              {saving ? "Saving..." : isNewCard ? "Add Card" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
