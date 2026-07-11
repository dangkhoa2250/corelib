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

export interface DeckStatistics {
  totalCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  relearningCards: number;
  suspendedCards: number;
  dueCards: number;
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

export type CardLifecycleState = "new" | "learning" | "review" | "relearning" | "suspended";
export type CardSort = "updated_desc" | "created_desc" | "due_asc" | "front_asc";
export type TrashSort = "deleted_desc" | "front_asc";

export interface CardBrowserQuery {
  deckId: string;
  query: string;
  states: CardLifecycleState[];
  tags: string[];
  sort: CardSort;
  cursor: string | null;
  limit: number;
}

export interface CardBrowserRow extends Omit<LearningCard, "deckId"> {
  deckId: string | null;
  deckName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedFromDeckName: string | null;
}

export interface CardPage {
  rows: CardBrowserRow[];
  total: number;
  nextCursor: string | null;
}

export interface TrashQuery {
  query: string;
  sort: TrashSort;
  cursor: string | null;
  limit: number;
}

export interface BulkCardsInput {
  cardIds: string[];
}

export interface BulkResult {
  affectedIds: string[];
  affectedCount: number;
}

export interface UpdateCardInput {
  cardId: string;
  front: string;
  back: string;
  tags: string[];
}

export interface UpdateAndMoveCardInput {
  cardId: string;
  front: string;
  back: string;
  tags: string[];
  destinationDeckId: string | null;
}
