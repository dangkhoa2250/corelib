import { useEffect, useState } from "react";

import type { Deck, LearningCard } from "../../domain/learning";

interface MemoraPageProps {
  listDecks: () => Promise<Deck[]>;
  listDueCards: () => Promise<LearningCard[]>;
  onReviewToday: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function MemoraPage({ listDecks, listDueCards, onReviewToday }: MemoraPageProps) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([listDecks(), listDueCards()])
      .then(([loadedDecks, dueCards]) => {
        if (!active) return;
        setDecks(loadedDecks);
        setDueCount(dueCards.length);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, [listDecks, listDueCards]);

  return (
    <main className="memora-page">
      <header className="memora-page__header">
        <h1>Memora</h1>
        <button
          disabled={!dueCount}
          onClick={onReviewToday}
          type="button"
        >
          {dueCount ? `Review ${dueCount} due` : "Nothing due today"}
        </button>
      </header>
      {error ? (
        <div role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {decks && decks.length > 0 ? (
        <ul className="memora-deck-list">
          {decks.map((deck) => (
            <li className="memora-deck-list__item" key={deck.id}>
              <span
                aria-hidden="true"
                className="memora-deck-list__dot"
                style={{ background: deck.color ?? "#8e8e93" }}
              />
              <span className="memora-deck-list__name">{deck.name}</span>
              {deck.description ? (
                <span className="memora-deck-list__description">{deck.description}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : decks && decks.length === 0 ? (
        <p className="memora-page__empty">Your decks will appear here.</p>
      ) : null}
    </main>
  );
}
