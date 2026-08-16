import type { KeyboardEvent, ReactNode } from "react";
import { ScrollArea } from "../../components/ScrollArea";

interface ReviewFlashcardProps {
  revealed: boolean;
  onReveal: () => void;
  front: ReactNode;
  backFront: ReactNode;
  back: ReactNode;
}

export function ReviewFlashcard({
  revealed,
  onReveal,
  front,
  backFront,
  back,
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
          {!revealed ? (
            <ScrollArea className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              {front}
            </ScrollArea>
          ) : (
            <div className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              {front}
            </div>
          )}
          <div className="review-page__flip-hint">Tap to flip</div>
        </div>
        <div className="review-page__card-face review-page__card-face--back">
          {revealed ? (
            <ScrollArea className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              {backFront}
              <hr className="review-page__divider" />
              <p className="review-page__label">Back</p>
              {back}
            </ScrollArea>
          ) : (
            <div className="review-page__card-face-scroll">
              <p className="review-page__label">Front</p>
              {backFront}
              <hr className="review-page__divider" />
              <p className="review-page__label">Back</p>
              {back}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
