import { expect, test } from "@playwright/test";

type CardState = "new" | "learning" | "relearning" | "review" | "suspended";
type ReviewRating = "again" | "hard" | "good" | "easy";
type StudyScope = { kind: "all" } | { kind: "deck"; deckId: string };

interface LearningCard {
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
  learningStep: number | null;
  source: string | null;
  tags: string[];
  frontLanguage: string | null;
  deletedAt?: string | null;
  deletedFromDeckName?: string | null;
}

interface ReviewPreview {
  again: { dueAt: string; intervalLabel: string };
  hard: { dueAt: string; intervalLabel: string };
  good: { dueAt: string; intervalLabel: string };
  easy: { dueAt: string; intervalLabel: string };
}

interface StudyGrant {
  grantToken: string;
  expectedState: CardState;
  expectedDueAt: string;
  card: LearningCard;
  preview: ReviewPreview;
}

interface StudySession {
  sessionId: string;
  scope: StudyScope;
  cards: StudyGrant[];
  counts: { learning: number; review: number; new: number };
  nextLearningDueAt: string | null;
}

interface MemoraSettings {
  newCardsPerDay: number;
  desiredRetention: number;
}

function installLearningMock({
  seedCards,
  learningDelayMs = 60_000,
}: {
  seedCards: LearningCard[];
  learningDelayMs?: number;
}) {
  const window = globalThis as unknown as Window;

  function previewFor(state: CardState, learningStep: number | null): ReviewPreview {
    const iso = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
    const label = (seconds: number) => (seconds >= 60 ? `${Math.round(seconds / 60)}m` : `${seconds}s`);
    const sec = state === "new" || state === "learning" ? (learningStep === 1 ? 600 : 60) : 60;
    const hard = state === "new" || state === "learning" ? (learningStep === 1 ? 600 : 360) : 360;
    const good = state === "new" || state === "learning" ? (learningStep === 1 ? 600 : 600) : 600;
    const easy = state === "new" ? 600 : 600;
    return {
      again: { dueAt: iso(sec), intervalLabel: label(sec) },
      hard: { dueAt: iso(hard), intervalLabel: label(hard) },
      good: { dueAt: iso(good), intervalLabel: label(good) },
      easy: { dueAt: iso(easy), intervalLabel: label(easy) },
    };
  }

  function applyScheduling(
    state: CardState,
    learningStep: number | null,
    rating: ReviewRating,
  ): { state: CardState; learningStep: number | null; intervalLabel: string } {
    if (state === "new") {
      if (rating === "again") return { state: "learning", learningStep: 0, intervalLabel: "1m" };
      if (rating === "hard") return { state: "learning", learningStep: 0, intervalLabel: "6m" };
      if (rating === "good") return { state: "learning", learningStep: 1, intervalLabel: "10m" };
      return { state: "review", learningStep: null, intervalLabel: "4d" };
    }
    if (state === "learning") {
      const step = learningStep ?? 0;
      if (rating === "again") return { state: "learning", learningStep: 0, intervalLabel: "1m" };
      if (rating === "hard") return { state: "learning", learningStep: step, intervalLabel: "6m" };
      if (rating === "good") {
        return step === 0
          ? { state: "learning", learningStep: 1, intervalLabel: "10m" }
          : { state: "review", learningStep: null, intervalLabel: "4d" };
      }
      return { state: "review", learningStep: null, intervalLabel: "4d" };
    }
    return { state: "review", learningStep: null, intervalLabel: "4d" };
  }

    const deck = {
      id: "deck-1",
      name: "Biology",
      description: null,
      color: "#ff9500",
      archived: false,
    };
    const cards: LearningCard[] = seedCards.map((card) => ({ ...card }));

    let memoraSettings: MemoraSettings = { newCardsPerDay: 20, desiredRetention: 0.9 };
    const deckOverrides = new Map<string, number | null>();
    const reviewLogs: Array<{ cardId: string; rating: ReviewRating }> = [];
    const sessions = new Map<string, StudySession>();
    let sessionCounter = 0;

    const browserRow = (card: LearningCard) => ({
      ...card,
      deckName: deck.name,
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
      deletedAt: card.deletedAt ?? null,
      deletedFromDeckName: card.deletedFromDeckName ?? null,
    });

    const resolvedDeckSettings = (deckId: string) => {
      const override = deckOverrides.get(deckId) ?? null;
      const inherited = memoraSettings.newCardsPerDay;
      return {
        deckId,
        inheritedNewCardsPerDay: inherited,
        newCardsPerDay: override,
        effectiveNewCardsPerDay: override ?? inherited,
      };
    };

    const readyCounts = () => {
      const introduced = new Set(reviewLogs.map((log) => log.cardId));
      let learning = 0;
      let review = 0;
      let newCount = 0;
      const now = Date.now();
      for (const card of cards) {
        if (card.state === "learning" || card.state === "relearning") {
          if (new Date(card.dueAt).getTime() <= now) learning += 1;
        } else if (card.state === "review") {
          if (new Date(card.dueAt).getTime() <= now) review += 1;
        } else if (card.state === "new" && !introduced.has(card.id)) {
          newCount += 1;
        }
      }
      const newCapped = Math.max(0, Math.min(newCount, memoraSettings.newCardsPerDay));
      return { learning, review, new: newCapped, total: learning + review + newCapped };
    };

    const grantFor = (card: LearningCard, expectedState: CardState): StudyGrant => ({
      grantToken: `grant-${card.id}-${Math.random().toString(36).slice(2, 8)}`,
      expectedState,
      expectedDueAt: card.dueAt,
      card: { ...card },
      preview: previewFor(card.state, card.learningStep),
    });

    const buildSession = (scope: StudyScope): StudySession => {
      sessionCounter += 1;
      const sessionId = `session-${sessionCounter}`;
      const scopeCards =
        scope.kind === "deck" ? cards.filter((card) => card.deckId === scope.deckId) : cards.slice();
      const now = Date.now();
      const selected = scopeCards
        .filter((card) => card.state === "new")
        .slice(0, memoraSettings.newCardsPerDay)
        .concat(
          scopeCards.filter(
            (card) =>
              (card.state === "learning" || card.state === "relearning") &&
              new Date(card.dueAt).getTime() <= now,
          ),
        )
        .concat(
          scopeCards.filter(
            (card) => card.state === "review" && new Date(card.dueAt).getTime() <= now,
          ),
        );
      const grants = selected.map((card) => grantFor(card, card.state));
      const counts = {
        learning: grants.filter((grant) => grant.card.state === "learning" || grant.card.state === "relearning")
          .length,
        review: grants.filter((grant) => grant.card.state === "review").length,
        new: grants.filter((grant) => grant.card.state === "new").length,
      };
      const dueLearning = scopeCards
        .filter(
          (card) =>
            (card.state === "learning" || card.state === "relearning") &&
            new Date(card.dueAt).getTime() > now,
        )
        .map((card) => card.dueAt)
        .sort();
      const session: StudySession = {
        sessionId,
        scope,
        cards: grants,
        counts,
        nextLearningDueAt: dueLearning.length > 0 ? dueLearning[0] : null,
      };
      sessions.set(sessionId, session);
      return session;
    };

    const applyRating = (card: LearningCard, rating: ReviewRating) => {
      const result = applyScheduling(card.state, card.learningStep, rating);
      card.state = result.state;
      card.learningStep = result.learningStep;
      card.reps += 1;
      if (rating === "again") card.lapses += 1;
      card.lastReviewAt = new Date().toISOString();
      card.dueAt = new Date(Date.now() + learningDelayMs).toISOString();
      reviewLogs.push({ cardId: card.id, rating });
      return result.intervalLabel;
    };

    Object.assign(window, {
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: "main" } },
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          if (command === "account_session") {
            return {
              profile: {
                id: "e2e-user",
                displayName: "E2E User",
                email: "e2e@example.test",
                status: "approved",
                role: "member",
                analyticsEnabled: true,
              },
              entitlements: { featureKeys: [], refreshedAt: "2026-07-16T00:00:00Z" },
            };
          }
          if (command === "list_documents") return [];
          if (command === "list_decks") return [deck];
          if (command === "list_active_tags") return [];
          if (command === "search_everything") return [];

          if (command === "get_study_ready_counts") return readyCounts();

          if (command === "get_deck_statistics") {
            const counts = readyCounts();
            return {
              totalCards: cards.length,
              newCards: counts.new,
              learningCards: counts.learning,
              reviewCards: counts.review,
              relearningCards: 0,
              suspendedCards: 0,
              dueCards: counts.review + counts.learning,
            };
          }

          if (command === "list_deck_cards") {
            return cards
              .filter((card) => card.deckId === (args.deckId as string))
              .filter((card) => card.state !== "suspended")
              .map((card) => ({ ...card }));
          }

          if (command === "create_card") {
            const input = args.input as Record<string, unknown>;
            const card: LearningCard = {
              id: `card-${cards.length + 1}`,
              deckId: deck.id,
              front: input.front as string,
              back: input.back as string,
              state: "new",
              dueAt: "2026-07-11T00:00:00.000Z",
              reps: 0,
              lapses: 0,
              stability: null,
              difficulty: null,
              lastReviewAt: null,
              learningStep: null,
              source: null,
              tags: (input.tags as string[]) ?? [],
              frontLanguage: null,
            };
            cards.push(card);
            return card;
          }

          if (command === "query_deck_cards") {
            const payload = args.payload as { deckId: string };
            const rows = cards
              .filter((card) => !card.deletedAt)
              .filter((card) => !payload.deckId || card.deckId === payload.deckId)
              .map(browserRow);
            return { rows, total: rows.length, nextCursor: null };
          }

          if (command === "trash_cards") {
            const ids = args.cardIds as string[];
            cards.forEach((card) => {
              if (ids.includes(card.id)) {
                card.deletedAt = "2026-07-11T01:00:00.000Z";
                card.deletedFromDeckName = deck.name;
              }
            });
            return { affectedIds: ids, affectedCount: ids.length };
          }

          if (command === "list_trashed_cards") {
            const rows = cards.filter((card) => card.deletedAt).map(browserRow);
            return { rows, total: rows.length, nextCursor: null };
          }

          if (command === "restore_cards") {
            const ids = args.cardIds as string[];
            cards.forEach((card) => {
              if (ids.includes(card.id)) {
                card.deletedAt = null;
                card.deletedFromDeckName = null;
              }
            });
            return { affectedIds: ids, affectedCount: ids.length };
          }

          if (command === "delete_cards_permanently") {
            const ids = args.cardIds as string[];
            for (let index = cards.length - 1; index >= 0; index -= 1) {
              if (ids.includes(cards[index].id)) cards.splice(index, 1);
            }
            return { affectedIds: ids, affectedCount: ids.length };
          }

          if (command === "start_study_session") return buildSession(args.scope as StudyScope);

          if (command === "refresh_study_session") {
            const session = sessions.get(args.sessionId as string);
            if (!session) throw new Error("study session expired");
            return buildSession(session.scope);
          }

          if (command === "rate_study_card") {
            const payload = args as {
              cardId: string;
              rating: ReviewRating;
            };
            const card = cards.find((entry) => entry.id === payload.cardId);
            if (!card) throw new Error(`card not found: ${payload.cardId}`);
            const intervalLabel = applyRating(card, payload.rating);
            return { card: { ...card }, reviewLogId: `log-${reviewLogs.length}`, intervalLabel };
          }

          if (command === "get_memora_settings") return { ...memoraSettings };
          if (command === "update_memora_settings") {
            memoraSettings = { ...memoraSettings, ...(args.settings as Partial<MemoraSettings>) };
            return { ...memoraSettings };
          }

          if (command === "get_deck_learning_settings") {
            return resolvedDeckSettings(args.deckId as string);
          }
          if (command === "update_deck_learning_settings") {
            const payload = args.payload as { deckId: string; newCardsPerDay: number | null };
            deckOverrides.set(payload.deckId, payload.newCardsPerDay);
            return resolvedDeckSettings(payload.deckId);
          }

          throw new Error(`Unhandled Tauri command: ${command}`);
        },
      },
    });
}

test("manages a card through Browser and Trash lifecycle", async ({ page }) => {
  const seed: LearningCard[] = [];
  await page.addInitScript(installLearningMock, { seedCards: seed });

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("http://127.0.0.1:1421");
  await expect(page.getByRole("button", { name: "Memora" })).toBeVisible();

  await page.getByRole("button", { name: "Memora" }).click();
  await page.getByRole("button", { name: "Biology", exact: true }).click();
  await page.getByRole("button", { name: "Add Card" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add Card" });
  await addDialog.getByRole("textbox", { name: "Front", exact: true }).fill("What is ATP?");
  await addDialog.getByRole("textbox", { name: "Back", exact: true }).fill("Adenosine triphosphate");
  await addDialog.getByRole("textbox", { name: "Tags", exact: true }).fill("biology");
  await addDialog.getByRole("button", { name: "Add Card" }).click();
  await expect(page.getByText("What is ATP?")).toBeVisible();

  await page.getByRole("checkbox").nth(1).check();
  await page.locator(".card-browser__bulk-banner").getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.getByText("What is ATP?")).toHaveCount(0);

  await page.getByLabel("Primary").getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.getByText("What is ATP?")).toBeVisible();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Restore to Original Deck" }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();

  await page.getByRole("button", { name: "Memora" }).click();
  await page.getByRole("button", { name: "Biology", exact: true }).click();
  await expect(page.getByText("What is ATP?")).toBeVisible();
  await page.getByRole("checkbox").nth(1).check();
  await page.locator(".card-browser__bulk-banner").getByRole("button", { name: "Trash", exact: true }).click();

  await page.getByLabel("Primary").getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Delete Permanently" }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();
});

test("learns and practices a card without changing the real schedule", async ({ page }) => {
  const seed: LearningCard[] = [
    {
      id: "card-1",
      deckId: "deck-1",
      front: "What is ATP?",
      back: "Adenosine triphosphate",
      state: "new",
      dueAt: "2026-07-11T00:00:00.000Z",
      reps: 0,
      lapses: 0,
      stability: null,
      difficulty: null,
      lastReviewAt: null,
      learningStep: null,
      source: null,
      tags: [],
      frontLanguage: null,
    },
  ];
  await page.addInitScript(installLearningMock, { seedCards: seed, learningDelayMs: 1_500 });

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("http://127.0.0.1:1421");

  await page.getByRole("button", { name: "Memora" }).click();
  await expect(page.getByRole("button", { name: "Biology", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Review/ }).click();

  const flashcard = page.getByRole("button", { name: "Flashcard" });
  await expect(flashcard).toBeVisible();
  await flashcard.click();

  await page.getByRole("button", { name: "Again" }).click();

  await expect(page.getByText(/Next learning card is on its way|1m/)).toBeVisible();

  await expect(flashcard).toBeVisible();
});

test("changes settings and deck override", async ({ page }) => {
  const seed: LearningCard[] = [
    {
      id: "card-1",
      deckId: "deck-1",
      front: "What is ATP?",
      back: "Adenosine triphosphate",
      state: "review",
      dueAt: "2026-07-10T00:00:00.000Z",
      reps: 3,
      lapses: 1,
      stability: 4.2,
      difficulty: 5.1,
      lastReviewAt: "2026-07-10T00:00:00.000Z",
      learningStep: null,
      source: null,
      tags: [],
      frontLanguage: null,
    },
  ];
  await page.addInitScript(installLearningMock, { seedCards: seed });

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("http://127.0.0.1:1421");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("button", { name: "Memora", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Memora", exact: true }).click();

  await page.getByRole("spinbutton", { name: "New cards per day" }).fill("0");
  await page.getByRole("button", { name: "Save Memora settings" }).click();

  await page.getByRole("button", { name: "Back to app" }).click();
  await page.getByRole("button", { name: "Memora" }).click();

  const counts = await page.evaluate(() => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string) => Promise<{ new: number; review: number; total: number }> };
      }
    ).__TAURI_INTERNALS__.invoke;
    return invoke("get_study_ready_counts");
  });
  expect(counts.new).toBe(0);
  expect(counts.review).toBeGreaterThan(0);

  await page.getByLabel("Actions for Biology").click();
  await page.getByRole("button", { name: "Learning settings" }).click();

  await page.getByRole("radio", { name: "Custom limit" }).check();
  await page.getByRole("spinbutton", { name: "Custom new cards per day" }).fill("5");
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByLabel("Actions for Biology").click();
  await page.getByRole("button", { name: "Learning settings" }).click();
  await expect(page.getByRole("spinbutton", { name: "Custom new cards per day" })).toHaveValue("5");
  await expect(page.getByRole("radio", { name: "Custom limit" })).toBeChecked();
});
