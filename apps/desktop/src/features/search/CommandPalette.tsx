import { useCallback, useEffect, useRef, useState } from "react";

import type { SearchResult } from "../../lib/learning";

interface CommandPaletteProps {
  search: (query: string) => Promise<SearchResult[]>;
  onOpen: (result: SearchResult) => void;
}

const SEARCH_DEBOUNCE_MS = 150;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CommandPalette({ search, onOpen }: CommandPaletteProps) {
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

  const close = useCallback(() => {
    sequence.current += 1;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setError(null);
    shouldRestoreFocus.current = true;
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        previousFocusRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      searchboxRef.current?.focus();
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
      setResults([]);
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
          setResults([]);
          setError(errorMessage(searchError));
        }
      },
    );
  }, [query, search]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const timer = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, query, runSearch]);

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
        aria-label="Search your library"
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
          aria-label="Search your library"
          className="command-palette__input"
          onChange={(event) => {
            sequence.current += 1;
            setQuery(event.target.value);
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
          placeholder="Search your library"
          ref={searchboxRef}
          role="searchbox"
          type="search"
          value={query}
        />
        {error ? (
          <div className="command-palette__error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={runSearch}>Try again</button>
          </div>
        ) : null}
        {results.length > 0 ? (
          <ul aria-label="Search results" className="command-palette__results">
            {results.map((result, index) => (
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
                  <small>{result.kind === "card" ? "Flashcard" : result.subtitle}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
