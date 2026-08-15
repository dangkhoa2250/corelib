import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { IconArrowsExchange, IconPhoto } from "@tabler/icons-react";

import { PronunciationButton } from "../../components/PronunciationButton";
import { Button } from "../../components/Button";
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
  /**
   * The reader-selection this card is created from. Omit for the manual
   * add/edit flows (`CardSidePanel`), which have no source document to track
   * — the composer then skips the source-availability gate and auto-translate
   * entirely.
   */
  draft?: CardSource;
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
  /** Dialog title. Defaults to "Create flashcard"; the manual add/edit flow overrides it. */
  heading?: string;
  /** Modal-only subtitle under the heading. Pass null to hide it. */
  subtitle?: string | null;
  /** Pre-fills the front face (edit mode). Falls back to `draft.quote`, then empty. */
  initialFrontDoc?: RichDocument;
  /** Pre-fills the back face (edit mode). Defaults to empty. */
  initialBackDoc?: RichDocument;
  /** Pre-selects a deck (edit mode). Defaults to the first active deck. */
  initialDeckId?: string;
  /** Pre-fills the front language as a manual (not auto-detected) choice. */
  initialFrontLanguage?: string | null;
  /**
   * Whether the deck picker offers "New deck…". Editing an existing card can
   * only move it between decks that already exist, so hosts that update
   * (rather than create) a card should pass `false`.
   */
  allowNewDeck?: boolean;
  /**
   * Pre-resolved display URLs for media already committed to the card (edit
   * mode). Resolving these is async, so this may arrive (or be updated)
   * after mount — Front/Back render immediately either way, and any image
   * whose URL lands late redraws once it does.
   */
  initialMediaUrls?: Record<string, string>;
  /**
   * Reports whether Front/Back/Deck/language have changed since mount. Hosts
   * that let the user navigate away mid-edit (the manual add/edit flow) use
   * this to gate that with a confirmation; the reader-selection flow ignores
   * it and behaves exactly as before.
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * When true, closing (×, Cancel, Escape) while dirty asks the user to
   * confirm discarding changes first. Off by default so the reader-selection
   * flow's Cancel/Escape keep their current no-prompt behavior.
   */
  confirmDiscardOnClose?: boolean;
  /**
   * When true, saving a card clears front/back and keeps the panel open for
   * creating further cards without closing.
   */
  resetOnSave?: boolean;
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
export function paragraphDocFromText(text: string): RichDocument {
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
        reject(new Error("Expected data URL"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

export function CardComposer({
  draft,
  decks,
  onSave,
  onCancel,
  onTranslate,
  defaultBackLanguage = null,
  onStageMedia,
  variant = "modal",
  externalError = null,
  heading = "Create flashcard",
  subtitle = "Your selected text is ready to edit on the front of the card.",
  initialFrontDoc,
  initialBackDoc,
  initialDeckId,
  initialFrontLanguage,
  allowNewDeck = true,
  initialMediaUrls,
  onDirtyChange,
  confirmDiscardOnClose = false,
  resetOnSave = false,
  stageCardMedia: stageCardMediaBridge = stageCardMedia,
  discardMediaDraft: discardMediaDraftBridge = discardMediaDraft,
  searchMultiSourceImages: searchMultiSourceImagesBridge = searchMultiSourceImages,
  stageRemoteCardMedia: stageRemoteCardMediaBridge = stageRemoteCardMedia,
  resolveStagedMedia: resolveStagedMediaBridge = resolveStagedMedia,
}: CardComposerProps) {
  // An edit target's deck may since have been archived; keep it selectable so
  // editing never silently drops the card's current deck from the list.
  const activeDecks = decks.filter((deck) => !deck.archived || deck.id === initialDeckId);
  const formId = useId();
  const [frontDoc, setFrontDoc] = useState<RichDocument>(
    () => initialFrontDoc ?? paragraphDocFromText(draft?.quote ?? ""),
  );
  const [backDoc, setBackDoc] = useState<RichDocument>(() => initialBackDoc ?? paragraphDocFromText(""));
  const [deckValue, setDeckValue] = useState(() => initialDeckId ?? activeDecks[0]?.id ?? NEW_DECK_VALUE);
  const [newDeckName, setNewDeckName] = useState("");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [autoTranslating, setAutoTranslating] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaDraftId, setMediaDraftId] = useState(() => createDraftId());
  const [pickerOpen, setPickerOpen] = useState(false);
  const draftDiscardedRef = useRef(false);
  // Set once the user takes over the back face (typing, images, or a manual
  // translation) so a later auto-translation never replaces their content.
  const backEditedRef = useRef(false);

  const frontText = derivePlainText(frontDoc);
  const backText = derivePlainText(backDoc);

  const [frontLanguage, setFrontLanguage] = useState<string | null>(
    () => initialFrontLanguage ?? detectLanguage(draft?.quote ?? ""),
  );
  const [isManualLanguage, setIsManualLanguage] = useState(() => initialFrontLanguage != null);
  const [backLanguage, setBackLanguage] = useState<string | null>(() => defaultBackLanguage ?? null);
  const [languagePopoverOpen, setLanguagePopoverOpen] = useState(false);
  const languagePopoverRef = useRef<HTMLDivElement | null>(null);
  const languagePopoverDialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isManualLanguage || !draft) return;
    setFrontLanguage(detectLanguage(draft.quote));
  }, [draft?.quote, isManualLanguage]);

  // Mount-time snapshot for dirty-checking. A ref's initializer only runs
  // once, so this captures the composer's starting values regardless of
  // whether they came from `initial*` props (edit mode) or a reader draft.
  const initialSnapshotRef = useRef({ frontDoc, backDoc, deckValue, frontLanguage });
  const isDirty =
    JSON.stringify(frontDoc) !== JSON.stringify(initialSnapshotRef.current.frontDoc) ||
    JSON.stringify(backDoc) !== JSON.stringify(initialSnapshotRef.current.backDoc) ||
    deckValue !== initialSnapshotRef.current.deckValue ||
    frontLanguage !== initialSnapshotRef.current.frontLanguage;

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const languageOptions = useMemo(
    () =>
      Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
        value: code,
        label: name,
      })),
    [],
  );

  // A new selection confirmed from the reader replaces the auto-filled front
  // while the composer stays open. A changed quote also dismisses the image
  // picker so its grid never shows results for the previous selection. Manual
  // add/edit (no draft) never re-triggers this — its initial content is fixed.
  useEffect(() => {
    if (!draft) return;
    setFrontDoc(paragraphDocFromText(draft.quote));
    setPickerOpen(false);
  }, [draft?.quote]);

  // Auto-translate the selected quote into the back when the composer opens
  // or the selection changes. Best-effort: failures stay silent and the
  // manual Translate button still surfaces them. Manual add/edit (no draft)
  // never auto-translates — it would otherwise clobber existing content on
  // every mount.
  useEffect(() => {
    // Only auto-translate when the source language is known. Deleting the
    // front text or selecting text whose language cannot be detected must not
    // re-trigger translation with an unknown source language (or prompt the
    // user to pick one).
    if (!draft || !onTranslate || !draft.quote.trim() || !frontLanguage) return;
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
  }, [backLanguage, draft?.quote, frontLanguage, onTranslate]);

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
      const target = event.target as Node;
      const wrapper = languagePopoverRef.current;
      if (!wrapper) return;
      if (!wrapper.contains(target)) {
        setLanguagePopoverOpen(false);
        return;
      }
      if (languagePopoverDialogRef.current?.contains(target)) return;
      const translateButton = wrapper.querySelector<HTMLElement>(
        '[aria-label="Translate languages"]',
      );
      if (translateButton?.contains(target)) return;
      setLanguagePopoverOpen(false);
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

  const [stagedMediaUrls, setStagedMediaUrls] = useState<Record<string, string>>(
    () => initialMediaUrls ?? {},
  );

  // Committed media (edit mode) resolves asynchronously and may update after
  // mount; freshly staged URLs always win over a same-id committed one.
  useEffect(() => {
    if (!initialMediaUrls) return;
    setStagedMediaUrls((prev) => ({ ...initialMediaUrls, ...prev }));
  }, [initialMediaUrls]);

  // Re-render existing image nodes once their URL resolves. Node views read
  // `resolveMedia` only when created, so a later `stagedMediaUrls` update
  // needs an explicit nudge to reach images already on the page.
  useEffect(() => {
    frontEditorRef.current?.refreshMedia();
    backEditorRef.current?.refreshMedia();
  }, [stagedMediaUrls]);

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

  // Manual add/edit (no draft) has no source document to lose, so it's always available.
  const sourceIsAvailable = !draft || hasRequiredDocumentId(draft);
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

  /** Close, but confirm first if the host opted in and there are unsaved edits. */
  const requestClose = () => {
    if (confirmDiscardOnClose && isDirty && !window.confirm("You have unsaved changes. Discard changes?")) {
      return;
    }
    close();
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saving) {
        requestClose();
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

    if (resetOnSave) {
      setMediaDraftId(createDraftId());
      const emptyDoc = paragraphDocFromText("");
      setFrontDoc(emptyDoc);
      setBackDoc(emptyDoc);
      setStagedMediaUrls({});
      setFrontLanguage(null);
      setIsManualLanguage(false);
      setSaving(false);
      setError(null);
      backEditedRef.current = false;
      initialSnapshotRef.current = { frontDoc: emptyDoc, backDoc: emptyDoc, deckValue, frontLanguage: null };
      frontEditorRef.current?.getEditor()?.commands.setContent(emptyDoc);
      backEditorRef.current?.getEditor()?.commands.setContent(emptyDoc);
      frontEditorRef.current?.focus();
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
      className="card-composer__form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <div className="card-composer__form-grid">
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
              ...(allowNewDeck ? [{ value: NEW_DECK_VALUE, label: "New deck…" }] : []),
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
              ref={languagePopoverDialogRef}
              role="dialog"
              aria-label="Translation languages"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                zIndex: 10,
                width: "min(300px, 100%)",
                padding: "10px",
                border: "1px solid var(--border-strong)",
                borderRadius: "12px",
                background: "var(--window-bg)",
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
                  className="combobox--compact combobox--inset"
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
        <div className="card-composer__face-row" style={{ fontWeight: 600 }}>
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

        <div className="card-composer__face-row" style={{ fontWeight: 600 }}>
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
      <Button
        disabled={saving}
        onClick={requestClose}
        variant="secondary"
      >
        Cancel
      </Button>
      <Button
        disabled={saving || !sourceIsAvailable}
        type="submit"
        form={formId}
        variant="primary"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </footer>
  );

  if (variant === "panel") {
    return (
      <section
        aria-labelledby="card-composer-title"
        className="card-composer--panel"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        style={{
          width: "360px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "20px 12px",
          borderLeft: "1px solid var(--border-subtle)",
          background: "var(--panel-bg)",
        }}
      >
        <header style={{ flexShrink: 0, marginBottom: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 id="card-composer-title" style={{ margin: 0, fontSize: "18px", letterSpacing: "-0.02em" }}>
            {heading}
          </h2>
          <button
            type="button"
            onClick={requestClose}
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
        <div style={{ flex: "0 0 auto", minHeight: 0 }}>{form}</div>
        <div style={{ flexShrink: 0, marginTop: "16px" }}>{footer}</div>
        {pickerOpen ? (
          <div style={{ flex: "1 1 auto", minHeight: 0, marginTop: "16px", display: "flex", flexDirection: "column" }}>
            <ScrollArea style={{ flex: 1, minHeight: 0 }}>
              <div style={{ padding: "4px 16px 4px 4px" }}>
                <MediaPicker frontText={frontText} onClose={() => setPickerOpen(false)} onSearch={searchMultiSourceImagesBridge} onStage={handleStageRemote} />
              </div>
            </ScrollArea>
          </div>
        ) : null}
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
        padding: "12px",
        background: "var(--overlay)",
      }}
    >
      <section
        aria-labelledby="card-composer-title"
        aria-modal="true"
        className="card-composer--modal"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        style={{
          width: "min(1080px, calc(100% - 32px))",
          height: "min(760px, calc(100vh - 24px))",
          maxHeight: "calc(100vh - 24px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "24px 12px",
          border: "1px solid var(--border-subtle)",
          borderRadius: "18px",
          background: "var(--panel-bg)",
          boxShadow: "var(--shadow-xl)",
          backdropFilter: "blur(24px)",
        }}
      >
        <header style={{ flexShrink: 0, marginBottom: "14px" }}>
          <h2 id="card-composer-title" style={{ margin: 0, fontSize: "24px", letterSpacing: "-0.02em" }}>
            {heading}
          </h2>
          {subtitle ? (
            <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: "14px" }}>
              {subtitle}
            </p>
          ) : null}
        </header>
        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", padding: "0 8px" }}>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 4px" }}>{form}</div>
        </div>
        <div style={{ flexShrink: 0, marginTop: "12px", paddingLeft: "12px", paddingRight: "12px" }}>{footer}</div>
        {pickerOpen ? (
          <div style={{ flex: "1 1 40%", minHeight: 0, marginTop: "12px", paddingLeft: "12px", paddingRight: "12px", display: "flex", flexDirection: "column" }}>
            <ScrollArea style={{ flex: 1, minHeight: 0 }}>
              <div style={{ paddingRight: "20px" }}>
                <MediaPicker frontText={frontText} onClose={() => setPickerOpen(false)} onSearch={searchMultiSourceImagesBridge} onStage={handleStageRemote} />
              </div>
            </ScrollArea>
          </div>
        ) : null}
      </section>
    </div>
  );
}
