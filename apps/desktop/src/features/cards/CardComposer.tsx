import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { PronunciationButton } from "../../components/PronunciationButton";
import { Combobox } from "../../components/Combobox";
import type { CardSource, NewCardSource } from "../reader/readerSelection";
import { detectLanguage } from "../../lib/languageDetector";
import { derivePlainText, type RichDocument } from "../../domain/richDocument";
import type { CardMedia } from "../../domain/learning";
import type { PixabayImage, StageMediaInput } from "../../domain/media";
import {
  checkPixabayKey,
  discardMediaDraft,
  searchPixabayImages,
  stageCardMedia,
} from "../../lib/media";
import { LanguagePicker } from "./LanguagePicker";
import { MediaPicker } from "./MediaPicker";
import {
  CardRichTextEditor,
  type CardRichTextEditorHandle,
  type MediaSourceType,
} from "./CardRichTextEditor";

const NEW_DECK_VALUE = "__new_deck__";
const SOURCE_UNAVAILABLE_MESSAGE = "Source document is no longer available. Select text from an open document to create a card.";
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
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
  frontDoc?: RichDocument | null;
  backDoc?: RichDocument | null;
  mediaDraftId?: string | null;
  source?: NewCardSource;
  tags: string[];
  frontLanguage?: string | null;
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
  /**
   * Stages media inserted into either face. When omitted, a stub generates a
   * throwaway media id so images stay in the document without hitting storage.
   */
  onStageMedia?: (
    file: File | Blob,
    sourceType: MediaSourceType,
  ) => Promise<{ id: string; attribution?: string }>;
  variant?: "modal" | "panel";
  externalError?: string | null;
  /**
   * Media bridge overrides (all default to the typed Tauri wrappers). They are
   * injectable so tests can verify staging/discard wiring without the backend.
   */
  stageCardMedia?: (input: StageMediaInput) => Promise<CardMedia>;
  discardMediaDraft?: (draftId: string) => Promise<void>;
  checkPixabayKey?: () => Promise<boolean>;
  searchPixabayImages?: (query: string, page: number) => Promise<PixabayImage[]>;
  downloadPixabayPreview?: (previewUrl: string) => Promise<string>;
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

/** Builds a rich document from plain text, one paragraph per line. */
function paragraphDocFromText(text: string): RichDocument {
  const content = text.split("\n").map((line) => ({
    type: "paragraph" as const,
    content: line.length > 0 ? [{ type: "text" as const, text: line }] : [],
  }));
  return { type: "doc" as const, content };
}

/** Per-composer-session draft id; images staged under it survive a save retry. */
function createDraftId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Reads a Blob as base64 bytes (the payload the media bridge expects). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the image data."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read the image data."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Downloads a Pixabay preview into base64 bytes through an `<img>` + canvas,
 * which is the only path that fits the app CSP: `fetch` to the CDN would need
 * a `connect-src` loosening, so full-size images never load remotely. A tainted
 * canvas or failed load surfaces as a per-result download failure.
 */
async function downloadPixabayPreviewToBase64(previewUrl: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not download the image from Pixabay."));
    img.src = previewUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width || 0;
  canvas.height = img.naturalHeight || img.height || 0;
  const context = canvas.getContext("2d");
  if (!context || canvas.width === 0 || canvas.height === 0) {
    throw new Error("Could not download the image from Pixabay.");
  }
  context.drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg");
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function CardComposer({
  draft,
  decks,
  onSave,
  onCancel,
  onTranslate,
  onStageMedia,
  variant = "modal",
  externalError,
  stageCardMedia: stageCardMediaBridge = stageCardMedia,
  discardMediaDraft: discardMediaDraftBridge = discardMediaDraft,
  checkPixabayKey: checkPixabayKeyBridge = checkPixabayKey,
  searchPixabayImages: searchPixabayImagesBridge = searchPixabayImages,
  downloadPixabayPreview: downloadPixabayPreviewBridge = downloadPixabayPreviewToBase64,
}: CardComposerProps) {
  const activeDecks = decks.filter((deck) => !deck.archived);
  const [frontDoc, setFrontDoc] = useState<RichDocument>(() => paragraphDocFromText(draft.quote));
  const [backDoc, setBackDoc] = useState<RichDocument>(() => paragraphDocFromText(""));
  const [tags, setTags] = useState("");
  const [deckValue, setDeckValue] = useState(() => activeDecks[0]?.id ?? NEW_DECK_VALUE);
  const [newDeckName, setNewDeckName] = useState("");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaDraftId] = useState(() => createDraftId());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pixabayHasKey, setPixabayHasKey] = useState<boolean | null>(null);
  const draftDiscardedRef = useRef(false);

  const frontText = derivePlainText(frontDoc);
  const backText = derivePlainText(backDoc);

  const [frontLanguage, setFrontLanguage] = useState<string | null>(() => detectLanguage(draft.quote));
  const [isManualLanguage, setIsManualLanguage] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(() => detectLanguage(draft.quote));

  useEffect(() => {
    const lang = detectLanguage(draft.quote);
    setDetectedLanguage(lang);
    if (!isManualLanguage) {
      setFrontLanguage(lang);
    }
  }, [draft.quote, isManualLanguage]);

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
  const dialogRef = useRef<HTMLElement | null>(null);
  const frontEditorRef = useRef<CardRichTextEditorHandle | null>(null);
  const backEditorRef = useRef<CardRichTextEditorHandle | null>(null);
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
      frontEditorRef.current?.focus();
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

  useEffect(() => {
    let cancelled = false;
    void checkPixabayKeyBridge()
      .then((has) => {
        if (!cancelled) setPixabayHasKey(has);
      })
      .catch(() => {
        if (!cancelled) setPixabayHasKey(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkPixabayKeyBridge]);

  /**
   * Staged media is owned by the composer draft. Removing a single image node
   * has no backend call (best-effort); the whole draft is discarded on cancel
   * and after a successful save.
   */
  const discardDraft = () => {
    if (draftDiscardedRef.current) return;
    draftDiscardedRef.current = true;
    void discardMediaDraftBridge(mediaDraftId);
  };

  const close = () => {
    discardDraft();
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

    const front = derivePlainText(frontDoc);
    const back = derivePlainText(backDoc);
    const deckName = usingNewDeck ? newDeckName.trim() : selectedDeck?.name ?? "";
    if (!front || !back) {
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
        front,
        back,
        frontDoc,
        backDoc,
        mediaDraftId,
        source: draft,
        tags: tagsFromInput(tags),
        frontLanguage,
      });
    } catch (saveError) {
      setError(errorMessage(saveError));
      setSaving(false);
      return;
    }

    close();
  };

  const handleTranslate = async () => {
    if (!onTranslate || translating || saving || !frontText) return;
    setTranslating(true);
    setError(null);
    try {
      const translation = await onTranslate(frontText);
      if (backText.trim().length === 0) {
        // An empty back (no text, no images) becomes a single new paragraph.
        setBackDoc(paragraphDocFromText(translation));
      } else {
        // A back with content gets the translation at the current selection.
        backEditorRef.current?.insertTextAtSelection(translation);
      }
    } catch (translateError) {
      setError(errorMessage(translateError));
    } finally {
      setTranslating(false);
    }
  };

  if (closed) {
    return null;
  }

  const stageFileOrClipboard = async (
    file: File | Blob,
    sourceType: MediaSourceType,
  ): Promise<{ id: string; attribution?: string }> => {
    const input: StageMediaInput = { draftId: mediaDraftId, sourceType };
    if (sourceType === "file") {
      const filePath = (file as File & { path?: string }).path;
      input.filePath = typeof filePath === "string" && filePath.length > 0 ? filePath : null;
    } else {
      input.bytesBase64 = await blobToBase64(file);
    }
    const media = await stageCardMediaBridge(input);
    return { id: media.id, attribution: media.pixabayAttribution ?? undefined };
  };

  const stageMedia = onStageMedia ?? stageFileOrClipboard;

  const handleStagePixabay = async (
    result: PixabayImage,
  ): Promise<{ mediaId: string; alt: string }> => {
    const bytesBase64 = await downloadPixabayPreviewBridge(result.previewUrl);
    const media = await stageCardMediaBridge({
      draftId: mediaDraftId,
      sourceType: "pixabay",
      bytesBase64,
      pixabayAttribution: `Photo by ${result.user} on Pixabay`,
    });
    const alt = result.tags || `Photo by ${result.user} on Pixabay`;
    setBackDoc((current) => ({
      ...current,
      content: [
        ...current.content,
        { type: "image", attrs: { mediaId: media.id, alt, widthPercent: 100 } },
      ],
    }));
    return { mediaId: media.id, alt };
  };

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
          <Combobox
            value={deckValue}
            onChange={(v) => {
              deckSelectionTouchedRef.current = true;
              setDeckValue(v);
            }}
            options={[
              ...activeDecks.map((deck) => ({
                value: deck.id,
                label: deck.name,
              })),
              { value: NEW_DECK_VALUE, label: "New deck…" },
            ]}
            placeholder="Select a deck"
            disabled={saving}
            ariaLabel="Deck"
          />
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

        {/* Not a <label>: a label forwards clicks to the first labelable
            control inside it, so wrapping the editor together with the
            Translate/Pronunciation buttons steals focus from the
            contenteditable. The editors carry their own aria-labels. */}
        <div style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            Front
            <PronunciationButton text={frontText} />
          </span>
          <CardRichTextEditor
            ariaLabel="Front"
            disabled={saving}
            onChange={handleFrontDocChange}
            onDiscardMedia={() => {}}
            onStageMedia={stageMedia}
            ref={frontEditorRef}
            value={frontDoc}
          />
        </div>

        <label style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          Front Language
          <LanguagePicker
            value={frontLanguage}
            onChange={handleLanguageChange}
            disabled={saving}
            detectedLanguage={detectedLanguage}
            isManual={isManualLanguage}
          />
        </label>

        <div style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            Back
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                aria-label="Pixabay"
                aria-expanded={pickerOpen}
                disabled={saving || translating}
                onClick={() => setPickerOpen((open) => !open)}
                style={{ border: 0, borderRadius: "999px", padding: "5px 10px", color: "var(--link)", background: "var(--interactive-hover)", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
                type="button"
              >
                {pickerOpen ? "Close Pixabay" : "Pixabay"}
              </button>
              {onTranslate ? (
                <button
                  aria-label="Translate"
                  disabled={saving || translating || !frontText}
                  onClick={() => void handleTranslate()}
                  style={{ border: 0, borderRadius: "999px", padding: "5px 10px", color: "var(--link)", background: "var(--interactive-hover)", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
                  type="button"
                >
                  {translating ? "Translating…" : "Translate"}
                </button>
              ) : null}
            </span>
          </span>
          <CardRichTextEditor
            ariaLabel="Back"
            disabled={saving || translating}
            onChange={setBackDoc}
            onDiscardMedia={() => {}}
            onStageMedia={stageMedia}
            ref={backEditorRef}
            value={backDoc}
          />
        </div>

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

        {pickerOpen ? (
          pixabayHasKey === null ? (
            <p role="status" style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
              Checking Pixabay…
            </p>
          ) : (
            <MediaPicker
              frontText={frontText}
              hasKey={pixabayHasKey}
              onClose={() => setPickerOpen(false)}
              onSearch={searchPixabayImagesBridge}
              onStage={handleStagePixabay}
            />
          )
        ) : null}

        {visibleError ? (
          <div
            role="alert"
            style={{ padding: "10px 12px", borderRadius: "10px", color: "var(--warning)", background: "var(--color-danger-bg-soft)" }}
          >
            {visibleError}
          </div>
        ) : null}

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
          <button
            disabled={saving}
            onClick={close}
            type="button"
            style={{
              border: "1px solid var(--border-strong)",
              borderRadius: "999px",
              padding: "8px 16px",
              color: "var(--button-secondary-text)",
              background: "var(--button-secondary-bg)",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Cancel
          </button>
          <button
            disabled={saving || !sourceIsAvailable}
            type="submit"
            style={{
              border: 0,
              borderRadius: "999px",
              padding: "8px 16px",
              color: "var(--button-primary-text)",
              background: "var(--button-primary-bg)",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
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
          borderLeft: "1px solid var(--border-subtle)",
          background: "var(--panel-bg)",
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
              color: "var(--text-secondary)",
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
        background: "var(--overlay)",
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
          border: "1px solid var(--border-subtle)",
          borderRadius: "18px",
          background: "var(--panel-bg)",
          boxShadow: "var(--shadow-xl)",
          backdropFilter: "blur(24px)",
        }}
      >
        <header style={{ marginBottom: "20px" }}>
          <h2 id="card-composer-title" style={{ margin: 0, fontSize: "24px", letterSpacing: "-0.02em" }}>
            Create flashcard
          </h2>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: "14px" }}>
            Your selected text is ready to edit on the front of the card.
          </p>
        </header>
        {form}
      </section>
    </div>
  );
}
