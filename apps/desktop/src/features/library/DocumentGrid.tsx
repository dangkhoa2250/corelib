import { useState, useEffect } from "react";
import type { LibraryDocument } from "../../domain/document";
import { DocumentCard } from "./DocumentCard";
import type { PendingImport } from "../../app/ImportProgress";

interface DocumentGridProps {
  documents: LibraryDocument[];
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  onViewStatistics?: (documentId: string) => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
  pendingImports?: PendingImport[];
}

export function DocumentGrid({ documents, onOpen, onDelete, onRename, onViewStatistics, getDocumentFileUrl, pendingImports }: DocumentGridProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const handleOutsideClick = () => {
      setOpenMenuId(null);
    };
    window.document.addEventListener("click", handleOutsideClick);
    return () => {
      window.document.removeEventListener("click", handleOutsideClick);
    };
  }, [openMenuId]);

  return (
    <section className="document-grid" aria-label="Documents">
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          document={document}
          onOpen={() => onOpen(document.id)}
          onDelete={onDelete ? () => onDelete(document.id) : undefined}
          onRename={onRename ? (newTitle) => onRename(document.id, newTitle) : undefined}
          onViewStatistics={onViewStatistics ? () => onViewStatistics(document.id) : undefined}
          menuOpen={openMenuId === document.id}
          onMenuToggle={(open) => setOpenMenuId(open ? document.id : null)}
          getDocumentFileUrl={getDocumentFileUrl}
        />
      ))}
      {pendingImports?.map((item) => (
        <article key={item.id} className="document-card document-card--placeholder" aria-label={`Importing ${item.name}`}>
          <div className="document-card__cover document-card__cover--placeholder">
            <div className="document-card__shimmer" />
          </div>
          <div className="document-card__loading-bar" />
        </article>
      ))}
    </section>
  );
}
