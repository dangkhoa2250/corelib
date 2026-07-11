import { useEffect, useState } from "react";

import type { Deck, LearningCard, ReviewPreview, ReviewRating } from "../../domain/learning";

interface DeckCardsPageProps {
  deck: Deck;
  onBack: () => void;
  listCards: () => Promise<LearningCard[]>;
  onCreateCard: (front: string, back: string, tags: string[]) => Promise<LearningCard>;
  onDeleteCard: (id: string) => Promise<void>;
  previewCardReview?: (id: string) => Promise<ReviewPreview>;
  onRateCard?: (card: LearningCard, rating: ReviewRating, elapsedMs: number) => Promise<void>;
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
  revealed: boolean;
  setRevealed: (revealed: boolean) => void;
}

function CardRow({ card, onDelete, revealed, setRevealed }: CardRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [card.id]);

  if (confirming) {
    return (
      <div className="memora-flashcard memora-flashcard--confirm">
        <div className="memora-flashcard__inner">
          <div className="memora-flashcard__front memora-card-list__item--confirm">
            <span>Delete this card? This cannot be undone.</span>
            <div className="memora-deck-list__confirm-actions">
              <button
                className="memora-deck-list__delete-confirm"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
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
              <button
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`memora-flashcard ${revealed ? "is-flipped" : ""}`}
      onClick={() => setRevealed(!revealed)}
    >
      <button
        aria-label="Delete card"
        className="memora-flashcard__delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        type="button"
      >
        <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="16">
          <path d="M3 6h18" />
          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
        </svg>
      </button>
      <div className="memora-flashcard__inner">
        <div className="memora-flashcard__front">
          <div className="memora-flashcard__content">{card.front}</div>
          <div className="memora-card-list__hint">Tap to reveal</div>
          {card.tags.length > 0 ? (
            <span className="memora-card-list__tags">{card.tags.join(", ")}</span>
          ) : null}
        </div>
        <div className="memora-flashcard__back">
          {/* Render back content only when revealed to prevent queryByText matching in tests before flip */}
          {revealed ? (
            <div className="memora-flashcard__content memora-flashcard__content--back">{card.back}</div>
          ) : null}
          {card.tags.length > 0 ? (
            <span className="memora-card-list__tags">{card.tags.join(", ")}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];
const labels: Record<ReviewRating, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

export function DeckCardsPage({ deck, onBack, listCards, onCreateCard, onDeleteCard, previewCardReview, onRateCard }: DeckCardsPageProps) {
  const [cards, setCards] = useState<LearningCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [preview, setPreview] = useState<ReviewPreview | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  const [cardStartedAt, setCardStartedAt] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    setError(null);
    listCards()
      .then((loaded) => {
        if (active) {
          setCards(loaded);
          setIndex(0);
        }
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, [listCards]);

  useEffect(() => {
    if (cards) {
      setIndex((current) => Math.max(0, Math.min(current, cards.length - 1)));
    }
  }, [cards]);

  useEffect(() => {
    setRevealed(false);
    setCardStartedAt(Date.now());
    setError(null);
  }, [index]);

  useEffect(() => {
    if (previewCardReview && cards && cards[index]) {
      const promise = previewCardReview(cards[index].id);
      if (promise && typeof promise.then === "function") {
        promise
          .then(setPreview)
          .catch(() => setPreview(null));
      } else {
        setPreview(null);
      }
    } else {
      setPreview(null);
    }
  }, [index, cards, previewCardReview]);

  const submitNewCard = () => {
    const trimmedFront = front.trim();
    const trimmedBack = back.trim();
    if (!trimmedFront || !trimmedBack) return;
    setSaving(true);
    setError(null);
    onCreateCard(trimmedFront, trimmedBack, tagsFromInput(tags))
      .then((card) => {
        setCards((current) => {
          const nextCards = [...(current ?? []), card];
          setIndex(nextCards.length - 1);
          return nextCards;
        });
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

  const handleRateCard = async (rating: ReviewRating) => {
    if (!onRateCard || !cards || !cards[index]) return;
    setSavingRate(true);
    setError(null);
    try {
      const elapsedMs = Date.now() - cardStartedAt;
      await onRateCard(cards[index], rating, elapsedMs);
      if (index < cards.length - 1) {
        setIndex((i) => i + 1);
      } else {
        setRevealed(false);
      }
    } catch (rateError) {
      setError(errorMessage(rateError));
    } finally {
      setSavingRate(false);
    }
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
        <div className="memora-card-slideshow">
          <div className="memora-card-slideshow__counter">
            Card {index + 1} of {cards.length}
          </div>
          <div className="memora-card-slideshow__wrapper">
            <CardRow
              card={cards[index]}
              onDelete={() => handleDeleteCard(cards[index].id)}
              revealed={revealed}
              setRevealed={setRevealed}
            />
          </div>
          {revealed && onRateCard ? (
            <div className="memora-card-slideshow__ratings" role="group" aria-label="Rate card">
              {ratings.map((rating) => {
                const interval = preview?.[rating]?.intervalLabel ?? "";
                return (
                  <button
                    key={rating}
                    disabled={savingRate}
                    type="button"
                    className={`memora-card-slideshow__rate-btn memora-card-slideshow__rate-btn--${rating}`}
                    onClick={() => handleRateCard(rating)}
                  >
                    <span className="memora-card-slideshow__rate-label">{labels[rating]}</span>
                    {interval ? <span className="memora-card-slideshow__rate-interval">{interval}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="memora-card-slideshow__nav">
              <button
                disabled={index === 0}
                onClick={() => setIndex((i) => i - 1)}
                type="button"
                className="memora-card-slideshow__btn"
              >
                ‹ Prev
              </button>
              <button
                disabled={index === cards.length - 1}
                onClick={() => setIndex((i) => i + 1)}
                type="button"
                className="memora-card-slideshow__btn"
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      ) : cards && cards.length === 0 ? (
        <p className="memora-page__empty">This deck has no cards yet.</p>
      ) : null}
    </main>
  );
}
