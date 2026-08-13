import { expect, test } from "vitest";

import {
  isReadyToReview,
  isSchedulableCard,
  type CardMedia,
  type CreateCardInput,
  type LearningCard,
  type UpdateCardInput,
  type UpdateAndMoveCardInput,
} from "./learning";
import type { RichDocument } from "./richDocument";

const simpleDoc: RichDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
};

const baseCard: LearningCard = {
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
  learningStep: null,
  source: null,
  tags: [],
  frontLanguage: null,
};

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
    learningStep: null,
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
    learningStep: null,
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
    learningStep: null,
    source: null,
    tags: [],
    frontLanguage: null,
  };

  expect(isReadyToReview({ ...card, state: "new" }, now)).toBe(true);
  expect(isReadyToReview(card, now)).toBe(true);
  expect(isReadyToReview({ ...card, dueAt: "2026-07-15T00:00:00.000Z" }, now)).toBe(false);
  expect(isReadyToReview({ ...card, state: "suspended" }, now)).toBe(false);
});

test("LearningCard remains valid without rich document fields (backwards compatible)", () => {
  expect(isSchedulableCard(baseCard)).toBe(true);
  expect(baseCard.frontDoc).toBeUndefined();
  expect(baseCard.backDoc).toBeUndefined();
  expect(baseCard.media).toBeUndefined();
});

test("LearningCard accepts optional rich documents and media", () => {
  const media: CardMedia = {
    id: "media-1",
    cardId: null,
    mimeType: "image/png",
    relativePath: "card-media/staging/draft-1/media-1.png",
    sourceType: "web",
    attribution: "Photo by author · CC BY",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };
  const card: LearningCard = {
    ...baseCard,
    frontDoc: simpleDoc,
    backDoc: null,
    media: [media],
  };

  expect(card.frontDoc?.type).toBe("doc");
  expect(card.backDoc).toBeNull();
  expect(card.media).toEqual([media]);
});

test("CardMedia supports all configured source types and nullable attribution", () => {
  const fileMedia: CardMedia = {
    id: "media-2",
    cardId: "card-1",
    mimeType: "image/jpeg",
    relativePath: "card-media/card-1/media-2.jpg",
    sourceType: "file",
    attribution: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };
  const clipboardMedia: CardMedia = { ...fileMedia, id: "media-3", sourceType: "clipboard" };

  expect(fileMedia.sourceType).toBe("file");
  expect(clipboardMedia.sourceType).toBe("clipboard");
  expect(fileMedia.attribution).toBeNull();
});

test("CreateCardInput accepts optional rich documents and media draft id", () => {
  const input: CreateCardInput = {
    deckName: "Spanish",
    front: "gato",
    back: "cat",
    frontDoc: simpleDoc,
    backDoc: null,
    mediaDraftId: "draft-1",
  };

  expect(input.frontDoc?.type).toBe("doc");
  expect(input.mediaDraftId).toBe("draft-1");
});

test("CreateCardInput remains valid with only legacy fields", () => {
  const input: CreateCardInput = {
    deckName: "Spanish",
    front: "gato",
    back: "cat",
  };

  expect(input.frontDoc).toBeUndefined();
  expect(input.mediaDraftId).toBeUndefined();
});

test("UpdateCardInput accepts optional rich documents and media draft id", () => {
  const input: UpdateCardInput = {
    cardId: "card-1",
    front: "gato",
    back: "cat",
    frontDoc: simpleDoc,
    backDoc: simpleDoc,
    mediaDraftId: "draft-1",
    tags: [],
    frontLanguage: null,
  };

  expect(input.backDoc?.type).toBe("doc");
  expect(input.mediaDraftId).toBe("draft-1");
});

test("UpdateAndMoveCardInput accepts optional rich documents and media draft id", () => {
  const input: UpdateAndMoveCardInput = {
    cardId: "card-1",
    front: "gato",
    back: "cat",
    frontDoc: null,
    backDoc: null,
    mediaDraftId: null,
    tags: [],
    destinationDeckId: "deck-2",
    frontLanguage: null,
  };

  expect(input.frontDoc).toBeNull();
  expect(input.mediaDraftId).toBeNull();
  expect(input.destinationDeckId).toBe("deck-2");
});
