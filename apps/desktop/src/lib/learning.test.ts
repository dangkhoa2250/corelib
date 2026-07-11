import { describe, expect, it, vi } from "vitest";
import {
  createCard,
  listDueCards,
  rateCard,
  searchEverything,
  queryDeckCards,
  updateCard,
  moveCards,
  setCardsSuspended,
  trashCards,
  listTrashedCards,
  restoreCards,
  deleteCardsPermanently,
  emptyTrash,
} from "./learning";

describe("learning bridge", () => {
  it("invokes create_card with nested input", async () => {
    const call = vi.fn().mockResolvedValue({ id: "c" });
    await createCard({ deckName: "Bio", front: "f", back: "b" }, call);
    expect(call).toHaveBeenCalledWith("create_card", { input: { deckName: "Bio", front: "f", back: "b" } });
  });
  it("keeps review and search argument names stable", async () => {
    const call = vi.fn().mockResolvedValue([]);
    await listDueCards(10, call);
    await rateCard("c", "good", 12, call);
    await searchEverything("ATP", call);
    expect(call).toHaveBeenNthCalledWith(1, "list_due_cards", { limit: 10 });
    expect(call).toHaveBeenNthCalledWith(2, "rate_card", { id: "c", rating: "good", elapsedMs: 12 });
    expect(call).toHaveBeenNthCalledWith(3, "search_everything", { query: "ATP" });
  });
  it("invokes lifecycle and trash methods correctly", async () => {
    const call = vi.fn().mockResolvedValue({ affectedIds: [], affectedCount: 0 });

    await queryDeckCards({ deckId: "d", query: "q", states: ["new"], tags: ["t"], sort: "updated_desc", cursor: null, limit: 10 }, call);
    expect(call).toHaveBeenLastCalledWith("query_deck_cards", {
      payload: { deckId: "d", query: "q", states: ["new"], tags: ["t"], sort: "updated_desc", cursor: null, limit: 10 }
    });

    await updateCard({ cardId: "c", front: "f", back: "b", tags: ["t"], frontLanguage: null }, call);
    expect(call).toHaveBeenLastCalledWith("update_card", {
      payload: { cardId: "c", front: "f", back: "b", tags: ["t"], frontLanguage: null }
    });

    await moveCards(["c1"], "d2", call);
    expect(call).toHaveBeenLastCalledWith("move_cards", { cardIds: ["c1"], destinationDeckId: "d2" });

    await setCardsSuspended(["c1"], true, call);
    expect(call).toHaveBeenLastCalledWith("set_cards_suspended", { cardIds: ["c1"], suspended: true });

    await trashCards(["c1"], call);
    expect(call).toHaveBeenLastCalledWith("trash_cards", { cardIds: ["c1"] });

    await listTrashedCards("q", "deleted_desc", null, 10, call);
    expect(call).toHaveBeenLastCalledWith("list_trashed_cards", { query: "q", sort: "deleted_desc", cursor: null, limit: 10 });

    await restoreCards(["c1"], "d2", call);
    expect(call).toHaveBeenLastCalledWith("restore_cards", { cardIds: ["c1"], destinationDeckId: "d2" });

    await deleteCardsPermanently(["c1"], call);
    expect(call).toHaveBeenLastCalledWith("delete_cards_permanently", { cardIds: ["c1"] });

    await emptyTrash(call);
    expect(call).toHaveBeenLastCalledWith("empty_trash");
  });
});
