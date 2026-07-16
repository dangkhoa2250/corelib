import { useCallback, useEffect, useState } from "react";
import type { LearningCard, ReviewRating, StudyGrant, StudyRatingResult, StudySession } from "../../domain/learning";
import { ClickableFrontText } from "./ClickableFrontText";
import { YouGlishPanel } from "./YouGlishPanel";
import { LanguagePicker } from "../cards/LanguagePicker";
import { detectLanguage } from "../../lib/languageDetector";
import { detectLanguage as detectSpeechLanguage } from "../../lib/language";
import { updateCard } from "../../lib/learning";
import { PronunciationButton } from "../../components/PronunciationButton";

export interface StudyReviewPageProps {
  mode: "study";
  session: StudySession;
  onRate: (sessionId: string, grant: StudyGrant, rating: ReviewRating, elapsedMs: number) => Promise<StudyRatingResult>;
  onRefresh: (sessionId: string) => Promise<StudySession>;
  onBack?: () => void;
}

export interface PracticeReviewPageProps {
  mode: "practice";
  cards: LearningCard[];
  onBack?: () => void;
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

function StudyReviewPage({ session, onRate, onRefresh, onBack }: StudyReviewPageProps) {
  const [current, setCurrent] = useState(session);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());

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
        <main className="review-page review-page--done" aria-labelledby="review-title">
          <div className="review-page__done-content">
            <h1 id="review-title">Review today</h1>
            <div className="review-page__waiting">
              <p>Next learning card is on its way. Check back soon.</p>
            </div>
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
    <main className="review-page" aria-labelledby="review-title">
      <header className="review-page__header">
        <div className="review-page__header-left">
          {onBack ? (
            <button type="button" onClick={onBack} className="review-page__back-btn">
              &larr; Back
            </button>
          ) : null}
        </div>
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
          {revealed ? (
            <div className="review-page__card-face review-page__card-face--back">
              <div className="review-page__card-face-scroll">
                <p className="review-page__label">Front</p>
                <div className="review-page__content review-page__content--small">{card.front}</div>
                <hr className="review-page__divider" />
                <p className="review-page__label">Back</p>
                <div className="review-page__content">{card.back}</div>
              </div>
            </div>
          ) : (
            <div className="review-page__card-face review-page__card-face--front">
              <div className="review-page__card-face-scroll">
                <p className="review-page__label">Front</p>
                <div className="review-page__content">{card.front}</div>
              </div>
              <div className="review-page__flip-hint">Tap to flip</div>
            </div>
          )}
        </div>
      </section>

      <footer className="review-page__footer">
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
                  onClick={(e) => {
                    e.stopPropagation();
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
    </main>
  );
}

function PracticeReviewPage({ cards, onBack }: PracticeReviewPageProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [ratingCounts, setRatingCounts] = useState<RatingCounts>({ again: 0, hard: 0, good: 0, easy: 0 });
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [showYouGlish, setShowYouGlish] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const card = cards[index];

  const handleSelectLanguage = async (lang: string | null) => {
    if (!lang || !card) return;
    try {
      await updateCard({
        cardId: card.id,
        front: card.front,
        back: card.back,
        tags: card.tags,
        frontLanguage: lang,
      });
      card.frontLanguage = lang;
      setRefreshCounter((prev) => prev + 1);
    } catch (err) {
      setError("Failed to update card language.");
    }
  };

  useEffect(() => {
    setSelectedWord(null);
    setShowYouGlish(false);
  }, [card?.id, refreshCounter]);

  useEffect(() => {
    if (!card) return;
    setNow(Date.now());
    setRevealed(false);
    setError(null);
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [card?.id]);

  const elapsed = Math.max(0, now - startedAt);

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
                <span className="review-page__summary-label">{ratingLabel(r)}</span>
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

  const handleRateCard = (rating: ReviewRating) => {
    setRatingCounts((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
    setIndex((current) => current + 1);
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
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <div className="review-page__content">
                  <ClickableFrontText
                    text={card.front}
                    frontLanguage={card.frontLanguage}
                    selectedWord={selectedWord}
                    onWordSelect={(word) => {
                      setSelectedWord(word);
                      setShowYouGlish(true);
                    }}
                  />
                </div>
                <PronunciationButton text={card.front} lang={detectSpeechLanguage(card.front)} />
              </div>
            </div>
            <div className="review-page__flip-hint">Tap to flip</div>
          </div>
          <div className="review-page__card-face review-page__card-face--back">
            <div className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <div className="review-page__content review-page__content--small">
                  <ClickableFrontText
                    text={card.front}
                    frontLanguage={card.frontLanguage}
                    selectedWord={selectedWord}
                    onWordSelect={(word) => {
                      setSelectedWord(word);
                      setShowYouGlish(true);
                    }}
                  />
                </div>
                <PronunciationButton text={card.front} lang={detectSpeechLanguage(card.front)} />
              </div>
              <hr className="review-page__divider" />
              <p className="review-page__label">Back</p>
              <div className="review-page__content">{card.back}</div>
            </div>
          </div>
        </div>
      </section>

      {card && !card.frontLanguage && (
        <div
          style={{
            marginTop: "16px",
            padding: "16px",
            borderRadius: "12px",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            fontSize: "13px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span style={{ fontWeight: 600 }}>
            No confirmed front language. Select a language to enable YouGlish:
          </span>
          <div style={{ width: "260px" }}>
            <LanguagePicker
              value={card.frontLanguage}
              onChange={handleSelectLanguage}
              detectedLanguage={detectLanguage(card.front)}
            />
          </div>
        </div>
      )}

      {showYouGlish && selectedWord && (
        <YouGlishPanel
          word={selectedWord}
          frontLanguage={card.frontLanguage}
          onClose={() => {
            setSelectedWord(null);
            setShowYouGlish(false);
          }}
        />
      )}

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
                onClick={(e) => {
                  e.stopPropagation();
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
    </main>
  );
}
