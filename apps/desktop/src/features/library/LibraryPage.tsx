import type { LibraryDocument } from "../../domain/document";
import type { PendingImport } from "../../app/ImportProgress";
import { DocumentGrid } from "./DocumentGrid";
import { ImportMenu } from "./ImportMenu";

interface LibraryPageProps {
  documents: LibraryDocument[];
  onOpen: (id: string) => void;
  onImport: () => void;
  onOpenDrive?: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  onViewStatistics?: (documentId: string) => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
  pendingImports?: PendingImport[];
}

export function LibraryPage({
  documents,
  onOpen,
  onImport,
  onOpenDrive,
  onDelete,
  onRename,
  onViewStatistics,
  getDocumentFileUrl,
  pendingImports,
}: LibraryPageProps) {
  return (
    <main className="library-page">
      <header className="library-page__header">
        <h1>Library</h1>
        <ImportMenu onUpload={onImport} onGoogleDrive={onOpenDrive} />
      </header>
      {documents.length > 0 || (pendingImports && pendingImports.length > 0) ? (
        <DocumentGrid
          documents={documents}
          onOpen={onOpen}
          onDelete={onDelete}
          onRename={onRename}
          onViewStatistics={onViewStatistics}
          getDocumentFileUrl={getDocumentFileUrl}
          pendingImports={pendingImports}
        />
      ) : (
        <p className="library-page__empty">Your books will appear here.</p>
      )}
    </main>
  );
}
