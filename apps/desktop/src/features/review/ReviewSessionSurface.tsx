import { useEffect, useState, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { CardSource, LearningCard } from "../../domain/learning";
import { derivePlainText, type RichDocument, type RichNode } from "../../domain/richDocument";
import { IconEye } from "../../app/icons";
import { PronunciationButton } from "../../components/PronunciationButton";
import { ScrollArea } from "../../components/ScrollArea";
import { detectLanguage as detectSpeechLanguage } from "../../lib/language";
import { detectLanguage } from "../../lib/languageDetector";
import { updateCard } from "../../lib/learning";
import { resolveCardMedia } from "../../lib/media";
import { LanguagePicker } from "../cards/LanguagePicker";
import { SourceViewer } from "../cards/SourceViewer";
import { ClickableFrontText } from "./ClickableFrontText";
import { ReviewFlashcard } from "./ReviewFlashcard";
import { ReviewMediaModal } from "./ReviewMediaModal";
import { RichDocumentRenderer } from "./RichDocumentRenderer";
import { YouGlishPanel } from "./YouGlishPanel";

interface ReviewSessionSurfaceProps {
  ariaLabel: string;
  card: LearningCard;
  revealed: boolean;
  onReveal: () => void;
  header: ReactNode;
  footer: ReactNode;
  getDocumentFileUrl?: (id: string) => Promise<string>;
  onError: (message: string) => void;
}

function SourceButton({ source, onOpen }: { source?: CardSource | null; onOpen: (source: CardSource) => void }) {
  const isAvailable = Boolean(source?.documentId);

  return (
    <button
      type="button"
      className="review-page__source-btn"
      aria-label={isAvailable ? "View source" : "Source unavailable"}
      title={isAvailable ? "View source" : "The PDF source is no longer available"}
      disabled={!isAvailable}
      onClick={(event) => {
        event.stopPropagation();
        if (source?.documentId) onOpen(source);
      }}
    >
      <IconEye size={14} />
    </button>
  );
}

type ActiveReviewMedia =
  | { kind: "source"; source: CardSource }
  | { kind: "youglish"; word: string }
  | null;

export function ReviewSessionSurface({
  ariaLabel,
  card,
  revealed,
  onReveal,
  header,
  footer,
  getDocumentFileUrl,
  onError,
}: ReviewSessionSurfaceProps) {
  const [activeMedia, setActiveMedia] = useState<ActiveReviewMedia>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setActiveMedia(null);
  }, [card.id, refreshCounter]);

  const selectedWord = activeMedia?.kind === "youglish" ? activeMedia.word : null;

  // Resolve every image mediaId referenced by the card's rich documents into a
  // Tauri asset URL (absolute path from resolve_card_media + convertFileSrc).
  useEffect(() => {
    let cancelled = false;
    const mediaIds = new Set<string>();
    for (const doc of [card.frontDoc, card.backDoc]) {
      if (doc) collectImageMediaIds(doc, mediaIds);
    }
    if (mediaIds.size === 0) {
      setMediaUrls({});
      return;
    }
    void (async () => {
      const entries = await Promise.all(
        [...mediaIds].map(async (mediaId) => {
          try {
            const relative = await resolveCardMedia(card.id, mediaId);
            return [mediaId, convertFileSrc(relative)] as const;
          } catch {
            return [mediaId, ""] as const;
          }
        }),
      );
      if (!cancelled) setMediaUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [card.id, card.frontDoc, card.backDoc]);

  const resolveMedia = (mediaId: string): string => mediaUrls[mediaId] ?? "";

  const handleSelectLanguage = async (lang: string | null) => {
    if (!lang) return;
    try {
      await updateCard({
        cardId: card.id,
        front: card.front,
        back: card.back,
        tags: card.tags,
        frontLanguage: lang,
      });
      card.frontLanguage = lang;
      setRefreshCounter((current) => current + 1);
    } catch {
      onError("Failed to update card language.");
    }
  };

  const frontText = card.frontDoc ? derivePlainText(card.frontDoc) : card.front;

  const frontContent = (small: boolean) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
      <div className={`review-page__content${small ? " review-page__content--small" : ""}`}>
        {card.frontDoc ? (
          <RichDocumentRenderer document={card.frontDoc} resolveMedia={resolveMedia} />
        ) : (
          <ClickableFrontText
            text={card.front}
            frontLanguage={card.frontLanguage}
            selectedWord={selectedWord}
            onWordSelect={(word) => {
              setActiveMedia({ kind: "youglish", word });
            }}
          />
        )}
      </div>
      <PronunciationButton text={frontText} lang={detectSpeechLanguage(frontText)} />
      <SourceButton source={card.source} onOpen={(source) => setActiveMedia({ kind: "source", source })} />
    </div>
  );

  return (
    <main className="review-page" aria-label={ariaLabel}>
      <div className="review-page__split">
        <ScrollArea className="review-page__body" data-testid="review-session-surface">
          {header}
          <ReviewFlashcard
            key={card.id}
            revealed={revealed}
            onReveal={onReveal}
            front={frontContent(false)}
            backFront={frontContent(true)}
            back={
              card.backDoc ? (
                <div className="review-page__content">
                  <RichDocumentRenderer document={card.backDoc} resolveMedia={resolveMedia} />
                </div>
              ) : (
                <div className="review-page__content">{card.back}</div>
              )
            }
          />

          {!card.frontLanguage ? (
            <div className="review-page__language-prompt">
              <span>No confirmed front language. Select a language to enable YouGlish:</span>
              <div className="review-page__language-picker">
                <LanguagePicker
                  value={card.frontLanguage}
                  onChange={handleSelectLanguage}
                  detectedLanguage={detectLanguage(card.front)}
                />
              </div>
            </div>
          ) : null}

          {footer}

        </ScrollArea>
      </div>
      {activeMedia?.kind === "source" && getDocumentFileUrl ? (
        <ReviewMediaModal
          title="Source PDF"
          kind="pdf"
          onClose={() => setActiveMedia(null)}
        >
          <SourceViewer
            source={activeMedia.source}
            getDocumentFileUrl={getDocumentFileUrl}
            onClose={() => setActiveMedia(null)}
            presentation="modal"
          />
        </ReviewMediaModal>
      ) : null}
      {activeMedia?.kind === "youglish" ? (
        <ReviewMediaModal
          title={`Pronunciation for ‘${activeMedia.word}’`}
          kind="video"
          onClose={() => setActiveMedia(null)}
        >
          <YouGlishPanel
            word={activeMedia.word}
            frontLanguage={card.frontLanguage ?? undefined}
          />
        </ReviewMediaModal>
      ) : null}
    </main>
  );
}

function collectImageMediaIds(doc: RichDocument, out: Set<string>): void {
  const visit = (node: RichNode): void => {
    switch (node.type) {
      case "image":
        out.add(node.attrs.mediaId);
        return;
      case "text":
      case "hardBreak":
        return;
      case "doc":
      case "paragraph":
      case "heading":
      case "bulletList":
      case "orderedList":
      case "listItem":
        node.content.forEach(visit);
    }
  };
  doc.content.forEach(visit);
}
