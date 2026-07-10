import { useState, useEffect } from "react";
import type { LibraryDocument } from "../../domain/document";
import { DocumentCard } from "./DocumentCard";

interface DocumentGridProps {
  documents: LibraryDocument[];
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  getDocumentFileUrl?: (id: string) => Promise<string>;
}

export function DocumentGrid({ documents, onOpen, onDelete, onRename, getDocumentFileUrl }: DocumentGridProps) {
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
          menuOpen={openMenuId === document.id}
          onMenuToggle={(open) => setOpenMenuId(open ? document.id : null)}
          getDocumentFileUrl={getDocumentFileUrl}
        />
      ))}
    </section>
  );
}
