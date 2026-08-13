import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Deck, CardBrowserRow, CardMedia } from "../../domain/learning";
import { createCard, updateAndMoveCard } from "../../lib/learning";
import {
  discardMediaDraft,
  resolveCardMedia,
  resolveStagedMedia,
  searchMultiSourceImages,
  stageCardMedia,
  stageRemoteCardMedia,
} from "../../lib/media";
import type { MultiImageSearchPage } from "../../domain/media";
import { CardComposer, paragraphDocFromText, type CardSaveInput } from "./CardComposer";

export interface CardSidePanelProps {
  card: CardBrowserRow | null;
  decks: Deck[];
  onClose: () => void;
  onSaveSuccess: () => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  onTranslate?: (text: string, sourceLanguage?: string | null, targetLanguage?: string | null) => Promise<string>;
  createCard?: typeof createCard;
  updateAndMoveCard?: typeof updateAndMoveCard;
  stageCardMedia?: typeof stageCardMedia;
  searchMultiSourceImages?: (query: string, page: number) => Promise<MultiImageSearchPage>;
  stageRemoteCardMedia?: (draftId: string, sourceUrl: string, attribution?: string | null) => Promise<CardMedia>;
  resolveStagedMedia?: (draftId: string, mediaId: string) => Promise<string>;
  resolveCardMedia?: (cardId: string, mediaId: string) => Promise<string>;
  discardMediaDraft?: (draftId: string) => Promise<void>;
}

/**
 * Add/Edit Card is `CardComposer` under a right-hand sidebar shell: same
 * fields, same layout, same scrolling — only the heading and the persistence
 * call underneath (create vs. update-and-move) differ from the
 * reader-selection "Create flashcard" flow.
 */
export function CardSidePanel({
  card,
  decks,
  onClose,
  onSaveSuccess,
  onDirtyStateChange,
  onTranslate,
  createCard: customCreate = createCard,
  updateAndMoveCard: customUpdateAndMove = updateAndMoveCard,
  stageCardMedia: customStageCardMedia = stageCardMedia,
  searchMultiSourceImages: searchImages = searchMultiSourceImages,
  stageRemoteCardMedia: stageRemoteImage = stageRemoteCardMedia,
  resolveStagedMedia: resolveStagedMediaBridge = resolveStagedMedia,
  resolveCardMedia: resolveCardMediaBridge = resolveCardMedia,
  discardMediaDraft: discardDraftBridge = discardMediaDraft,
}: CardSidePanelProps) {
  const [committedMediaUrls, setCommittedMediaUrls] = useState<Record<string, string>>({});

  // Resolve media already committed to the card so the editors can render
  // existing images while editing, not just freshly staged ones. This may
  // land after CardComposer has already mounted; it picks up the update.
  useEffect(() => {
    let cancelled = false;
    setCommittedMediaUrls({});
    const media = card?.media ?? [];
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
      setCommittedMediaUrls(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [card, resolveCardMediaBridge]);

  if (!card) return null;

  const isNewCard = !card.id;
  // Tag editing is hidden; new cards start untagged while edited cards keep
  // whatever tags they already had.
  const tagsForSave = isNewCard ? [] : [...card.tags];

  const handleSave = async (input: CardSaveInput) => {
    if (isNewCard) {
      await customCreate({
        deckName: input.deckName,
        front: input.front,
        back: input.back,
        frontDoc: input.frontDoc,
        backDoc: input.backDoc,
        mediaDraftId: input.mediaDraftId,
        tags: tagsForSave,
        frontLanguage: input.frontLanguage,
      });
    } else {
      // The deck picker only offers decks that already exist for an edit
      // (see `allowNewDeck={false}` below), so the saved name always matches
      // one of `decks` — resolve it back to an id for the move.
      const destinationDeckId = decks.find((deck) => deck.name === input.deckName)?.id ?? null;
      await customUpdateAndMove({
        cardId: card.id,
        front: input.front,
        back: input.back,
        frontDoc: input.frontDoc,
        backDoc: input.backDoc,
        mediaDraftId: input.mediaDraftId,
        tags: tagsForSave,
        destinationDeckId: destinationDeckId !== card.deckId ? destinationDeckId : null,
        frontLanguage: input.frontLanguage ?? null,
      });
    }
    onSaveSuccess();
  };

  return (
    <CardComposer
      // Remount on card switch: each edit target gets its own fresh media
      // draft id and dirty-tracking snapshot instead of reusing stale state.
      key={card.id || "new"}
      variant="panel"
      heading={isNewCard ? "Add Card" : "Edit Card"}
      decks={decks}
      allowNewDeck={isNewCard}
      initialFrontDoc={card.frontDoc ?? paragraphDocFromText(card.front)}
      initialBackDoc={card.backDoc ?? paragraphDocFromText(card.back)}
      initialDeckId={card.deckId ?? decks[0]?.id}
      initialFrontLanguage={card.frontLanguage}
      initialMediaUrls={committedMediaUrls}
      onTranslate={onTranslate}
      onDirtyChange={onDirtyStateChange}
      confirmDiscardOnClose
      onCancel={onClose}
      onSave={handleSave}
      stageCardMedia={customStageCardMedia}
      discardMediaDraft={discardDraftBridge}
      searchMultiSourceImages={searchImages}
      stageRemoteCardMedia={stageRemoteImage}
      resolveStagedMedia={resolveStagedMediaBridge}
    />
  );
}
