import { useCallback, useEffect, useRef, useState } from "react";
import type { LearningCard, ReviewRating, StudyGrant, StudyRatingResult, StudySession } from "../../domain/learning";
import { ReviewSessionSurface } from "./ReviewSessionSurface";
import { useElapsedTime } from "./useElapsedTime";
import { useActiveTimer } from "../statistics/useActiveTimer";
import { startActivitySession, checkpointActivitySession, finishActivitySession } from "../../lib/statistics";
import type { StatisticsActivityApi } from "../reader/useReadingActivitySession";

function getLocalDay(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().split("T")[0];
}

const defaultActivityApi: StatisticsActivityApi = {
  start: (input) => startActivitySession(input),
  checkpoint: (input) => checkpointActivitySession(input),
  finish: (sessionId, occurredAt) => finishActivitySession({ sessionId, occurredAt }),
};

export interface StudyReviewPageProps {
  mode: "study";
  session: StudySession;
  onRate: (sessionId: string, grant: StudyGrant, rating: ReviewRating, elapsedMs: number) => Promise<StudyRatingResult>;
  onRefresh: (sessionId: string) => Promise<StudySession>;
  onBack?: () => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
}

export interface PracticeReviewPageProps {
  mode: "practice";
  cards: LearningCard[];
  onBack?: () => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
  activityApi?: StatisticsActivityApi;
}

export type ReviewPageProps = StudyReviewPageProps | PracticeReviewPageProps;

const STALE_CARD_MESSAGE = "study card changed; refresh the session";
const STALE_ALERT_MESSAGE = "This card changed elsewhere. Leave this session and start again.";

const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];
const ratingColors: Record<ReviewRating, string> = {
  again: "var(--error)",
  hard: "var(--warning)",
  good: "var(--success)",
  easy: "var(--link)",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ratingLabel(rating: ReviewRating): string {
  return rating === "good" ? "Good" : rating.charAt(0).toUpperCase() + rating.slice(1);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

type RatingCounts = Record<ReviewRating, number>;

export function ReviewPage(props: ReviewPageProps) {
  if (props.mode === "study") {
    return <StudyReviewPage {...props} />;
  }
  return <PracticeReviewPage {...props} />;
}

function StudyReviewPage({ session, onRate, onRefresh, onBack, getDocumentFileUrl }: StudyReviewPageProps) {
  const [current, setCurrent] = useState(session);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const elapsed = useElapsedTime(startedAt);

  useEffect(() => {
    setCurrent(session);
    setIndex(0);
  }, [session]);

  useEffect(() => {
    setRevealed(false);
    setError(null);
    setStartedAt(Date.now());
  }, [index, current.sessionId]);

  const refreshSession = useCallback(async () => {
    setError(null);
    try {
      const next = await onRefresh(current.sessionId);
      setCurrent(next);
      setIndex(0);
      return next;
    } catch (refreshError) {
      setError(errorMessage(refreshError));
      return null;
    }
  }, [current.sessionId, onRefresh]);

  useEffect(() => {
    if (current.cards.length > 0 || !current.nextLearningDueAt) return;
    const delay = Math.max(250, new Date(current.nextLearningDueAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      void refreshSession();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [current.cards.length, current.nextLearningDueAt, refreshSession]);

  const grant = current.cards[index];

  if (!grant) {
    if (current.nextLearningDueAt) {
      return (
        <main className="review-page review-page--done review-page--lowered" aria-labelledby="review-title">
          <div className="review-page__done-content">
            <h1 id="review-title">Review today</h1>
            <div className="review-page__waiting">
              <p>Next learning card is on its way. Check back soon.</p>
            </div>
            {onBack ? (
              <button type="button" onClick={onBack} className="review-page__back-btn">
                &larr; Back
              </button>
            ) : null}
            {error ? <p className="review-page__error" role="alert">{error}</p> : null}
          </div>
        </main>
      );
    }
    return (
      <main className="review-page review-page--done" aria-labelledby="review-title">
        <div className="review-page__done-content">
          <h1 id="review-title">Review today</h1>
          <p>Nothing due today</p>
          {onBack ? (
            <button type="button" onClick={onBack} className="review-page__back-btn">
              Back to Library
            </button>
          ) : null}
          {error ? <p className="review-page__error" role="alert">{error}</p> : null}
        </div>
      </main>
    );
  }

  const card = grant.card;
  const preview = grant.preview;

  const handleRateCard = async (rating: ReviewRating) => {
    setSaving(true);
    setError(null);
    try {
      await onRate(current.sessionId, grant, rating, Date.now() - startedAt);
      await refreshSession();
    } catch (rateError) {
      if (errorMessage(rateError) === STALE_CARD_MESSAGE) {
        setError(STALE_ALERT_MESSAGE);
      } else {
        setError(errorMessage(rateError));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ReviewSessionSurface
      ariaLabel="Review due"
      card={card}
      revealed={revealed}
      onReveal={() => setRevealed(true)}
      getDocumentFileUrl={getDocumentFileUrl}
      onError={setError}
      header={(
        <header className="review-page__header">
          <div className="review-page__header-left">
            {onBack ? (
              <button type="button" onClick={onBack} className="review-page__back-btn">
                &larr; Back
              </button>
            ) : null}
          </div>
        </header>
      )}
      footer={(
        <footer className="review-page__footer">
          <p className="review-page__elapsed" aria-live="polite">
            {formatTime(Math.floor(elapsed / 1000))}
          </p>
          {revealed ? (
            <div className="review-page__ratings" role="group" aria-label="Rate card">
              {ratings.map((rating) => {
                const interval = preview?.[rating]?.intervalLabel ?? "";
                return (
                  <button
                    key={rating}
                    aria-label={ratingLabel(rating)}
                    className="review-page__rating-btn"
                    disabled={saving}
                    style={{ "--rating-color": ratingColors[rating] } as React.CSSProperties}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleRateCard(rating);
                    }}
                  >
                    <span className="review-page__rating-label">{ratingLabel(rating)}</span>
                    {interval ? <span className="review-page__rating-interval">{interval}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {error ? <p className="review-page__error" role="alert">{error}</p> : null}
        </footer>
      )}
    />
  );
}

function PracticeReviewPage({ cards, onBack, getDocumentFileUrl, activityApi }: PracticeReviewPageProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practiceStartedAt] = useState(() => Date.now());
  const [cardStartedAt, setCardStartedAt] = useState(() => Date.now());
  const [ratingCounts, setRatingCounts] = useState<RatingCounts>({ again: 0, hard: 0, good: 0, easy: 0 });

  const card = cards[index];
  const elapsed = useElapsedTime(cardStartedAt, Boolean(card));

  const sessionTimer = useActiveTimer({ running: cards.length > 0 });
  const activitySessionIdRef = useRef<string | null>(null);
  const activityApiRef = useRef(activityApi ?? defaultActivityApi);
  activityApiRef.current = activityApi ?? defaultActivityApi;

  useEffect(() => {
    if (cards.length === 0) return;
    const id = crypto.randomUUID();
    activitySessionIdRef.current = id;
    const now = new Date();
    const deckId = cards[0]!.deckId;
    activityApiRef.current.start({
      id,
      appKey: "memora",
      activityKind: "practice",
      contextKind: "deck",
      contextId: deckId,
      occurredAt: now.toISOString(),
      localDay: getLocalDay(),
      timezoneOffsetMinutes: -now.getTimezoneOffset(),
    }).catch(() => {});
    return () => {
      const sid = activitySessionIdRef.current;
      if (sid) {
        activitySessionIdRef.current = null;
        activityApiRef.current.finish(sid, new Date().toISOString()).catch(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cards.length === 0 || !activitySessionIdRef.current) return;
    const interval = setInterval(() => {
      const id = activitySessionIdRef.current;
      if (!id) return;
      activityApiRef.current.checkpoint({
        sessionId: id,
        occurredAt: new Date().toISOString(),
        activeMs: sessionTimer.snapshot(),
        pageVisitIncrement: 0,
      }).catch(() => {});
    }, 15_000);
    return () => clearInterval(interval);
  }, [cards.length, sessionTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishSession = () => {
    const sid = activitySessionIdRef.current;
    if (sid) {
      activitySessionIdRef.current = null;
      activityApiRef.current.finish(sid, new Date().toISOString()).catch(() => {});
    }
  };

  const handleBack = () => {
    finishSession();
    onBack?.();
  };

  useEffect(() => {
    if (card || cards.length === 0) return;
    finishSession();
  }, [card, cards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!card) return;
    setCardStartedAt(Date.now());
    setRevealed(false);
    setError(null);
  }, [card?.id]);

  const goToPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((current) => Math.max(0, current - 1));
  };

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((current) => Math.min(cards.length - 1, current + 1));
  };

  if (!card) {
    const totalRated = Object.values(ratingCounts).reduce((a, b) => a + b, 0);
    const practiceElapsed = Math.max(0, Date.now() - practiceStartedAt);
    return (
      <main className="review-page review-page--done review-page--lowered">
        <div className="review-page__done-content">
          <h1>Practice Complete</h1>
          <p className="review-page__summary-stats">
            Reviewed {totalRated} cards in {formatTime(Math.floor(practiceElapsed / 1000))}
          </p>
          <div className="review-page__summary-grid">
            {ratings.map((r) => (
              <div key={r} className="review-page__summary-item" style={{ "--rating-color": ratingColors[r] } as React.CSSProperties}>
                <span className="review-page__summary-count">{ratingCounts[r]}</span>
                <span className="review-page__summary-label">{ratingLabel(r)}</span>
              </div>
            ))}
          </div>
          {onBack ? (
            <button type="button" onClick={handleBack} className="review-page__back-btn" style={{ marginTop: "24px" }}>
              Back to Deck
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  const handleRateCard = (rating: ReviewRating) => {
    setRatingCounts((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    setIndex((current) => current + 1);
  };

  return (
    <ReviewSessionSurface
      ariaLabel="Practice"
      card={card}
      revealed={revealed}
      onReveal={() => setRevealed(true)}
      getDocumentFileUrl={getDocumentFileUrl}
      onError={setError}
      header={(
        <header className="review-page__header">
          <div className="review-page__header-left">
            {onBack ? (
              <button type="button" onClick={handleBack} className="review-page__back-btn">
                &larr; Back
              </button>
            ) : null}
          </div>
          <h1 className="review-page__mode-title" id="review-title">Practice</h1>
          <div className="review-page__progress">
            <div
              className="review-page__progress-bar"
              style={{ width: `${((index + 1) / cards.length) * 100}%` }}
            />
          </div>
          <p className="review-page__count">{index + 1} / {cards.length}</p>
          <div className="review-page__nav">
            <button
              type="button"
              className="review-page__nav-btn"
              onClick={goToPrev}
              disabled={index === 0}
              aria-label="Previous card"
            >
              ◀
            </button>
            <button
              type="button"
              className="review-page__nav-btn"
              onClick={goToNext}
              disabled={index >= cards.length - 1}
              aria-label="Next card"
            >
              ▶
            </button>
          </div>
        </header>
      )}
      footer={(
        <footer className="review-page__footer">
          <p className="review-page__elapsed" aria-live="polite">{formatTime(Math.floor(elapsed / 1000))}</p>
          {revealed ? (
            <div className="review-page__ratings" role="group" aria-label="Rate card">
              {ratings.map((rating) => (
                <button
                  key={rating}
                  className="review-page__rating-btn"
                  style={{ "--rating-color": ratingColors[rating] } as React.CSSProperties}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRateCard(rating);
                  }}
                >
                  <span className="review-page__rating-label">{ratingLabel(rating)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {error ? <p className="review-page__error" role="alert">{error}</p> : null}
        </footer>
      )}
    />
  );
}
