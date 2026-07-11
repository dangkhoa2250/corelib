import { invoke } from "@tauri-apps/api/core";

import type { LibraryDocument, PageTag } from "../domain/document";

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

export function getDocument(
  id: string,
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument> {
  return call<LibraryDocument>("get_document", { id });
}

export function saveReadPage(
  id: string,
  page: number,
  numPages?: number,
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument> {
  return call<LibraryDocument>("save_read_page", { id, page, numPages });
}

export function listPageTags(
  id: string,
  call: Invoke = invoke as Invoke,
): Promise<PageTag[]> {
  return call<PageTag[]>("list_page_tags", { id });
}

export function togglePageTag(
  documentId: string,
  page: number,
  call: Invoke = invoke as Invoke,
): Promise<PageTag[]> {
  return call<PageTag[]>("toggle_page_tag", { documentId, page });
}

export type DriveEntry = {
  id: string;
  name: string;
  kind: "pdf" | "folder";
  parentId: string | null;
};

export type DriveEntryList = DriveEntry[];

export function connectDrive(call: Invoke = invoke as Invoke): Promise<void> {
  return call<void>("drive_connect");
}

export function listDrive(
  folderId?: string,
  call: Invoke = invoke as Invoke,
): Promise<DriveEntry[]> {
  return call<DriveEntry[]>("drive_list", { folderId });
}

export function importDrive(
  ids: string[],
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument[]> {
  return call<LibraryDocument[]>("drive_import", { ids });
}

export function getDocumentFileUrl(
  id: string,
  call: Invoke = invoke as Invoke,
): Promise<string> {
  return call<string>("get_document_file_url", { id });
}

export function clearDriveCache(call: Invoke = invoke as Invoke): Promise<void> {
  return call<void>("clear_drive_cache");
}

export function deleteDocument(
  id: string,
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call<void>("delete_document", { id });
}

export function saveCover(
  id: string,
  data: number[],
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument> {
  return call<LibraryDocument>("save_cover", { id, data });
}

export function renameDocument(
  id: string,
  title: string,
  call: Invoke = invoke as Invoke,
): Promise<LibraryDocument> {
  return call<LibraryDocument>("rename_document", { id, title });
}

export function saveGoogleDriveCredentials(
  clientId: string,
  clientSecret: string,
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call("save_google_drive_credentials", { clientId, clientSecret });
}

export function loadGoogleDriveCredentials(
  call: Invoke = invoke as Invoke,
): Promise<{ clientId: string; clientSecret: string } | null> {
  return call<{ clientId: string; clientSecret: string } | null>("load_google_drive_credentials");
}

export function clearGoogleDriveCredentials(
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call("clear_google_drive_credentials");
}
