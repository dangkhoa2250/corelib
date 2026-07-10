import type { LibraryDocument } from "../../domain/document";

interface ReaderPlaceholderProps {
  document: LibraryDocument;
  onBack: () => void;
}

export function ReaderPlaceholder({ document, onBack }: ReaderPlaceholderProps) {
  return (
    <main className="reader-placeholder">
      <button type="button" onClick={onBack}>
        Back to Library
      </button>
      <h1>{document.title}</h1>
      <p>Reader coming soon.</p>
    </main>
  );
}
