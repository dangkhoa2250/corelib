import { useEffect, useState, useCallback } from "react";
import type { Deck, DeckStatistics, CardSource } from "../../domain/learning";
import { getDeckStatistics } from "../../lib/learning";
import { CardBrowser } from "../cards/CardBrowser";
import { SourceViewer } from "../cards/SourceViewer";

export interface DeckDetailPageProps {
  deck: Deck;
  decks: Deck[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  refreshTrigger?: number;
  onBack: () => void;
  onStudyDeck: (deckId: string) => void;
  onPracticeAll: (deckId: string) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
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
  onDirtyStateChange,
  getDocumentFileUrl,
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
  }, [deck.id]);

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
          <header className="deck-detail-page__stats">
            <div className="deck-detail-page__stats-row">
              <div className="deck-detail-page__stats-info">
                <span
                  aria-hidden="true"
                  className="memora-deck-list__dot"
                  style={{ background: deck.color ?? "#8e8e93" }}
                />
                <h1>{deck.name}</h1>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="deck-detail-page__study-btn"
                  disabled={!stats || (stats.newCards === 0 && stats.dueCards === 0)}
                  onClick={() => onStudyDeck(deck.id)}
                  type="button"
                >
                  {stats && stats.newCards + stats.dueCards > 0
                    ? `Study Now (${stats.newCards + stats.dueCards})`
                    : "Nothing due"}
                </button>
                <button
                  className="deck-detail-page__practice-btn"
                  disabled={!stats || stats.totalCards === 0}
                  onClick={() => onPracticeAll(deck.id)}
                  type="button"
                >
                  Practice All ({stats?.totalCards ?? 0})
                </button>
              </div>
            </div>
            {stats ? (
              <div className="deck-detail-page__stats-breakdown">
                <span className="deck-stat-badge deck-stat-badge--new">
                  New: {stats.newCards}
                </span>
                <span className="deck-stat-badge deck-stat-badge--learning">
                  Learning: {stats.learningCards}
                </span>
                <span className="deck-stat-badge deck-stat-badge--due">
                  Due: {stats.dueCards}
                </span>
              </div>
            ) : error ? (
              <p className="deck-detail-page__error">{error}</p>
            ) : (
              <p className="deck-detail-page__loading">Loading statistics...</p>
            )}
          </header>
          <div className="deck-detail-page__card-browser">
            <CardBrowser
              decks={decks}
              initialDeckId={deck.id}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              refreshTrigger={refreshTrigger}
              onBack={onBack}
              onCardChange={handleCardChange}
              onDirtyStateChange={onDirtyStateChange}
              getDocumentFileUrl={getDocumentFileUrl}
              sourceView={sourceView}
              onSourceViewChange={setSourceView}
              hideSourcePanel
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
