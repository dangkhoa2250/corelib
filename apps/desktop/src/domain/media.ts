/**
 * Media and Pixabay command contracts for rich flashcards.
 *
 * These types mirror the Rust payloads in
 * `apps/desktop/src-tauri/src/commands.rs` (`StageCardMediaInput`) and
 * `apps/desktop/src-tauri/src/model.rs` (`PixabayImage`), serialized with
 * camelCase keys.
 */

/** Source of a staged media row, matching the Rust `sourceType` strings. */
export type StageMediaSourceType = "file" | "clipboard" | "pixabay";

/** Input to the `stage_card_media` command. */
export interface StageMediaInput {
  draftId: string;
  sourceType: StageMediaSourceType;
  pixabayAttribution?: string | null;
  filePath?: string | null;
  bytesBase64?: string | null;
}

/** A Pixabay search hit, mirroring the Rust `PixabayImage` model (12 fields). */
export interface PixabayImage {
  id: number;
  pageUrl: string;
  previewUrl: string;
  imageUrl: string;
  previewWidth: number;
  previewHeight: number;
  width: number;
  height: number;
  tags: string;
  user: string;
  userId: number;
  mediaType: string;
}
