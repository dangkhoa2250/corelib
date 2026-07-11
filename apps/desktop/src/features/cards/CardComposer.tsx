import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { PronunciationButton } from "../../components/PronunciationButton";
import type { CardSource, NewCardSource } from "../reader/readerSelection";

const NEW_DECK_VALUE = "__new_deck__";
const SOURCE_UNAVAILABLE_MESSAGE = "Source document is no longer available. Select text from an open document to create a card.";
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export interface CardComposerDeck {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean;
}

export interface CardSaveInput {
  deckName: string;
  front: string;
  back: string;
  source?: NewCardSource;
  tags: string[];
}

export interface CardComposerProps {
  draft: CardSource;
  decks: CardComposerDeck[];
  /**
   * The host persists a card and, when necessary, creates its named deck in
   * one atomic operation. Keeping that boundary together avoids orphan decks
   * when a card save fails and is retried.
   */
  onSave: (input: CardSaveInput) => Promise<void>;
  onCancel: () => void;
  onTranslate?: (text: string) => Promise<string>;
  variant?: "modal" | "panel";
  externalError?: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tagsFromInput(tags: string): string[] {
  return [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function hasRequiredDocumentId(source: CardSource): source is NewCardSource {
  return typeof source.documentId === "string" && source.documentId.trim().length > 0;
}

export function CardComposer({
  draft,
  decks,
  onSave,
  onCancel,
  onTranslate,
  variant = "modal",
  externalError,
}: CardComposerProps) {
  const activeDecks = decks.filter((deck) => !deck.archived);
  const [front, setFront] = useState(draft.quote);
  const [back, setBack] = useState("");
  const [tags, setTags] = useState("");
  const [deckValue, setDeckValue] = useState(() => activeDecks[0]?.id ?? NEW_DECK_VALUE);
  const [newDeckName, setNewDeckName] = useState("");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const frontRef = useRef<HTMLTextAreaElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const deckSelectionTouchedRef = useRef(false);

  const sourceIsAvailable = hasRequiredDocumentId(draft);
  const usingNewDeck = deckValue === NEW_DECK_VALUE;
  const selectedDeck = activeDecks.find((deck) => deck.id === deckValue);
  const visibleError = externalError || (sourceIsAvailable ? error : SOURCE_UNAVAILABLE_MESSAGE);

  useEffect(() => {
    if (!deckSelectionTouchedRef.current && deckValue === NEW_DECK_VALUE && activeDecks.length > 0) {
      setDeckValue(activeDecks[0].id);
    }
  }, [activeDecks, deckValue]);

  useEffect(() => {
    if (variant === "modal") {
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      frontRef.current?.focus();
    }

    return () => {
      if (variant === "modal") {
        previousFocusRef.current?.focus();
      }
    };
  }, [variant]);

  useEffect(() => {
    if (closed) {
      previousFocusRef.current?.focus();
    }
  }, [closed]);

  const close = () => {
    setClosed(true);
    onCancel();
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saving) {
        close();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable || focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSave = async () => {
    if (saving || closed) {
      return;
    }

    if (!sourceIsAvailable) {
      setError(SOURCE_UNAVAILABLE_MESSAGE);
      return;
    }

    const trimmedFront = front.trim();
    const trimmedBack = back.trim();
    const deckName = usingNewDeck ? newDeckName.trim() : selectedDeck?.name ?? "";
    if (!trimmedFront || !trimmedBack) {
      setError("Front and Back are required.");
      return;
    }
    if (!deckName) {
      setError("Choose a deck.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSave({
        deckName,
        front: trimmedFront,
        back: trimmedBack,
        source: draft,
        tags: tagsFromInput(tags),
      });
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSaving(false);
      return;
    }

    close();
  };

  const handleTranslate = async () => {
    if (!onTranslate || translating || saving || !front.trim()) return;
    setTranslating(true);
    setError(null);
    try {
      const translation = await onTranslate(front.trim());
      setBack(translation);
    } catch (translateError) {
      setError(errorMessage(translateError));
    } finally {
      setTranslating(false);
    }
  };

  if (closed) {
    return null;
  }

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <div style={{ display: "grid", gap: "16px" }}>
        <label style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          Deck
          <select
            aria-label="Deck"
            disabled={saving}
            onChange={(event) => {
              deckSelectionTouchedRef.current = true;
              setDeckValue(event.target.value);
            }}
            value={deckValue}
          >
            {activeDecks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
            <option value={NEW_DECK_VALUE}>New deck…</option>
          </select>
        </label>

        {usingNewDeck ? (
          <label style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
            New deck name
            <input
              aria-label="New deck name"
              disabled={saving}
              onChange={(event) => setNewDeckName(event.target.value)}
              placeholder="e.g. English vocabulary"
              type="text"
              value={newDeckName}
            />
          </label>
        ) : null}

        <label style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            Front
            <PronunciationButton text={front} />
          </span>
          <textarea
            aria-label="Front"
            disabled={saving}
            onChange={(event) => setFront(event.target.value)}
            ref={frontRef}
            rows={5}
            value={front}
          />
        </label>

        <label style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            Back
            {onTranslate ? (
              <button
                aria-label="Translate"
                disabled={saving || translating || !front.trim()}
                onClick={() => void handleTranslate()}
                style={{ border: 0, borderRadius: "999px", padding: "5px 10px", color: "#007aff", background: "#e5f1ff", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
                type="button"
              >
                {translating ? "Translating…" : "Translate"}
              </button>
            ) : null}
          </span>
          <textarea
            aria-label="Back"
            disabled={saving || translating}
            onChange={(event) => setBack(event.target.value)}
            rows={5}
            value={back}
          />
        </label>

        <label style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          Tags
          <input
            aria-label="Tags"
            disabled={saving}
            onChange={(event) => setTags(event.target.value)}
            placeholder="e.g. algebra, definitions"
            type="text"
            value={tags}
          />
        </label>

        <section
          aria-label="Source preview"
          style={{ padding: "12px", borderRadius: "12px", background: "#f2f2f7" }}
        >
          <strong style={{ display: "block", marginBottom: "4px", fontSize: "13px" }}>Source</strong>
          <span style={{ color: "#48484a", fontSize: "13px" }}>
            Document {draft.documentId ?? "Unavailable"} · Page {draft.page}
          </span>
        </section>

        {visibleError ? (
          <div
            role="alert"
            style={{ padding: "10px 12px", borderRadius: "10px", color: "#9a3412", background: "#fff7ed" }}
          >
            {visibleError}
          </div>
        ) : null}

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
          <button disabled={saving} onClick={close} type="button">
            Cancel
          </button>
          <button disabled={saving || !sourceIsAvailable} type="submit">
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </form>
  );

  if (variant === "panel") {
    return (
      <section
        aria-labelledby="card-composer-title"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        style={{
          width: "360px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "20px",
          borderLeft: "1px solid rgb(0 0 0 / 9%)",
          background: "#fff",
        }}
      >
        <header style={{ marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 id="card-composer-title" style={{ margin: 0, fontSize: "18px", letterSpacing: "-0.02em" }}>
            Create flashcard
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close composer"
            style={{
              background: "transparent",
              border: "none",
              fontSize: "20px",
              color: "#8e8e93",
              cursor: "pointer",
              padding: "4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>
        {form}
      </section>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 20,
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: "20px",
        background: "rgb(29 29 31 / 28%)",
      }}
    >
      <section
        aria-labelledby="card-composer-title"
        aria-modal="true"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        style={{
          width: "min(680px, 100%)",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          padding: "24px",
          border: "1px solid rgb(0 0 0 / 9%)",
          borderRadius: "18px",
          background: "rgb(255 255 255 / 96%)",
          boxShadow: "0 24px 72px rgb(0 0 0 / 24%)",
          backdropFilter: "blur(24px)",
        }}
      >
        <header style={{ marginBottom: "20px" }}>
          <h2 id="card-composer-title" style={{ margin: 0, fontSize: "24px", letterSpacing: "-0.02em" }}>
            Create flashcard
          </h2>
          <p style={{ margin: "6px 0 0", color: "#6e6e73", fontSize: "14px" }}>
            Your selected text is ready to edit on the front of the card.
          </p>
        </header>
        {form}
      </section>
    </div>
  );
}
