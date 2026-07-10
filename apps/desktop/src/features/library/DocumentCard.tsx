import { documentStatusLabel, type LibraryDocument } from "../../domain/document";

interface DocumentCardProps {
  document: LibraryDocument;
  onOpen: () => void;
}

export function DocumentCard({ document, onOpen }: DocumentCardProps) {
  const statusLabel = documentStatusLabel(document);

  return (
    <article className="document-card">
      <button
        className="document-card__open"
        type="button"
        aria-label={`Open ${document.title}`}
        onClick={() => onOpen()}
      >
        <div className="document-card__cover">
          {document.coverUrl ? (
            <img src={document.coverUrl} alt="" />
          ) : (
            <span aria-hidden="true">{document.title.charAt(0)}</span>
          )}
        </div>
        <span className="document-card__title">{document.title}</span>
        {document.author ? (
          <span className="document-card__author">{document.author}</span>
        ) : null}
        {statusLabel ? (
          <span className="document-card__status">{statusLabel}</span>
        ) : null}
      </button>
    </article>
  );
}
