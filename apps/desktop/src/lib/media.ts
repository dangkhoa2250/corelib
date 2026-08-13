import { invoke } from "@tauri-apps/api/core";

import type { CardMedia } from "../domain/learning";
import type {
  ImageSearchResult,
  MultiImageSearchPage,
  RemoteImagePreviewPayload,
  StageMediaInput,
} from "../domain/media";
import type { Invoke } from "./desktop";

export function searchMultiSourceImages(
  query: string,
  page: number,
  call: Invoke = invoke as Invoke,
): Promise<MultiImageSearchPage> {
  return call("search_multi_source_images", { query, page });
}


export function fetchRemoteImagePreview(
  url: string,
  call: Invoke = invoke as Invoke,
): Promise<RemoteImagePreviewPayload> {
  return call("fetch_remote_image_preview", { url });
}

export function stageRemoteCardMedia(
  draftId: string,
  sourceUrl: string,
  attribution?: string | null,
  call: Invoke = invoke as Invoke,
): Promise<CardMedia> {
  return call("stage_remote_card_media", { draftId, sourceUrl, attribution });
}

/**
 * Prefer the provider's original asset, but fall back to its raster preview.
 * Search providers commonly expose SVG originals or hotlink-protected source
 * files while their preview endpoint remains suitable for a flashcard.
 */
export async function stageRemoteImageResult(
  draftId: string,
  result: ImageSearchResult,
  stage: typeof stageRemoteCardMedia = stageRemoteCardMedia,
): Promise<CardMedia> {
  try {
    return await stage(draftId, result.imageUrl, result.attribution);
  } catch (error) {
    if (!result.previewUrl || result.previewUrl === result.imageUrl) throw error;
    return stage(draftId, result.previewUrl, result.attribution);
  }
}

export function stageCardMedia(
  input: StageMediaInput,
  call: Invoke = invoke as Invoke,
): Promise<CardMedia> {
  return call("stage_card_media", { input });
}

export function discardMediaDraft(
  draftId: string,
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call("discard_media_draft", { draftId });
}

export function resolveCardMedia(
  cardId: string,
  mediaId: string,
  call: Invoke = invoke as Invoke,
): Promise<string> {
  return call("resolve_card_media", { cardId, mediaId });
}

export function resolveStagedMedia(
  draftId: string,
  mediaId: string,
  call: Invoke = invoke as Invoke,
): Promise<string> {
  return call("resolve_staged_media", { draftId, mediaId });
}
