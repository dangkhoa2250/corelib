import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Deck, CardBrowserRow, CardMedia } from "../../domain/learning";
import { createCard, updateAndMoveCard } from "../../lib/learning";
import { detectLanguage } from "../../lib/languageDetector";
import { derivePlainText, type RichDocument } from "../../domain/richDocument";
import { LanguagePicker } from "./LanguagePicker";
import { Combobox } from "../../components/Combobox";
import { ScrollArea } from "../../components/ScrollArea";
import {
  CardRichTextEditor,
  type CardRichTextEditorHandle,
  type MediaSourceType,
} from "./CardRichTextEditor";
import { CardRichTextToolbar } from "./CardRichTextToolbar";
import { stageCardMedia } from "../../lib/media";
import { discardMediaDraft, resolveCardMedia, resolveStagedMedia, searchMultiSourceImages, stageRemoteCardMedia, stageRemoteImageResult } from "../../lib/media";
import type { StageMediaInput } from "../../domain/media";
import type { ImageSearchResult, MultiImageSearchPage } from "../../domain/media";
import { MediaPicker } from "./MediaPicker";

export interface CardSidePanelProps {
  card: CardBrowserRow | null;
  decks: Deck[];
  onClose: () => void;
  onSaveSuccess: () => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  createCard?: typeof createCard;
  updateAndMoveCard?: typeof updateAndMoveCard;
  stageCardMedia?: typeof stageCardMedia;
  searchMultiSourceImages?: (query: string, page: number) => Promise<MultiImageSearchPage>;
  stageRemoteCardMedia?: (draftId: string, sourceUrl: string, attribution?: string | null) => Promise<CardMedia>;
  resolveStagedMedia?: (draftId: string, mediaId: string) => Promise<string>;
  resolveCardMedia?: (cardId: string, mediaId: string) => Promise<string>;
  discardMediaDraft?: (draftId: string) => Promise<void>;
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
  stageCardMedia: customStageCardMedia = stageCardMedia,
  searchMultiSourceImages: searchImages = searchMultiSourceImages,
  stageRemoteCardMedia: stageRemoteImage = stageRemoteCardMedia,
  resolveStagedMedia: resolveStagedMediaBridge = resolveStagedMedia,
  resolveCardMedia: resolveCardMediaBridge = resolveCardMedia,
  discardMediaDraft: discardDraftBridge = discardMediaDraft,
}: CardSidePanelProps) {
  const [frontDoc, setFrontDoc] = useState<RichDocument>(() =>
    paragraphDocFromText(card?.front ?? ""),
  );
  const [backDoc, setBackDoc] = useState<RichDocument>(() =>
    paragraphDocFromText(card?.back ?? ""),
  );
  const [deckId, setDeckId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frontLanguage, setFrontLanguage] = useState<string | null>(null);
  const [isManualLanguage, setIsManualLanguage] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [mediaDraftId] = useState(() => createDraftId());
  const [stagedMediaUrls, setStagedMediaUrls] = useState<Record<string, string>>({});
  const [committedMediaReady, setCommittedMediaReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const discardedRef = useRef(false);

  const resolveMedia = (mediaId: string): string => stagedMediaUrls[mediaId] ?? "";

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
      setCommittedMediaReady(false);
      setDeckId(card.deckId ?? decks[0]?.id ?? "");
      setError(null);
      setFrontLanguage(card.frontLanguage ?? null);
      setIsManualLanguage(!!card.frontLanguage);
      setDetectedLanguage(detectLanguage(card.front));
    }
  }, [card, decks]);

  // Resolve media already committed to the card so the editors can render
  // existing images while editing, not just freshly staged ones.
  useEffect(() => {
    let cancelled = false;
    const media = card?.media ?? [];
    setCommittedMediaReady(false);
    if (!card?.id || media.length === 0) return;
    void Promise.all(
      media.map(async (item) => {
        try {
          const absolutePath = await resolveCardMediaBridge(card.id, item.id);
          return [item.id, convertFileSrc(absolutePath)] as const;
        } catch {
          return [item.id, ""] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setStagedMediaUrls((prev) => {
        const next = { ...prev };
        for (const [mediaId, url] of entries) next[mediaId] = url;
        return next;
      });
      setCommittedMediaReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [card, resolveCardMediaBridge]);

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
    if (!discardedRef.current) {
      discardedRef.current = true;
      void discardDraftBridge(mediaDraftId);
    }
    onClose();
  };

  if (!card) return null;
  const hasCommittedMedia = (card.media?.length ?? 0) > 0;
  // Image node views read the resolved URL when they are created, so the
  // editors mount once the committed-media URLs are available; otherwise
  // existing images would render blank until the next document change.
  const editorKey = hasCommittedMedia && !committedMediaReady ? "media-pending" : "media-ready";

  const stageMedia = async (file: File | Blob, sourceType: MediaSourceType): Promise<{ id: string; attribution?: string }> => {
    const input: StageMediaInput = { draftId: mediaDraftId, sourceType };
    if (sourceType === "file") {
      const filePath = (file as File & { path?: string }).path;
      input.filePath = typeof filePath === "string" && filePath.length > 0 ? filePath : null;
    } else {
      input.bytesBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const value = reader.result;
          if (typeof value !== "string") return reject(new Error("Could not read the image data."));
          const comma = value.indexOf(",");
          resolve(comma >= 0 ? value.slice(comma + 1) : value);
        };
        reader.onerror = () => reject(new Error("Could not read the image data."));
        reader.readAsDataURL(file);
      });
    }
    const media = await customStageCardMedia(input);
    const absolutePath = await resolveStagedMediaBridge(mediaDraftId, media.id);
    setStagedMediaUrls((prev) => ({ ...prev, [media.id]: convertFileSrc(absolutePath) }));
    return { id: media.id, attribution: media.attribution ?? undefined };
  };

  const handleStageRemote = async (result: ImageSearchResult): Promise<{ mediaId: string; alt: string }> => {
    const media = await stageRemoteImageResult(mediaDraftId, result, stageRemoteImage);
    const absolutePath = await resolveStagedMediaBridge(mediaDraftId, media.id);
    setStagedMediaUrls((prev) => ({ ...prev, [media.id]: convertFileSrc(absolutePath) }));
    const alt = result.title || result.attribution;
    const append = (doc: RichDocument) => ({ ...doc, content: [...doc.content, { type: "image" as const, attrs: { mediaId: media.id, alt, widthPercent: 100 } }] });
    if (focusedFace === "front") setFrontDoc(append);
    else setBackDoc(append);
    return { mediaId: media.id, alt };
  };

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
      // Tag editing is hidden; new cards start untagged while edited cards
      // keep whatever tags they already had.
      const tagsForSave = card.id ? [...card.tags] : [];

      if (card.id) {
        // Edit mode: update content + optional deck move in one atomic operation.
        await customUpdateAndMove({
          cardId: card.id,
          front: frontText,
          back: backText,
          frontDoc,
          backDoc,
          mediaDraftId,
          tags: tagsForSave,
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
          tags: tagsForSave,
          frontLanguage,
        });
      }
      if (!discardedRef.current) {
        discardedRef.current = true;
        void discardDraftBridge(mediaDraftId);
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

        <ScrollArea className="card-side-panel__scroll-area">
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
              key={editorKey}
              value={frontDoc}
              onChange={handleFrontDocChange}
              onDiscardMedia={() => {}}
              onFocusChange={handleFaceFocus("front")}
              onStageMedia={stageMedia}
              resolveMedia={resolveMedia}
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
            <div className="card-side-panel__label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Back</span>
              <button aria-expanded={pickerOpen} aria-label="Images" disabled={saving} onClick={() => setPickerOpen((open) => !open)} type="button">
                {pickerOpen ? "Close" : "Images"}
              </button>
            </div>
            <CardRichTextEditor
              ariaLabel="Back"
              key={editorKey}
              value={backDoc}
              onChange={setBackDoc}
              onDiscardMedia={() => {}}
              onFocusChange={handleFaceFocus("back")}
              onStageMedia={stageMedia}
              resolveMedia={resolveMedia}
              ref={backEditorRef}
              showToolbar={false}
              disabled={saving}
            />
            {pickerOpen ? <MediaPicker frontText={frontText} onClose={() => setPickerOpen(false)} onSearch={searchImages} onStage={handleStageRemote} /> : null}
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
        </ScrollArea>
      </div>
    </div>
  );
}
