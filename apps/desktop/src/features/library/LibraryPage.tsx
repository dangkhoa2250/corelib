import type { LibraryDocument } from "../../domain/document";
import { DocumentGrid } from "./DocumentGrid";

interface LibraryPageProps {
  documents: LibraryDocument[];
  onOpen: (id: string) => void;
  onImport: () => void;
  onReviewToday?: () => void;
  onOpenDrive?: () => void;
  onClearCache?: () => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
}

export function LibraryPage({
  documents,
  onOpen,
  onImport,
  onReviewToday,
  onOpenDrive,
  onClearCache,
  onDelete,
  onRename,
  getDocumentFileUrl,
}: LibraryPageProps) {
  return (
    <main className="library-page">
      <header className="library-page__header">
        <h1>Library</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onImport}>
            Import from Mac
          </button>
          {onReviewToday && <button type="button" onClick={onReviewToday}>Review today</button>}
          {onOpenDrive && (
            <button type="button" onClick={onOpenDrive}>
              Google Drive
            </button>
          )}
        </div>
      </header>
      {documents.length > 0 ? (
        <DocumentGrid
          documents={documents}
          onOpen={onOpen}
          onDelete={onDelete}
          onRename={onRename}
          getDocumentFileUrl={getDocumentFileUrl}
        />
      ) : (
        <p className="library-page__empty">Your books will appear here.</p>
      )}
      {onClearCache && (
        <footer style={{ marginTop: '48px', borderTop: '1px solid #e5e5ea', paddingTop: '24px' }}>
          <button type="button" onClick={onClearCache}>
            Clear downloaded Drive files
          </button>
        </footer>
      )}
    </main>
  );
}
