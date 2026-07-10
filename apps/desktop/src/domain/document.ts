export type DocumentSource = "local_managed" | "google_drive";

export type DocumentStatus =
  | "ready"
  | "processing"
  | "download_required"
  | "error";

export interface LibraryDocument {
  id: string;
  title: string;
  author: string | null;
  source: DocumentSource;
  coverUrl: string | null;
  indexed: boolean;
  status: DocumentStatus;
  lastReadPage: number | null;
}

export function documentStatusLabel(document: LibraryDocument): string {
  if (document.status === "ready" && !document.indexed) {
    return "Needs attention";
  }

  switch (document.status) {
    case "ready":
      return "";
    case "processing":
      return "Preparing";
    case "download_required":
      return "Download to read";
    case "error":
      return "Needs attention";
  }
}
