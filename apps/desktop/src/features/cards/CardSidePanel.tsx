import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Deck, CardBrowserRow } from "../../domain/learning";
import { createCard, updateAndMoveCard } from "../../lib/learning";
import { detectLanguage } from "../../lib/languageDetector";
import { derivePlainText, type RichDocument } from "../../domain/richDocument";
import { LanguagePicker } from "./LanguagePicker";
import { Combobox } from "../../components/Combobox";
import {
  CardRichTextEditor,
  type CardRichTextEditorHandle,
} from "./CardRichTextEditor";
import { CardRichTextToolbar } from "./CardRichTextToolbar";

export interface CardSidePanelProps {
  card: CardBrowserRow | null;
  decks: Deck[];
  onClose: () => void;
  onSaveSuccess: () => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  createCard?: typeof createCard;
  updateAndMoveCard?: typeof updateAndMoveCard;
}

/** Builds a rich document from plain text, one paragraph per line. */
function paragraphDocFromText(text: string): RichDocument {
  const content = text.split("\n").map((line) => ({
    type: "paragraph" as const,
    content: line.length > 0 ? [{ type: "text" as const, text: line }] : [],
  }));
  return { type: "doc" as const, content };
}

/** Per-panel-session draft id; images staged under it survive a save retry. */
function createDraftId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const [frontDoc, setFrontDoc] = useState<RichDocument>(() =>
    paragraphDocFromText(card?.front ?? ""),
  );
  const [backDoc, setBackDoc] = useState<RichDocument>(() =>
    paragraphDocFromText(card?.back ?? ""),
  );
  const [tags, setTags] = useState("");
  const [deckId, setDeckId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frontLanguage, setFrontLanguage] = useState<string | null>(null);
  const [isManualLanguage, setIsManualLanguage] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [mediaDraftId] = useState(() => createDraftId());

  const frontEditorRef = useRef<CardRichTextEditorHandle | null>(null);
  const backEditorRef = useRef<CardRichTextEditorHandle | null>(null);
  const [focusedFace, setFocusedFace] = useState<"front" | "back" | null>(null);

  const activeEditor =
    focusedFace === "front"
      ? frontEditorRef.current?.getEditor() ?? null
      : focusedFace === "back"
        ? backEditorRef.current?.getEditor() ?? null
        : null;

  const handleFaceFocus = (face: "front" | "back") => (focused: boolean) => {
    if (focused) {
      setFocusedFace(face);
    } else {
      setTimeout(() => {
        const active = document.activeElement;
        const isOtherControl =
          active &&
          active !== document.body &&
          active !== document.documentElement &&
          active.closest('.card-rich-text-editor, [role="toolbar"]') == null;
        if (isOtherControl) {
          setFocusedFace((prev) => (prev === face ? null : prev));
        }
      }, 0);
    }
  };

  const frontText = derivePlainText(frontDoc);
  const backText = derivePlainText(backDoc);

  useEffect(() => {
    if (card) {
      setFrontDoc(card.frontDoc ?? paragraphDocFromText(card.front));
      setBackDoc(card.backDoc ?? paragraphDocFromText(card.back));
      setTags(card.tags.join(", "));
      setDeckId(card.deckId ?? decks[0]?.id ?? "");
      setError(null);
      setFrontLanguage(card.frontLanguage ?? null);
      setIsManualLanguage(!!card.frontLanguage);
      setDetectedLanguage(detectLanguage(card.front));
    }
  }, [card, decks]);

  const handleFrontDocChange = (doc: RichDocument) => {
    setFrontDoc(doc);
    if (!isManualLanguage) {
      const lang = detectLanguage(derivePlainText(doc));
      setDetectedLanguage(lang);
      setFrontLanguage(lang);
    }
  };

  const handleLanguageChange = (lang: string | null) => {
    setFrontLanguage(lang);
    setIsManualLanguage(true);
  };

  const originalFrontDoc = card
    ? (card.frontDoc ?? paragraphDocFromText(card.front))
    : null;
  const originalBackDoc = card
    ? (card.backDoc ?? paragraphDocFromText(card.back))
    : null;

  const isDirty =
    !card || !originalFrontDoc || !originalBackDoc
      ? false
      : JSON.stringify(frontDoc) !== JSON.stringify(originalFrontDoc) ||
        JSON.stringify(backDoc) !== JSON.stringify(originalBackDoc) ||
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

  // Default staged-media stub: a throwaway id keeps images in the document
  // without hitting storage until the Pixabay/media pipeline lands.
  const stageMedia = async (): Promise<{ id: string; attribution?: string }> => ({
    id: createDraftId(),
  });

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!frontText.trim()) {
      setError("Front is required");
      return;
    }
    if (!backText.trim()) {
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
          front: frontText,
          back: backText,
          frontDoc,
          backDoc,
          mediaDraftId,
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
          front: frontText,
          back: backText,
          frontDoc,
          backDoc,
          mediaDraftId,
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

          <CardRichTextToolbar
            editor={activeEditor}
            disabled={saving}
            onInsertImage={() => {
              if (focusedFace === "front") frontEditorRef.current?.openImagePicker();
              else if (focusedFace === "back") backEditorRef.current?.openImagePicker();
            }}
          />

          <div className="card-side-panel__field">
            <div className="card-side-panel__label">Front</div>
            <CardRichTextEditor
              ariaLabel="Front"
              value={frontDoc}
              onChange={handleFrontDocChange}
              onDiscardMedia={() => {}}
              onFocusChange={handleFaceFocus("front")}
              onStageMedia={stageMedia}
              ref={frontEditorRef}
              showToolbar={false}
              disabled={saving}
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
            <div className="card-side-panel__label">Back</div>
            <CardRichTextEditor
              ariaLabel="Back"
              value={backDoc}
              onChange={setBackDoc}
              onDiscardMedia={() => {}}
              onFocusChange={handleFaceFocus("back")}
              onStageMedia={stageMedia}
              ref={backEditorRef}
              showToolbar={false}
              disabled={saving}
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
