import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { SearchResult } from "../../lib/learning";

interface CommandPaletteProps {
  onOpen: (result: SearchResult) => void;
}

export interface CommandPaletteHandle {
  open: () => void;
}

const NAV_ITEMS: SearchResult[] = [
  { kind: "nav", id: "library", title: "Library", subtitle: null },
  { kind: "nav", id: "memora", title: "Memora", subtitle: null },
  { kind: "nav", id: "trash", title: "Trash", subtitle: null },
];

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export const CommandPalette = forwardRef<CommandPaletteHandle, CommandPaletteProps>(function CommandPalette({ onOpen }, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchboxRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocus = useRef(false);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => fuzzyMatch(item.title, trimmed));
  }, [query]);

  const close = useCallback(() => {
    setQuery("");
    setSelectedIndex(0);
    shouldRestoreFocus.current = true;
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setIsOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({ open }), [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (isOpen) {
      searchboxRef.current?.focus();
      setSelectedIndex(0);
    } else if (shouldRestoreFocus.current) {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
      shouldRestoreFocus.current = false;
    }
  }, [isOpen]);

  const openSelected = useCallback(() => {
    const result = results[selectedIndex];
    if (result) {
      onOpen(result);
      close();
    }
  }, [close, onOpen, results, selectedIndex]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="command-palette__backdrop" onMouseDown={close}>
      <section
        aria-label="Navigate to a section"
        aria-modal="true"
        className="command-palette"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          if (event.key === "Tab") {
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
            );
            if (!focusable || focusable.length === 0) {
              return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <input
          aria-label="Navigate to a section"
          className="command-palette__input"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && results.length > 0) {
              event.preventDefault();
              setSelectedIndex((index) => (index + 1) % results.length);
            } else if (event.key === "ArrowUp" && results.length > 0) {
              event.preventDefault();
              setSelectedIndex((index) => (index - 1 + results.length) % results.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              openSelected();
            }
          }}
          placeholder="Go to section…"
          ref={searchboxRef}
          role="searchbox"
          type="search"
          value={query}
        />
        {results.length > 0 ? (
          <ul aria-label="Sections" className="command-palette__results">
            {results.map((result, index) => (
              <li key={result.id}>
                <button
                  aria-label={`Go to ${result.title}`}
                  aria-selected={index === selectedIndex}
                  className={index === selectedIndex ? "is-selected" : undefined}
                  onClick={() => {
                    onOpen(result);
                    close();
                  }}
                  type="button"
                >
                  <span>{result.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
});
