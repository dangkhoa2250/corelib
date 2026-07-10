import { useEffect, useState } from "react";

import type { Deck, LearningCard } from "../../domain/learning";

interface DeckCardsPageProps {
  deck: Deck;
  onBack: () => void;
  listCards: () => Promise<LearningCard[]>;
  onCreateCard: (front: string, back: string, tags: string[]) => Promise<LearningCard>;
  onDeleteCard: (id: string) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tagsFromInput(tags: string): string[] {
  return [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

interface CardRowProps {
  card: LearningCard;
  onDelete: () => Promise<void>;
}

function CardRow({ card, onDelete }: CardRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revealed, setRevealed] = useState(false);

  if (confirming) {
    return (
      <li className="memora-card-list__item memora-card-list__item--confirm">
        <span>Delete this card? This cannot be undone.</span>
        <div className="memora-deck-list__confirm-actions">
          <button
            className="memora-deck-list__delete-confirm"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              void onDelete().finally(() => {
                setDeleting(false);
                setConfirming(false);
              });
            }}
            type="button"
          >
            Delete
          </button>
          <button disabled={deleting} onClick={() => setConfirming(false)} type="button">
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="memora-card-list__item">
      <button
        aria-expanded={revealed}
        className="memora-card-list__flip"
        onClick={() => setRevealed((current) => !current)}
        type="button"
      >
        <span className="memora-card-list__front">{card.front}</span>
        {revealed ? (
          <span className="memora-card-list__back">{card.back}</span>
        ) : (
          <span className="memora-card-list__hint">Tap to reveal</span>
        )}
        {card.tags.length > 0 ? (
          <span className="memora-card-list__tags">{card.tags.join(", ")}</span>
        ) : null}
      </button>
      <button
        aria-label="Delete card"
        className="memora-deck-list__menu-trigger"
        onClick={() => setConfirming(true)}
        type="button"
      >
        <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16">
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
        </svg>
      </button>
    </li>
  );
}

export function DeckCardsPage({ deck, onBack, listCards, onCreateCard, onDeleteCard }: DeckCardsPageProps) {
  const [cards, setCards] = useState<LearningCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setError(null);
    listCards()
      .then((loaded) => {
        if (active) setCards(loaded);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, [listCards]);

  const submitNewCard = () => {
    const trimmedFront = front.trim();
    const trimmedBack = back.trim();
    if (!trimmedFront || !trimmedBack) return;
    setSaving(true);
    setError(null);
    onCreateCard(trimmedFront, trimmedBack, tagsFromInput(tags))
      .then((card) => {
        setCards((current) => [...(current ?? []), card]);
        setFront("");
        setBack("");
        setTags("");
        setAdding(false);
      })
      .catch((createError) => setError(errorMessage(createError)))
      .finally(() => setSaving(false));
  };

  const handleDeleteCard = (id: string) => {
    setError(null);
    return onDeleteCard(id)
      .then(() => {
        setCards((current) => (current ?? []).filter((card) => card.id !== id));
      })
      .catch((deleteError) => setError(errorMessage(deleteError)));
  };

  return (
    <main className="memora-page">
      <header className="memora-page__header">
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <button className="memora-deck-cards__back" onClick={onBack} type="button">
            ‹ Memora
          </button>
          <h1>{deck.name}</h1>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} type="button">
            Add Card
          </button>
        )}
      </header>
      {error ? (
        <div role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {adding && (
        <form
          className="memora-card-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitNewCard();
          }}
        >
          <label>
            Front
            <textarea
              aria-label="Front"
              autoFocus
              disabled={saving}
              onChange={(event) => setFront(event.target.value)}
              rows={3}
              value={front}
            />
          </label>
          <label>
            Back
            <textarea
              aria-label="Back"
              disabled={saving}
              onChange={(event) => setBack(event.target.value)}
              rows={3}
              value={back}
            />
          </label>
          <label>
            Tags
            <input
              aria-label="Tags"
              disabled={saving}
              onChange={(event) => setTags(event.target.value)}
              placeholder="e.g. algebra, definitions"
              value={tags}
            />
          </label>
          <div className="memora-card-form__actions">
            <button disabled={saving || !front.trim() || !back.trim()} type="submit">
              Save
            </button>
            <button
              disabled={saving}
              onClick={() => {
                setAdding(false);
                setFront("");
                setBack("");
                setTags("");
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {cards && cards.length > 0 ? (
        <ul className="memora-card-list">
          {cards.map((card) => (
            <CardRow card={card} key={card.id} onDelete={() => handleDeleteCard(card.id)} />
          ))}
        </ul>
      ) : cards && cards.length === 0 ? (
        <p className="memora-page__empty">This deck has no cards yet.</p>
      ) : null}
    </main>
  );
}
