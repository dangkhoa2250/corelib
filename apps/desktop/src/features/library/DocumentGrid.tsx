import type { LibraryDocument } from "../../domain/document";
import { DocumentCard } from "./DocumentCard";

interface DocumentGridProps {
  documents: LibraryDocument[];
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
}

export function DocumentGrid({ documents, onOpen, onDelete, getDocumentFileUrl }: DocumentGridProps) {
  return (
    <section className="document-grid" aria-label="Documents">
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          document={document}
          onOpen={() => onOpen(document.id)}
          onDelete={onDelete ? () => onDelete(document.id) : undefined}
          getDocumentFileUrl={getDocumentFileUrl}
        />
      ))}
    </section>
  );
}
