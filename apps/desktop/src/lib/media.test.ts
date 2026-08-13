import { describe, expect, it, vi } from "vitest";

import {
  discardMediaDraft,
  resolveCardMedia,
  resolveStagedMedia,
  fetchRemoteImagePreview,
  searchMultiSourceImages,
  stageRemoteCardMedia,
  stageRemoteImageResult,
  stageCardMedia,
} from "./media";

describe("media bridge", () => {
  it("invokes the keyless multi-source image contracts", async () => {
    const call = vi.fn().mockResolvedValue({ results: [], warnings: [], hasMore: false });
    await searchMultiSourceImages("cats", 2, call);
    expect(call).toHaveBeenCalledWith("search_multi_source_images", { query: "cats", page: 2 });
  });

  it("fetches previews and stages remote media with generic attribution", async () => {
    const previewCall = vi.fn().mockResolvedValue({ mimeType: "image/jpeg", dataBase64: "aGk=" });
    await fetchRemoteImagePreview("https://example.test/image.jpg", previewCall);
    expect(previewCall).toHaveBeenCalledWith("fetch_remote_image_preview", { url: "https://example.test/image.jpg" });

    const stageCall = vi.fn().mockResolvedValue({ id: "media-1" });
    await stageRemoteCardMedia("draft-1", "https://example.test/image.jpg", "Artist · CC BY", stageCall);
    expect(stageCall).toHaveBeenCalledWith("stage_remote_card_media", {
      draftId: "draft-1",
      sourceUrl: "https://example.test/image.jpg",
      attribution: "Artist · CC BY",
    });
  });

  it("falls back to the raster preview when the original remote image cannot be staged", async () => {
    const stage = vi.fn()
      .mockRejectedValueOnce(new Error("unsupported source image"))
      .mockResolvedValueOnce({ id: "media-preview" });
    const result = {
      id: "wiki-svg",
      source: "wikimedia",
      title: "Rotation diagram",
      previewUrl: "https://example.test/preview.png",
      imageUrl: "https://example.test/original.svg",
      sourceUrl: "https://example.test/page",
      attribution: "Ada · CC BY",
      license: "CC BY",
      width: 640,
      height: 480,
    };

    await expect(stageRemoteImageResult("draft-1", result, stage)).resolves.toEqual({ id: "media-preview" });
    expect(stage).toHaveBeenNthCalledWith(1, "draft-1", result.imageUrl, result.attribution);
    expect(stage).toHaveBeenNthCalledWith(2, "draft-1", result.previewUrl, result.attribution);
  });
  it("stages card media with a nested camelCase input", async () => {
    const call = vi.fn().mockResolvedValue({ id: "media-1" });

    await stageCardMedia(
      { draftId: "draft-1", sourceType: "web", bytesBase64: "aGk=", attribution: "Artist · CC BY" },
      call,
    );

    expect(call).toHaveBeenCalledExactlyOnceWith("stage_card_media", {
      input: {
        draftId: "draft-1",
        sourceType: "web",
        bytesBase64: "aGk=",
        attribution: "Artist · CC BY",
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

    const stagedCall = vi.fn().mockResolvedValue("/app-data/card-media/staging/draft-1/media-2.png");
    const staged = await resolveStagedMedia("draft-1", "media-2", stagedCall);
    expect(stagedCall).toHaveBeenCalledExactlyOnceWith("resolve_staged_media", { draftId: "draft-1", mediaId: "media-2" });
    expect(staged).toBe("/app-data/card-media/staging/draft-1/media-2.png");
  });
});
