import { describe, expect, it, vi } from "vitest";

import {
  checkPixabayKey,
  deletePixabayKey,
  discardMediaDraft,
  resolveCardMedia,
  savePixabayKey,
  searchPixabayImages,
  stageCardMedia,
} from "./media";

describe("media bridge", () => {
  it("invokes pixabay key lifecycle commands", async () => {
    const call = vi.fn().mockResolvedValue(undefined);

    await savePixabayKey("secret-key", call);
    await checkPixabayKey(call);
    await deletePixabayKey(call);

    expect(call.mock.calls).toEqual([
      ["save_pixabay_key", { key: "secret-key" }],
      ["check_pixabay_key"],
      ["delete_pixabay_key"],
    ]);
  });

  it("searches pixabay images with query and page args", async () => {
    const call = vi.fn().mockResolvedValue([]);

    await searchPixabayImages("cats and dogs", 2, call);

    expect(call).toHaveBeenCalledExactlyOnceWith("search_pixabay_images", {
      query: "cats and dogs",
      page: 2,
    });
  });

  it("stages card media with a nested camelCase input", async () => {
    const call = vi.fn().mockResolvedValue({ id: "media-1" });

    await stageCardMedia(
      { draftId: "draft-1", sourceType: "pixabay", bytesBase64: "aGk=", pixabayAttribution: "Pixabay user 'x'" },
      call,
    );

    expect(call).toHaveBeenCalledExactlyOnceWith("stage_card_media", {
      input: {
        draftId: "draft-1",
        sourceType: "pixabay",
        bytesBase64: "aGk=",
        pixabayAttribution: "Pixabay user 'x'",
      },
    });
  });

  it("discards media drafts and resolves owned media with camelCase args", async () => {
    const discardCall = vi.fn().mockResolvedValue(undefined);
    await discardMediaDraft("draft-1", discardCall);
    expect(discardCall).toHaveBeenCalledExactlyOnceWith("discard_media_draft", { draftId: "draft-1" });

    const resolveCall = vi.fn().mockResolvedValue("card-1/media-1.png");
    const resolved = await resolveCardMedia("card-1", "media-1", resolveCall);
    expect(resolveCall).toHaveBeenCalledExactlyOnceWith("resolve_card_media", { cardId: "card-1", mediaId: "media-1" });
    expect(resolved).toBe("card-1/media-1.png");
  });
});
