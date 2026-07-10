import { describe, expect, it, vi } from "vitest";
import { createCard, listDueCards, rateCard, searchEverything } from "./learning";

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
});
