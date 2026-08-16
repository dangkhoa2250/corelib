import type { KeyboardEvent, ReactNode } from "react";
import { ScrollArea } from "../../components/ScrollArea";

interface ReviewFlashcardProps {
  revealed: boolean;
  onReveal: () => void;
  front: ReactNode;
  backFront: ReactNode;
  back: ReactNode;
  actions?: ReactNode;
}

export function ReviewFlashcard({
  revealed,
  onReveal,
  front,
  backFront,
  back,
  actions,
}: ReviewFlashcardProps) {
  const reveal = () => {
    if (!revealed) onReveal();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.key === "Enter" || event.key === " ") && !revealed) {
      event.preventDefault();
      onReveal();
    }
  };

  return (
    <section
      aria-label="Flashcard"
      className={`review-page__card ${revealed ? "review-page__card--flipped" : ""}`}
      onClick={reveal}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="review-page__card-inner">
        <div className="review-page__card-face review-page__card-face--front">
          <p className="review-page__label">Front</p>
          {actions}
          {!revealed ? (
            <ScrollArea className="review-page__card-face-scroll">
              <div className="review-page__card-center">
                {front}
              </div>
            </ScrollArea>
          ) : (
            <div className="review-page__card-face-scroll">
              <div className="review-page__card-center">
                {front}
              </div>
            </div>
          )}
          <div className="review-page__flip-hint">Tap to flip</div>
        </div>
        <div className="review-page__card-face review-page__card-face--back">
          <p className="review-page__label">Back</p>
          {actions}
          {revealed ? (
            <ScrollArea className="review-page__card-face-scroll">
              <div className="review-page__card-back-content">
                <div className="review-page__back-front">{backFront}</div>
                <hr className="review-page__divider" />
                <div className="review-page__back-main">{back}</div>
              </div>
            </ScrollArea>
          ) : (
            <div className="review-page__card-face-scroll">
              <div className="review-page__card-back-content">
                <div className="review-page__back-front">{backFront}</div>
                <hr className="review-page__divider" />
                <div className="review-page__back-main">{back}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
