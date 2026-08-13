import type { RichDocument } from "./richDocument";

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

/**
 * Media attached to a rich flashcard. Rich documents reference rows by
 * `mediaId`; a media row belongs to the saved card that references it.
 * `cardId` is nullable while the media is staged under a draft.
 */
export type CardMediaSourceType = "file" | "clipboard" | "web";

export interface CardMedia {
  id: string;
  cardId: string | null;
  mimeType: string;
  relativePath: string;
  sourceType: CardMediaSourceType;
  attribution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LearningCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  frontDoc?: RichDocument | null;
  backDoc?: RichDocument | null;
  media?: CardMedia[];
  state: CardState;
  dueAt: string;
  reps: number;
  lapses: number;
  stability: number | null;
  difficulty: number | null;
  lastReviewAt: string | null;
  learningStep: number | null;
  source: CardSource | null;
  tags: string[];
  frontLanguage: string | null;
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

export interface StudyGrant {
  grantToken: string;
  expectedState: CardState;
  expectedDueAt: string;
  card: LearningCard;
  preview: ReviewPreview;
}

export type StudyScope =
  | { kind: "all" }
  | { kind: "deck"; deckId: string };

export interface StudySession {
  sessionId: string;
  scope: StudyScope;
  cards: StudyGrant[];
  counts: { learning: number; review: number; new: number };
  nextLearningDueAt: string | null;
}

export interface StudyRatingInput {
  sessionId: string;
  cardId: string;
  grantToken: string;
  expectedState: CardState;
  expectedDueAt: string;
  rating: ReviewRating;
  elapsedMs: number;
}

export interface StudyRatingResult {
  card: LearningCard;
  reviewLogId: string;
}

export interface StudyReadyCounts {
  learning: number;
  review: number;
  new: number;
  total: number;
}

export interface MemoraSettings {
  newCardsPerDay: number;
  desiredRetention: number;
}

export interface DeckLearningSettings {
  deckId: string;
  inheritedNewCardsPerDay: number;
  newCardsPerDay: number | null;
  effectiveNewCardsPerDay: number;
}

export function isSchedulableCard(card: LearningCard): boolean {
  return (
    card.state !== "suspended" &&
    card.front.trim().length > 0 &&
    card.back.trim().length > 0
  );
}

export function isReadyToReview(card: LearningCard, now: string): boolean {
  return card.state !== "suspended" && (card.state === "new" || card.dueAt <= now);
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

export interface CreateCardInput {
  deckName: string;
  front: string;
  back: string;
  frontDoc?: RichDocument | null;
  backDoc?: RichDocument | null;
  mediaDraftId?: string | null;
  source?: NewCardSource;
  tags?: string[];
  frontLanguage?: string | null;
}

export interface UpdateCardInput {
  cardId: string;
  front: string;
  back: string;
  frontDoc?: RichDocument | null;
  backDoc?: RichDocument | null;
  mediaDraftId?: string | null;
  tags: string[];
  frontLanguage: string | null;
}

export interface UpdateAndMoveCardInput {
  cardId: string;
  front: string;
  back: string;
  frontDoc?: RichDocument | null;
  backDoc?: RichDocument | null;
  mediaDraftId?: string | null;
  tags: string[];
  destinationDeckId: string | null;
  frontLanguage: string | null;
}

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  ar: "Arabic",
  zh: "Chinese",
  nl: "Dutch",
  en: "English",
  fr: "French",
  de: "German",
  el: "Greek",
  he: "Hebrew",
  hi: "Hindi",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  fa: "Persian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  es: "Spanish",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese",
  sgn: "Sign Languages",
};
