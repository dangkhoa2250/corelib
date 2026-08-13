/**
 * Media command contracts for rich flashcards.
 *
 * These types mirror the Rust payloads in
 * `apps/desktop/src-tauri/src/commands.rs` (`StageCardMediaInput`) and
 * `apps/desktop/src-tauri/src/multi_image_search.rs`, serialized with
 * camelCase keys.
 */

/** Source of a staged media row, matching the Rust `sourceType` strings. */
export type StageMediaSourceType = "file" | "clipboard" | "web";

/** Input to the `stage_card_media` command. */
export interface StageMediaInput {
  draftId: string;
  sourceType: StageMediaSourceType;
  attribution?: string | null;
  filePath?: string | null;
  bytesBase64?: string | null;
}

export type ImageSource = "wikimedia" | "duckduckgo" | "openverse" | string;

export interface ImageSearchResult {
  id: string;
  source: ImageSource;
  title: string;
  previewUrl: string;
  imageUrl: string;
  sourceUrl: string;
  attribution: string;
  license?: string | null;
  licenseUrl?: string | null;
  width: number;
  height: number;
}

export interface ProviderWarning {
  provider: string;
  message: string;
}

export interface MultiImageSearchPage {
  results: ImageSearchResult[];
  warnings: ProviderWarning[];
  hasMore?: boolean;
}

export interface RemoteImagePreviewPayload {
  mimeType: string;
  dataBase64: string;
}
