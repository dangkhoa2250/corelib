import { useEffect, useMemo, useState } from "react";
import type { LearningCard, ReviewPreview, ReviewRating } from "../../domain/learning";

export interface ReviewPageProps {
  cards: LearningCard[];
  previews: Record<string, ReviewPreview>;
  onRate: (card: LearningCard, rating: ReviewRating, elapsedMs: number) => Promise<void>;
  onShowSource: (card: LearningCard) => void;
  onBack?: () => void;
}

const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];
const labels: Record<ReviewRating, string> = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function ReviewPage({ cards, previews, onRate, onShowSource, onBack }: ReviewPageProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [, tick] = useState(0);
  const card = cards[index];
  const preview = card ? previews[card.id] : undefined;
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(cards.length - 1, 0)));
  }, [cards.length]);
  useEffect(() => {
    if (!card) return;
    setStartedAt(Date.now()); setRevealed(false); setError(null);
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [card?.id]);
  const elapsed = useMemo(() => Math.max(0, Date.now() - startedAt), [startedAt]);
  if (!card) return <main><h1>Review today</h1>{onBack ? <button type="button" onClick={onBack}>Back to Library</button> : null}<p>Nothing due today</p></main>;
  return (
    <main aria-labelledby="review-title" className="review-page">
      <header><h1 id="review-title">Review today</h1>{onBack ? <button type="button" onClick={onBack}>Back to Library</button> : null}<p>{index + 1} of {cards.length}</p></header>
      <section aria-label="Flashcard" className="review-page__card">
        <p className="review-page__label">Front</p><div>{card.front}</div>
        {revealed ? <><p className="review-page__label">Back</p><div>{card.back}</div></> : null}
        <p aria-live="polite">Elapsed {Math.floor(elapsed / 1000)}s</p>
        {!revealed ? <button type="button" onClick={() => setRevealed(true)}>Show answer</button> : null}
        <button type="button" onClick={() => {
          if (!card.source?.documentId) { setError("Source is unavailable."); return; }
          onShowSource(card);
        }}>Show source</button>
        {error ? <div role="alert">{error}</div> : null}
        {revealed ? <div role="group" aria-label="Rate card">
          {ratings.map((rating) => {
            const interval = preview?.[rating]?.intervalLabel ?? "";
            return <button key={rating} disabled={saving} type="button" onClick={async () => {
              setSaving(true); setError(null);
              try { await onRate(card, rating, Date.now() - startedAt); setIndex((current) => current + 1); }
              catch (rateError) { setError(errorMessage(rateError)); }
              finally { setSaving(false); }
            }}>{labels[rating]}{interval ? ` ${interval}` : ""}</button>;
          })}
        </div> : null}
      </section>
    </main>
  );
}
