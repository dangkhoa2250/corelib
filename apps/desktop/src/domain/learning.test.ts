import { expect, test } from "vitest";

import { isSchedulableCard, type LearningCard } from "./learning";

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
