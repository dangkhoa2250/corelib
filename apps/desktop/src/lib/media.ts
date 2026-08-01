import { invoke } from "@tauri-apps/api/core";

import type { CardMedia } from "../domain/learning";
import type { PixabayImage, StageMediaInput } from "../domain/media";
import type { Invoke } from "./desktop";

export function savePixabayKey(
  key: string,
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call("save_pixabay_key", { key });
}

export function checkPixabayKey(
  call: Invoke = invoke as Invoke,
): Promise<boolean> {
  return call("check_pixabay_key");
}

export function deletePixabayKey(
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call("delete_pixabay_key");
}

export function searchPixabayImages(
  query: string,
  page: number,
  call: Invoke = invoke as Invoke,
): Promise<PixabayImage[]> {
  return call("search_pixabay_images", { query, page });
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
