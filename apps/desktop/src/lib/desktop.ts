import { invoke } from "@tauri-apps/api/core";

import type { LibraryDocument } from "../domain/document";

export type Invoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export function listDocuments(
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument[]> {
  return call<LibraryDocument[]>("list_documents");
}

export function importLocalDocuments(
  paths: string[],
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument[]> {
  return call<LibraryDocument[]>("import_local_documents", { paths });
}

export function searchDocuments(
  query: string,
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument[]> {
  return call<LibraryDocument[]>("search_documents", { query });
}

export function saveReadPage(
  id: string,
  page: number,
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument> {
  return call<LibraryDocument>("save_read_page", { id, page });
}
