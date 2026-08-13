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
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [showYouGlish, setShowYouGlish] = useState(false);
  const [sourceView, setSourceView] = useState<CardSource | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedWord(null);
    setShowYouGlish(false);
    setSourceView(null);
  }, [card.id, refreshCounter]);

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
              setSelectedWord(word);
              setShowYouGlish(true);
            }}
          />
        )}
      </div>
      <PronunciationButton text={frontText} lang={detectSpeechLanguage(frontText)} />
      <SourceButton source={card.source} onOpen={setSourceView} />
    </div>
  );

  return (
    <main className="review-page" aria-label={ariaLabel}>
      <div className={`review-page__split${sourceView ? " review-page__split--with-source" : ""}`}>
        <ScrollArea
          className={`review-page__body${showYouGlish && selectedWord ? " review-page__body--with-video" : ""}`}
          data-testid="review-session-surface"
        >
          {header}
          <ReviewFlashcard
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

          {showYouGlish && selectedWord ? (
            <YouGlishPanel
              word={selectedWord}
              frontLanguage={card.frontLanguage}
              onClose={() => {
                setSelectedWord(null);
                setShowYouGlish(false);
              }}
            />
          ) : null}
        </ScrollArea>

        {sourceView && getDocumentFileUrl ? (
          <SourceViewer
            source={sourceView}
            getDocumentFileUrl={getDocumentFileUrl}
            onClose={() => setSourceView(null)}
          />
        ) : null}
      </div>
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
