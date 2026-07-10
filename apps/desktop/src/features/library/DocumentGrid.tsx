import type { LibraryDocument } from "../../domain/document";
import { DocumentCard } from "./DocumentCard";

interface DocumentGridProps {
  documents: LibraryDocument[];
  onOpen: (id: string) => void;
}

export function DocumentGrid({ documents, onOpen }: DocumentGridProps) {
  return (
    <section className="document-grid" aria-label="Documents">
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          document={document}
          onOpen={() => onOpen(document.id)}
        />
      ))}
    </section>
  );
}
