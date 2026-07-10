import type { LibraryDocument } from "../../domain/document";
import { DocumentGrid } from "./DocumentGrid";

interface LibraryPageProps {
  documents: LibraryDocument[];
  onOpen: (id: string) => void;
  onImport: () => void;
}

export function LibraryPage({ documents, onOpen, onImport }: LibraryPageProps) {
  return (
    <main className="library-page">
      <header className="library-page__header">
        <h1>Library</h1>
        <button type="button" onClick={onImport}>
          Import from Mac
        </button>
      </header>
      {documents.length > 0 ? (
        <DocumentGrid documents={documents} onOpen={onOpen} />
      ) : (
        <p className="library-page__empty">Your books will appear here.</p>
      )}
    </main>
  );
}
