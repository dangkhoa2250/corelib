import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { IconArrowsExchange, IconPhoto } from "@tabler/icons-react";

import { PronunciationButton } from "../../components/PronunciationButton";
import { Combobox } from "../../components/Combobox";
import { ScrollArea } from "../../components/ScrollArea";
import type { CardSource, NewCardSource } from "../reader/readerSelection";
import { detectLanguage } from "../../lib/languageDetector";
import { derivePlainText, type RichDocument } from "../../domain/richDocument";
import { SUPPORTED_LANGUAGES, type CardMedia } from "../../domain/learning";
import type { ImageSearchResult, MultiImageSearchPage, StageMediaInput } from "../../domain/media";
import {
  discardMediaDraft,
  resolveStagedMedia,
  searchMultiSourceImages,
  stageRemoteCardMedia,
  stageRemoteImageResult,
  stageCardMedia,
} from "../../lib/media";
import { MediaPicker } from "./MediaPicker";
import {
  CardRichTextEditor,
  type CardRichTextEditorHandle,
  type MediaSourceType,
} from "./CardRichTextEditor";
import { CardRichTextToolbar } from "./CardRichTextToolbar";

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
  onTranslate?: (text: string, sourceLanguage?: string | null, targetLanguage?: string | null) => Promise<string>;
  /**
   * The language translations should target when the composer opens. Falls
   * back to the host's configured preference when omitted.
   */
  defaultBackLanguage?: string | null;
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
  searchMultiSourceImages?: (query: string, page: number) => Promise<MultiImageSearchPage>;
  stageRemoteCardMedia?: (draftId: string, sourceUrl: string, attribution?: string | null) => Promise<CardMedia>;
  resolveStagedMedia?: (draftId: string, mediaId: string) => Promise<string>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

/** Reads a Blob as base64 bytes for local file/clipboard media. */
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

export function CardComposer({
  draft,
  decks,
  onSave,
  onCancel,
  onTranslate,
  defaultBackLanguage,
  onStageMedia,
  variant = "modal",
  externalError,
  stageCardMedia: stageCardMediaBridge = stageCardMedia,
  discardMediaDraft: discardMediaDraftBridge = discardMediaDraft,
  searchMultiSourceImages: searchMultiSourceImagesBridge = searchMultiSourceImages,
  stageRemoteCardMedia: stageRemoteCardMediaBridge = stageRemoteCardMedia,
  resolveStagedMedia: resolveStagedMediaBridge = resolveStagedMedia,
}: CardComposerProps) {
  const activeDecks = decks.filter((deck) => !deck.archived);
  const formId = useId();
  const [frontDoc, setFrontDoc] = useState<RichDocument>(() => paragraphDocFromText(draft.quote));
  const [backDoc, setBackDoc] = useState<RichDocument>(() => paragraphDocFromText(""));
  const [deckValue, setDeckValue] = useState(() => activeDecks[0]?.id ?? NEW_DECK_VALUE);
  const [newDeckName, setNewDeckName] = useState("");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [autoTranslating, setAutoTranslating] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaDraftId] = useState(() => createDraftId());
  const [pickerOpen, setPickerOpen] = useState(false);
  const draftDiscardedRef = useRef(false);
  // Set once the user takes over the back face (typing, images, or a manual
  // translation) so a later auto-translation never replaces their content.
  const backEditedRef = useRef(false);

  const frontText = derivePlainText(frontDoc);
  const backText = derivePlainText(backDoc);

  const [frontLanguage, setFrontLanguage] = useState<string | null>(() => detectLanguage(draft.quote));
  const [isManualLanguage, setIsManualLanguage] = useState(false);
  const [backLanguage, setBackLanguage] = useState<string | null>(() => defaultBackLanguage ?? null);
  const [languagePopoverOpen, setLanguagePopoverOpen] = useState(false);
  const languagePopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isManualLanguage) {
      setFrontLanguage(detectLanguage(draft.quote));
    }
  }, [draft.quote, isManualLanguage]);

  const languageOptions = useMemo(
    () =>
      Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
        value: code,
        label: name,
      })),
    [],
  );

  // A new selection confirmed from the reader replaces the auto-filled front
  // while the composer stays open.
  useEffect(() => {
    setFrontDoc(paragraphDocFromText(draft.quote));
  }, [draft.quote]);

  // Auto-translate the selected quote into the back when the composer opens
  // or the selection changes. Best-effort: failures stay silent and the
  // manual Translate button still surfaces them.
  useEffect(() => {
    if (!onTranslate || !draft.quote.trim()) return;
    let cancelled = false;
    setAutoTranslating(true);
    Promise.resolve()
      .then(() => (cancelled ? null : onTranslate(draft.quote, frontLanguage, backLanguage)))
      .then((translation) => {
        // A slow translation must never clobber an image or text the user
        // already placed in the back face.
        if (cancelled || backEditedRef.current || translation === null) return;
        setBackDoc(paragraphDocFromText(translation));
      })
      .catch(() => {
        // Keep whatever the back already holds.
      })
      .finally(() => {
        if (!cancelled) setAutoTranslating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backLanguage, draft.quote, frontLanguage, onTranslate]);

  const handleFrontDocChange = (doc: RichDocument) => {
    setFrontDoc(doc);
    if (!isManualLanguage) {
      setFrontLanguage(detectLanguage(derivePlainText(doc)));
    }
  };

  const handleLanguageChange = (lang: string | null) => {
    setFrontLanguage(lang);
    setIsManualLanguage(true);
  };

  const handleLanguageButtonClick = () => {
    setLanguagePopoverOpen((open) => !open);
  };

  useEffect(() => {
    if (!languagePopoverOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (
        languagePopoverRef.current &&
        !languagePopoverRef.current.contains(event.target as Node)
      ) {
        setLanguagePopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [languagePopoverOpen]);

  const handleSwapLanguages = () => {
    const source = frontLanguage;
    setFrontLanguage(backLanguage);
    setBackLanguage(source);
    setIsManualLanguage(true);
  };
  const dialogRef = useRef<HTMLElement | null>(null);
  const frontEditorRef = useRef<CardRichTextEditorHandle | null>(null);
  const backEditorRef = useRef<CardRichTextEditorHandle | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const deckSelectionTouchedRef = useRef(false);

  const [stagedMediaUrls, setStagedMediaUrls] = useState<Record<string, string>>({});

  const resolveMedia = (mediaId: string): string => stagedMediaUrls[mediaId] ?? "";

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
        tags: [],
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
    if (!onTranslate || translating || autoTranslating || saving || !frontText) return;
    backEditedRef.current = true;
    setTranslating(true);
    setError(null);
    try {
      const translation = await onTranslate(frontText, frontLanguage, backLanguage);
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
    let previewUrl = "";
    if (sourceType === "file") {
      const filePath = (file as File & { path?: string }).path;
      input.filePath = typeof filePath === "string" && filePath.length > 0 ? filePath : null;
      if (typeof window !== "undefined" && window.URL && typeof window.URL.createObjectURL === "function") {
        previewUrl = URL.createObjectURL(file);
      }
    } else {
      const base64 = await blobToBase64(file);
      input.bytesBase64 = base64;
      previewUrl = `data:${file.type || "image/png"};base64,${base64}`;
    }
    const media = await stageCardMediaBridge(input);
    if (!previewUrl && media.relativePath) {
      previewUrl = convertFileSrc(media.relativePath);
    }
    if (previewUrl) {
      setStagedMediaUrls((prev) => ({ ...prev, [media.id]: previewUrl }));
    }
    return { id: media.id, attribution: media.attribution ?? undefined };
  };

  const stageMedia = onStageMedia ?? stageFileOrClipboard;

  const handleStageRemote = async (
    result: ImageSearchResult,
  ): Promise<{ mediaId: string; alt: string }> => {
    const media = await stageRemoteImageResult(mediaDraftId, result, stageRemoteCardMediaBridge);
    const alt = result.title || result.attribution;
    const absolutePath = await resolveStagedMediaBridge(mediaDraftId, media.id);
    backEditedRef.current = true;
    setStagedMediaUrls((prev) => ({ ...prev, [media.id]: convertFileSrc(absolutePath) }));
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
      id={formId}
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

        <div ref={languagePopoverRef} style={{ position: "relative" }}>
          <CardRichTextToolbar
            editor={activeEditor}
            disabled={saving}
            onInsertImage={() => {
              if (focusedFace === "front") frontEditorRef.current?.openImagePicker();
              else if (focusedFace === "back") backEditorRef.current?.openImagePicker();
            }}
            onTranslateLanguages={onTranslate ? handleLanguageButtonClick : undefined}
          />
          {onTranslate && languagePopoverOpen ? (
            <div
              role="dialog"
              aria-label="Translation languages"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                zIndex: 10,
                width: "min(300px, 100%)",
                padding: "10px",
                border: "1px solid var(--border-subtle)",
                borderRadius: "12px",
                background: "var(--panel-bg)",
                boxShadow: "var(--shadow-xl)",
                display: "grid",
                gap: "6px",
              }}
            >
              <strong style={{ fontSize: "12px" }}>Translate from</strong>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Combobox
                  ariaLabel="Source language"
                  className="combobox--compact"
                  value={frontLanguage}
                  onChange={handleLanguageChange}
                  options={languageOptions}
                  placeholder="From"
                />
                <button
                  aria-label="Swap languages"
                  type="button"
                  onClick={handleSwapLanguages}
                  style={{
                    border: 0,
                    borderRadius: "999px",
                    padding: "4px",
                    color: "var(--text-secondary)",
                    background: "var(--interactive-hover)",
                    cursor: "pointer",
                    display: "inline-flex",
                  }}
                >
                  <IconArrowsExchange size={14} />
                </button>
                <Combobox
                  ariaLabel="Target language"
                  className="combobox--compact"
                  value={backLanguage}
                  onChange={(v) => setBackLanguage(v)}
                  options={languageOptions}
                  placeholder="To"
                />
              </div>
            </div>
          ) : null}
        </div>

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
            onFocusChange={handleFaceFocus("front")}
            onStageMedia={stageMedia}
            resolveMedia={resolveMedia}
            ref={frontEditorRef}
            showToolbar={false}
            value={frontDoc}
          />
        </div>

        <div style={{ display: "grid", gap: "7px", fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            Back
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                 aria-label="Images"
                aria-expanded={pickerOpen}
                disabled={saving || translating}
                onClick={() => setPickerOpen((open) => !open)}
                style={{
                  border: 0,
                  borderRadius: "999px",
                  padding: "5px 10px",
                  color: "var(--link)",
                  background: "var(--interactive-hover)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                type="button"
              >
                <IconPhoto size={15} />
                <span>{pickerOpen ? "Close" : "Image"}</span>
              </button>
              {onTranslate ? (
              <>
                <button
                 aria-label="Translate"
                  disabled={saving || translating || autoTranslating || !frontText}
                  onClick={() => void handleTranslate()}
                  style={{ border: 0, borderRadius: "999px", padding: "5px 10px", color: "var(--link)", background: "var(--interactive-hover)", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}
                  type="button"
                >
                  {translating || autoTranslating ? "Translating…" : "Translate"}
                </button>
              </>
              ) : null}
            </span>
          </span>
          <CardRichTextEditor
            ariaLabel="Back"
            disabled={saving || translating}
            onChange={(doc) => {
              backEditedRef.current = true;
              setBackDoc(doc);
            }}
            onDiscardMedia={() => {}}
            onFocusChange={handleFaceFocus("back")}
            onStageMedia={stageMedia}
            resolveMedia={resolveMedia}
            ref={backEditorRef}
            showToolbar={false}
            value={backDoc}
          />
        </div>

        {visibleError ? (
          <div
            role="alert"
            style={{ padding: "10px 12px", borderRadius: "10px", color: "var(--warning)", background: "var(--color-danger-bg-soft)" }}
          >
            {visibleError}
          </div>
        ) : null}
      </div>
    </form>
  );

  const footer = (
    <footer style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
      <button
        disabled={saving}
        onClick={close}
        type="button"
        style={{
          border: "1px solid var(--border-strong)",
          borderRadius: "999px",
          padding: "5px 10px",
          color: "var(--button-secondary-text)",
          background: "var(--button-secondary-bg)",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        Cancel
      </button>
      <button
        disabled={saving || !sourceIsAvailable}
        type="submit"
        form={formId}
        style={{
          border: 0,
          borderRadius: "999px",
          padding: "5px 10px",
          color: "var(--button-primary-text)",
          background: "var(--button-primary-bg)",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </footer>
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
           overflow: "hidden",
          padding: "20px",
          borderLeft: "1px solid var(--border-subtle)",
          background: "var(--panel-bg)",
        }}
      >
        <header style={{ flexShrink: 0, marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 id="card-composer-title" style={{ margin: 0, fontSize: "18px", letterSpacing: "-0.02em" }}>
            Create flashcard
          </h2>
          <button
            type="button"
            onClick={close}
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
        <ScrollArea style={{ flex: "1 1 auto", minHeight: 0 }}>
          <div style={{ paddingRight: "20px", paddingLeft: "20px" }}>{form}</div>
        </ScrollArea>
        {pickerOpen ? (
          <div style={{ flex: "0 1 auto", maxHeight: "40%", minHeight: 0, marginTop: "16px", display: "flex", flexDirection: "column" }}>
            <ScrollArea style={{ flex: 1, minHeight: 0 }}>
              <div style={{ paddingRight: "20px", paddingLeft: "20px" }}>
                <MediaPicker frontText={frontText} onClose={() => setPickerOpen(false)} onSearch={searchMultiSourceImagesBridge} onStage={handleStageRemote} />
              </div>
            </ScrollArea>
          </div>
        ) : null}
        <div style={{ flexShrink: 0, marginTop: "16px", paddingLeft: "20px", paddingRight: "20px" }}>{footer}</div>
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
           display: "flex",
           flexDirection: "column",
           overflow: "hidden",
          padding: "24px",
          border: "1px solid var(--border-subtle)",
          borderRadius: "18px",
          background: "var(--panel-bg)",
          boxShadow: "var(--shadow-xl)",
          backdropFilter: "blur(24px)",
        }}
      >
        <header style={{ flexShrink: 0, marginBottom: "20px" }}>
          <h2 id="card-composer-title" style={{ margin: 0, fontSize: "24px", letterSpacing: "-0.02em" }}>
            Create flashcard
          </h2>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: "14px" }}>
            Your selected text is ready to edit on the front of the card.
          </p>
        </header>
        <ScrollArea style={{ flex: "0 1 auto", minHeight: 0 }}>
          <div style={{ paddingRight: "20px", paddingLeft: "20px" }}>{form}</div>
        </ScrollArea>
        {pickerOpen ? (
          <div style={{ flex: 1, minHeight: 0, marginTop: "16px", display: "flex", flexDirection: "column" }}>
            <ScrollArea style={{ flex: 1, minHeight: 0 }}>
              <div style={{ paddingRight: "20px", paddingLeft: "20px" }}>
                <MediaPicker frontText={frontText} onClose={() => setPickerOpen(false)} onSearch={searchMultiSourceImagesBridge} onStage={handleStageRemote} />
              </div>
            </ScrollArea>
          </div>
        ) : null}
        <div style={{ flexShrink: 0, marginTop: "16px", paddingLeft: "20px", paddingRight: "20px" }}>{footer}</div>
      </section>
    </div>
  );
}
