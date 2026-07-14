import { expect, test } from "vitest";

import { isReadyToReview, isSchedulableCard, type LearningCard } from "./learning";

test("recognizes a complete new learning card as schedulable", () => {
  const card: LearningCard = {
    id: "card-1",
    deckId: "deck-1",
    front: "What does FTS stand for?",
    back: "Full-text search",
    state: "new",
    dueAt: "2026-07-10T09:00:00Z",
    reps: 0,
    lapses: 0,
    stability: 0,
    difficulty: 0,
    lastReviewAt: null,
    source: {
      documentId: "document-1",
      page: 12,
      quote: "Full-text search makes text searchable.",
      rects: [],
    },
    tags: ["search"],
    frontLanguage: null,
  };

  expect(isSchedulableCard(card)).toBe(true);
});

test.each([
  ["suspended", { state: "suspended" as const }],
  ["blank front", { front: "   " }],
  ["blank back", { back: "\n\t" }],
])("does not schedule a card with %s", (_reason, changes) => {
  const card: LearningCard = {
    id: "card-1",
    deckId: "deck-1",
    front: "What does FTS stand for?",
    back: "Full-text search",
    state: "new",
    dueAt: "2026-07-10T09:00:00Z",
    reps: 0,
    lapses: 0,
    stability: 0,
    difficulty: 0,
    lastReviewAt: null,
    source: null,
    tags: [],
    frontLanguage: null,
    ...changes,
  };

  expect(isSchedulableCard(card)).toBe(false);
});

test("includes new cards and already-due cards in a review queue, but excludes future cards", () => {
  const now = "2026-07-14T00:00:00.000Z";
  const card: LearningCard = {
    id: "card-1",
    deckId: "deck-1",
    front: "Question",
    back: "Answer",
    state: "review",
    dueAt: now,
    reps: 1,
    lapses: 0,
    stability: 1,
    difficulty: 1,
    lastReviewAt: null,
    source: null,
    tags: [],
    frontLanguage: null,
  };

  expect(isReadyToReview({ ...card, state: "new" }, now)).toBe(true);
  expect(isReadyToReview(card, now)).toBe(true);
  expect(isReadyToReview({ ...card, dueAt: "2026-07-15T00:00:00.000Z" }, now)).toBe(false);
  expect(isReadyToReview({ ...card, state: "suspended" }, now)).toBe(false);
});
