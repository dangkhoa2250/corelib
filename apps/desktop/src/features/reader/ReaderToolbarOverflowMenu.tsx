import { useEffect, useRef, useState } from "react";
import type { PageTag } from "../../domain/document";

export interface ReaderToolbarOverflowMenuProps {
  zoomPercent: number;
  onZoomBy: (delta: number) => void;
  currentTagged?: boolean;
  currentPage?: number;
  pageTags?: PageTag[];
  onToggleTag?: () => void;
  onSelectTaggedPage?: (page: number) => void;
}

export function ReaderToolbarOverflowMenu({
  zoomPercent,
  onZoomBy,
  currentTagged,
  currentPage,
  pageTags = [],
  onToggleTag,
  onSelectTaggedPage,
}: ReaderToolbarOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.document.addEventListener("click", close);
    return () => window.document.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="reader-toolbar__overflow" ref={menuRef}>
      <button
        type="button"
        className="reader-icon-button"
        aria-label="More actions"
        title="More actions"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        ⋯
      </button>
      {open ? (
        <div className="reader-toolbar__overflow-menu" onClick={(event) => event.stopPropagation()}>
          {onToggleTag && currentPage !== undefined ? (
            <>
              <button
                type="button"
                className="reader-toolbar__overflow-item"
                onClick={() => {
                  onToggleTag();
                  setOpen(false);
                }}
              >
                {currentTagged ? `✓ Page ${currentPage} tagged` : `+ Tag Page ${currentPage}`}
              </button>
              {pageTags.length > 0 ? (
                <div className="reader-toolbar__overflow-tags">
                  {pageTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`reader-toolbar__overflow-item${tag.page === currentPage ? " is-active" : ""}`}
                      onClick={() => {
                        onSelectTaggedPage?.(tag.page);
                        setOpen(false);
                      }}
                    >
                      Page {tag.page}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          <div className="reader-toolbar__overflow-zoom">
            <button
              type="button"
              className="reader-icon-button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => onZoomBy(-0.1)}
            >
              −
            </button>
            <span className="reader-zoom-label">{zoomPercent}%</span>
            <button
              type="button"
              className="reader-icon-button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => onZoomBy(0.1)}
            >
              +
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
