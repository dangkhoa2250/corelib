import { useEffect } from "react";
import type { CardSource } from "../../domain/learning";
import { SourceViewer, type SourceViewerProps } from "./SourceViewer";

export interface SourceModalProps {
  source: CardSource;
  getDocumentFileUrl: SourceViewerProps["getDocumentFileUrl"];
  onClose: () => void;
}

export function SourceModal({ source, getDocumentFileUrl, onClose }: SourceModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="source-modal" role="dialog" aria-modal="true" aria-label="Card source PDF">
      <div className="source-modal__backdrop" onClick={onClose} data-testid="source-modal-backdrop" />
      <div className="source-modal__content">
        <div className="source-modal__header">
          <h3 className="source-modal__title">Source PDF</h3>
          <button
            className="source-modal__close-btn"
            onClick={onClose}
            aria-label="Close source viewer"
            type="button"
          >
            ×
          </button>
        </div>
        <SourceViewer
          source={source}
          getDocumentFileUrl={getDocumentFileUrl}
          onClose={onClose}
          presentation="modal"
        />
      </div>
    </div>
  );
}
