import { useEffect, useState, useCallback } from "react";
import type { Deck, DeckStatistics, CardSource } from "../../domain/learning";
import { CardBrowser, type CardBrowserProps } from "../cards/CardBrowser";
import { SourceViewer } from "../cards/SourceViewer";
import { Button } from "../../components/Button";

export interface DeckDetailPageProps {
  deck: Deck;
  decks: Deck[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  refreshTrigger?: number;
  initialSearch?: string;
  onBack: () => void;
  onStudyDeck: (deckId: string) => void;
  onPracticeAll: (deckId: string) => void;
  onViewStatistics?: (deckId: string) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  onTranslate?: CardBrowserProps["onTranslate"];
  getDocumentFileUrl?: (id: string) => Promise<string>;
  getDeckStatistics: (deckId: string) => Promise<DeckStatistics>;
  queryDeckCards: NonNullable<CardBrowserProps["queryDeckCards"]>;
  moveCards: NonNullable<CardBrowserProps["moveCards"]>;
  setCardsSuspended: NonNullable<CardBrowserProps["setCardsSuspended"]>;
  trashCards: NonNullable<CardBrowserProps["trashCards"]>;
  listActiveTags: NonNullable<CardBrowserProps["listActiveTags"]>;
  createCard: NonNullable<CardBrowserProps["createCard"]>;
  updateAndMoveCard: NonNullable<CardBrowserProps["updateAndMoveCard"]>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DeckDetailPage({
  deck,
  decks,
  selectedIds,
  setSelectedIds,
  refreshTrigger,
  onBack,
  onStudyDeck,
  onPracticeAll,
  onViewStatistics,
  onDirtyStateChange,
  onTranslate,
  getDocumentFileUrl,
  getDeckStatistics,
  queryDeckCards,
  moveCards,
  setCardsSuspended,
  trashCards,
  listActiveTags,
  createCard,
  updateAndMoveCard,
  initialSearch,
}: DeckDetailPageProps) {
  const [stats, setStats] = useState<DeckStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceView, setSourceView] = useState<CardSource | null>(null);

  const refreshStats = useCallback(() => {
    getDeckStatistics(deck.id)
      .then(setStats)
      .catch((e) => {
        setError(errorMessage(e));
        setStats(null);
      });
  }, [deck.id, getDeckStatistics]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const handleCardChange = useCallback(() => {
    refreshStats();
  }, [refreshStats]);

  return (
    <main className="deck-detail-page">
      <div className="deck-detail-page__split">
        <div className="deck-detail-page__body">
          {error ? <p className="deck-detail-page__error">{error}</p> : null}
          <div className="deck-detail-page__card-browser">
            <CardBrowser
              decks={decks}
              initialDeckId={deck.id}
              initialSearch={initialSearch}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              refreshTrigger={refreshTrigger}
              onBack={onBack}
              onCardChange={handleCardChange}
              onDirtyStateChange={onDirtyStateChange}
              onTranslate={onTranslate}
              getDocumentFileUrl={getDocumentFileUrl}
              sourceView={sourceView}
              onSourceViewChange={setSourceView}
              queryDeckCards={queryDeckCards}
              moveCards={moveCards}
              setCardsSuspended={setCardsSuspended}
              trashCards={trashCards}
              listActiveTags={listActiveTags}
              createCard={createCard}
              updateAndMoveCard={updateAndMoveCard}
              hideSourcePanel
              headerTitle={`${deck.name} Card Browser`}
              headerActions={(
                <>
                  {onViewStatistics && (
                    <Button
                      onClick={() => onViewStatistics(deck.id)}
                      variant="secondary"
                    >
                      Statistics
                    </Button>
                  )}
                  <Button
                    disabled={!(stats && stats.newCards + stats.dueCards > 0)}
                    onClick={() => onStudyDeck(deck.id)}
                    variant="secondary"
                  >
                    Review Due
                  </Button>
                  <Button
                    disabled={!stats?.totalCards}
                    onClick={() => onPracticeAll(deck.id)}
                    variant="secondary"
                  >
                    Practice All
                  </Button>
                </>
              )}
            />
          </div>
        </div>
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
