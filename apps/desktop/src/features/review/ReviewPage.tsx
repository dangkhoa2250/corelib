import { useEffect, useState } from "react";
import type { LearningCard, ReviewPreview, ReviewRating } from "../../domain/learning";

export interface ReviewPageProps {
  cards: LearningCard[];
  previews: Record<string, ReviewPreview>;
  mode?: "study" | "practice";
  onRate: (card: LearningCard, rating: ReviewRating, elapsedMs: number) => Promise<void>;
  onBack?: () => void;
}

const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];
const ratingColors: Record<ReviewRating, string> = {
  again: "#ff3b30",
  hard: "#ff9500",
  good: "#34c759",
  easy: "#0071e3",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type RatingCounts = Record<ReviewRating, number>;

export function ReviewPage({ cards, previews, mode = "study", onRate, onBack }: ReviewPageProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [ratingCounts, setRatingCounts] = useState<RatingCounts>({ again: 0, hard: 0, good: 0, easy: 0 });
  const isPractice = mode === "practice";
  const card = cards[index];
  const preview = card ? previews[card.id] : undefined;

  useEffect(() => {
    if (isPractice) return;
    setIndex((current) => Math.min(current, Math.max(cards.length - 1, 0)));
  }, [cards.length, isPractice]);

  useEffect(() => {
    if (!card) return;
    const start = Date.now();
    setStartedAt(start);
    setNow(start);
    setRevealed(false);
    setError(null);
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [card?.id]);

  const elapsed = Math.max(0, now - startedAt);

  if (!card) {
    if (isPractice) {
      const totalRated = Object.values(ratingCounts).reduce((a, b) => a + b, 0);
      return (
        <main className="review-page review-page--done">
          <div className="review-page__done-content">
            <h1>Practice Complete</h1>
            <p className="review-page__summary-stats">
              Reviewed {totalRated} cards in {formatTime(Math.floor(elapsed / 1000))}
            </p>
            <div className="review-page__summary-grid">
              {ratings.map((r) => (
                <div key={r} className="review-page__summary-item" style={{ "--rating-color": ratingColors[r] } as React.CSSProperties}>
                  <span className="review-page__summary-count">{ratingCounts[r]}</span>
                  <span className="review-page__summary-label">{r === "good" ? "Good" : r.charAt(0).toUpperCase() + r.slice(1)}</span>
                </div>
              ))}
            </div>
            {onBack ? (
              <button type="button" onClick={onBack} className="review-page__back-btn" style={{ marginTop: "24px" }}>
                Back to Deck
              </button>
            ) : null}
          </div>
        </main>
      );
    }
    return (
      <main className="review-page review-page--done">
        <div className="review-page__done-content">
          <h1>Review today</h1>
          <p>Nothing due today</p>
          {onBack ? (
            <button type="button" onClick={onBack} className="review-page__back-btn">
              Back to Library
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  const handleRateCard = async (rating: ReviewRating) => {
    if (isPractice) {
      setRatingCounts((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
      setIndex((current) => current + 1);
    } else {
      setSaving(true);
      setError(null);
      try {
        await onRate(card, rating, Date.now() - startedAt);
        setIndex((current) => current + 1);
      } catch (rateError) {
        setError(errorMessage(rateError));
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <main className="review-page" aria-labelledby="review-title">
      <header className="review-page__header">
        <div className="review-page__header-left">
          {onBack ? (
            <button type="button" onClick={onBack} className="review-page__back-btn">
              &larr; Back
            </button>
          ) : null}
        </div>
        <div className="review-page__progress">
          <div
            className="review-page__progress-bar"
            style={{ width: `${((index + 1) / cards.length) * 100}%` }}
          />
        </div>
        <p className="review-page__count">{index + 1} / {cards.length}</p>
      </header>

      <section
        aria-label="Flashcard"
        className={`review-page__card ${revealed ? "review-page__card--flipped" : ""}`}
        onClick={() => !revealed && setRevealed(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !revealed) {
            e.preventDefault();
            setRevealed(true);
          }
        }}
      >
        <div className="review-page__card-inner">
          <div className="review-page__card-face review-page__card-face--front">
            <div className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              <div className="review-page__content">{card.front}</div>
            </div>
            <div className="review-page__flip-hint">Tap to flip</div>
          </div>
          <div className="review-page__card-face review-page__card-face--back">
            <div className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              <div className="review-page__content review-page__content--small">{card.front}</div>
              <hr className="review-page__divider" />
              <p className="review-page__label">Back</p>
              <div className="review-page__content">{card.back}</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="review-page__footer">
        <p className="review-page__elapsed" aria-live="polite">{formatTime(Math.floor(elapsed / 1000))}</p>
        {revealed ? (
          <div className="review-page__ratings" role="group" aria-label="Rate card">
            {ratings.map((rating) => {
              const interval = !isPractice ? preview?.[rating]?.intervalLabel ?? "" : "";
              return (
                <button
                  key={rating}
                  className="review-page__rating-btn"
                  disabled={saving}
                  style={{ "--rating-color": ratingColors[rating] } as React.CSSProperties}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRateCard(rating);
                  }}
                >
                  <span className="review-page__rating-label">{rating === "good" ? "Good" : rating.charAt(0).toUpperCase() + rating.slice(1)}</span>
                  {interval ? <span className="review-page__rating-interval">{interval}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {error ? <p className="review-page__error" role="alert">{error}</p> : null}
      </footer>
    </main>
  );
}
