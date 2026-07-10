export type CardState =
  | "new"
  | "learning"
  | "review"
  | "relearning"
  | "suspended";

export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardSource {
  documentId: string | null;
  page: number;
  quote: string;
  rects: SelectionRect[];
}

export interface NewCardSource extends Omit<CardSource, "documentId"> {
  documentId: string;
}

export interface LearningCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  state: CardState;
  dueAt: string;
  reps: number;
  lapses: number;
  stability: number | null;
  difficulty: number | null;
  lastReviewAt: string | null;
  source: CardSource | null;
  tags: string[];
}

export interface Deck {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean;
}

export type ReviewPreview = Record<
  ReviewRating,
  { dueAt: string; intervalLabel: string }
>;

export function isSchedulableCard(card: LearningCard): boolean {
  return (
    card.state !== "suspended" &&
    card.front.trim().length > 0 &&
    card.back.trim().length > 0
  );
}
