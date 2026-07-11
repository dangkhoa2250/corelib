import { expect, test } from "@playwright/test";

test("manages a card through Browser and Trash lifecycle", async ({ page }) => {
  await page.addInitScript(() => {
    const deck = {
      id: "deck-1",
      name: "Biology",
      description: null,
      color: "#ff9500",
      archived: false,
    };
    const cards: Array<Record<string, unknown>> = [];

    const browserRow = (card: Record<string, unknown>) => ({
      ...card,
      deckName: deck.name,
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
      deletedAt: card.deletedAt ?? null,
      deletedFromDeckName: card.deletedFromDeckName ?? null,
    });

    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          if (command === "list_documents") return [];
          if (command === "list_decks") return [deck];
          if (command === "list_due_cards") return [];
          if (command === "list_active_tags") return [];
          if (command === "search_everything") return [];

          if (command === "create_card") {
            const input = args.input as Record<string, unknown>;
            const card = {
              id: `card-${cards.length + 1}`,
              deckId: deck.id,
              front: input.front,
              back: input.back,
              state: "new",
              dueAt: "2026-07-11T00:00:00.000Z",
              reps: 0,
              lapses: 0,
              stability: null,
              difficulty: null,
              lastReviewAt: null,
              source: null,
              tags: input.tags ?? [],
              deletedAt: null,
              deletedFromDeckName: null,
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
              if (ids.includes(card.id as string)) {
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
              if (ids.includes(card.id as string)) {
                card.deletedAt = null;
                card.deletedFromDeckName = null;
              }
            });
            return { affectedIds: ids, affectedCount: ids.length };
          }

          if (command === "delete_cards_permanently") {
            const ids = args.cardIds as string[];
            for (let index = cards.length - 1; index >= 0; index -= 1) {
              if (ids.includes(cards[index].id as string)) cards.splice(index, 1);
            }
            return { affectedIds: ids, affectedCount: ids.length };
          }

          throw new Error(`Unhandled Tauri command: ${command}`);
        },
      },
    });
  });

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("http://127.0.0.1:1420");

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
