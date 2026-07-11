import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { SearchResult } from "../../lib/learning";

interface CommandPaletteProps {
  search: (query: string) => Promise<SearchResult[]>;
  onOpen: (result: SearchResult) => void;
}

export interface CommandPaletteHandle {
  open: () => void;
}

const SEARCH_DEBOUNCE_MS = 50;

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const CommandPalette = forwardRef<CommandPaletteHandle, CommandPaletteProps>(function CommandPalette({ search, onOpen }, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const searchboxRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocus = useRef(false);
  const sequence = useRef(0);

  const groups = useMemo(() => {
    if (results.length === 0) return [];
    const nav = results.filter((r) => r.kind === "nav" && fuzzyMatch(r.title, query.trim()));
    const docs = results.filter((r) => r.kind === "document");
    const decks = results.filter((r) => r.kind === "deck");
    const cards = results.filter((r) => r.kind === "card");
    const trash = results.filter((r) => r.kind === "trash");
    const sections: { section: string; results: SearchResult[] }[] = [];
    if (nav.length > 0) sections.push({ section: "Navigate", results: nav });
    if (docs.length > 0) sections.push({ section: "Library", results: docs });
    if (decks.length > 0) sections.push({ section: "Decks", results: decks });
    if (cards.length > 0) sections.push({ section: "Cards", results: cards });
    if (trash.length > 0) sections.push({ section: "Trash", results: trash });
    return sections;
  }, [results, query]);

  const close = useCallback(() => {
    sequence.current += 1;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setError(null);
    shouldRestoreFocus.current = true;
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    setResults(NAV_ITEMS);
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

  const runSearch = useCallback(() => {
    const trimmedQuery = query.trim();
    const request = ++sequence.current;
    if (!trimmedQuery) {
      setResults(NAV_ITEMS);
      setError(null);
      return;
    }

    setError(null);
    void search(trimmedQuery).then(
      (searchResults) => {
        if (request === sequence.current) {
          setResults(searchResults);
          setSelectedIndex(0);
        }
      },
      (searchError) => {
        if (request === sequence.current) {
          setResults(NAV_ITEMS);
          setError(errorMessage(searchError));
        }
      },
    );
  }, [query, search]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(runSearch, query.trim() ? SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, query, runSearch]);

  const openSelected = useCallback(() => {
    const flat = groups.flatMap((g) => g.results);
    const result = flat[selectedIndex];
    if (result) {
      onOpen(result);
      close();
    }
  }, [close, onOpen, groups, selectedIndex]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="command-palette__backdrop" onMouseDown={close}>
      <section
        aria-label="Search everything"
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
            if (!focusable || focusable.length === 0) return;
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
          aria-label="Search everything"
          className="command-palette__input"
          onChange={(event) => {
            sequence.current += 1;
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={(event) => {
            const flat = groups.flatMap((g) => g.results);
            if (event.key === "ArrowDown" && flat.length > 0) {
              event.preventDefault();
              setSelectedIndex((index) => (index + 1) % flat.length);
            } else if (event.key === "ArrowUp" && flat.length > 0) {
              event.preventDefault();
              setSelectedIndex((index) => (index - 1 + flat.length) % flat.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              openSelected();
            }
          }}
          placeholder="Search tabs, PDFs, decks, cards…"
          ref={searchboxRef}
          role="searchbox"
          type="search"
          value={query}
        />
        {error ? (
          <div className="command-palette__error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        {groups.length > 0 ? (
          <ul aria-label="Results" className="command-palette__results">
            {(() => {
              let flatIndex = 0;
              return groups.flatMap(({ section, results: sectionResults }) => {
                const items = sectionResults.map((result) => {
                  const index = flatIndex++;
                  return (
                    <li key={`${result.kind}-${result.id}`}>
                      <button
                        aria-label={`Open ${result.title}`}
                        aria-selected={index === selectedIndex}
                        className={index === selectedIndex ? "is-selected" : undefined}
                        onClick={() => {
                          onOpen(result);
                          close();
                        }}
                        type="button"
                      >
                        <span>{result.title}</span>
                        {result.subtitle ? <small>{result.subtitle}</small> : null}
                      </button>
                    </li>
                  );
                });
                return [
                  <li key={`header-${section}`} aria-hidden="true" className="command-palette__section-header">
                    <span>{section}</span>
                  </li>,
                  ...items,
                ];
              });
            })()}
          </ul>
        ) : null}
      </section>
    </div>
  );
});
