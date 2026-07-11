import { useEffect, useState } from "react";
import type { Deck, DeckStatistics } from "../../domain/learning";
import { getDeckStatistics } from "../../lib/learning";
import { CardBrowser } from "../cards/CardBrowser";

export interface DeckDetailPageProps {
  deck: Deck;
  decks: Deck[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  refreshTrigger?: number;
  onBack: () => void;
  onStudyDeck: (deckId: string) => void;
  onDirtyStateChange?: (dirty: boolean) => void;
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
  onDirtyStateChange,
}: DeckDetailPageProps) {
  const [stats, setStats] = useState<DeckStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDeckStatistics(deck.id)
      .then(setStats)
      .catch((e) => {
        setError(errorMessage(e));
        setStats(null);
      });
  }, [deck.id]);

  return (
    <main className="deck-detail-page">
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
          <button
            className="deck-detail-page__study-btn"
            disabled={!stats || stats.dueCards === 0}
            onClick={() => onStudyDeck(deck.id)}
            type="button"
          >
            {stats && stats.dueCards > 0 ? `Study Now (${stats.dueCards})` : "Nothing due"}
          </button>
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
          onDirtyStateChange={onDirtyStateChange}
        />
      </div>
    </main>
  );
}
