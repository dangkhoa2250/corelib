import { describe, expect, it, vi } from "vitest";
import {
  createCard,
  getStudyReadyCounts,
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
  getMemoraSettings,
  updateMemoraSettings,
  getDeckLearningSettings,
  updateDeckLearningSettings,
  startStudySession,
  refreshStudySession,
  rateStudyCard,
} from "./learning";

describe("learning bridge", () => {
  it("invokes create_card with nested input", async () => {
    const call = vi.fn().mockResolvedValue({ id: "c" });
    await createCard({ deckName: "Bio", front: "f", back: "b" }, call);
    expect(call).toHaveBeenCalledWith("create_card", { input: { deckName: "Bio", front: "f", back: "b" } });
  });
  it("keeps search and ready-count argument names stable", async () => {
    const call = vi.fn().mockResolvedValue([]);
    await searchEverything("ATP", call);
    await getStudyReadyCounts(call);
    expect(call).toHaveBeenNthCalledWith(1, "search_everything", { query: "ATP" });
    expect(call).toHaveBeenNthCalledWith(2, "get_study_ready_counts");
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
  it("invokes Memora and deck learning settings commands", async () => {
    const call = vi.fn().mockResolvedValue({});

    await getMemoraSettings(call);
    await updateMemoraSettings(
      { newCardsPerDay: 30, desiredRetention: 0.92 },
      call,
    );
    await getDeckLearningSettings("deck-1", call);
    await updateDeckLearningSettings("deck-1", 8, call);
    await updateDeckLearningSettings("deck-1", null, call);

    expect(call).toHaveBeenNthCalledWith(1, "get_memora_settings");
    expect(call).toHaveBeenNthCalledWith(2, "update_memora_settings", {
      settings: { newCardsPerDay: 30, desiredRetention: 0.92 },
    });
    expect(call).toHaveBeenNthCalledWith(3, "get_deck_learning_settings", {
      deckId: "deck-1",
    });
    expect(call).toHaveBeenNthCalledWith(4, "update_deck_learning_settings", {
      payload: { deckId: "deck-1", newCardsPerDay: 8 },
    });
    expect(call).toHaveBeenNthCalledWith(5, "update_deck_learning_settings", {
      payload: { deckId: "deck-1", newCardsPerDay: null },
    });
  });
  it("invokes backend-owned study session commands", async () => {
    const call = vi.fn().mockResolvedValue({});
    const rating = {
      sessionId: "session-1",
      cardId: "card-1",
      grantToken: "grant-1",
      expectedState: "review" as const,
      expectedDueAt: "2026-07-16T09:00:00.000Z",
      rating: "good" as const,
      elapsedMs: 1500,
    };

    await startStudySession({ kind: "all" }, call);
    await startStudySession({ kind: "deck", deckId: "deck-1" }, call);
    await refreshStudySession("session-1", call);
    await rateStudyCard(rating, call);

    expect(call).toHaveBeenNthCalledWith(1, "start_study_session", { scope: { kind: "all" } });
    expect(call).toHaveBeenNthCalledWith(2, "start_study_session", { scope: { kind: "deck", deckId: "deck-1" } });
    expect(call).toHaveBeenNthCalledWith(3, "refresh_study_session", { sessionId: "session-1" });
    expect(call).toHaveBeenNthCalledWith(4, "rate_study_card", { payload: rating });
  });
});
