import { useCallback, useEffect, useRef, useState } from "react";

import type { LibraryDocument } from "../../domain/document";

interface CommandPaletteProps {
  search: (query: string) => Promise<LibraryDocument[]>;
  onOpen: (id: string) => void;
}

const SEARCH_DEBOUNCE_MS = 150;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CommandPalette({ search, onOpen }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryDocument[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const searchboxRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);

  const close = useCallback(() => {
    sequence.current += 1;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setError(null);
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      searchboxRef.current?.focus();
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
      (documents) => {
        if (request === sequence.current) {
          setResults(documents);
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
    const document = results[selectedIndex];
    if (document) {
      onOpen(document.id);
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
        onMouseDown={(event) => event.stopPropagation()}
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
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            } else if (event.key === "ArrowDown" && results.length > 0) {
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
            {results.map((document, index) => (
              <li key={document.id}>
                <button
                  aria-label={`Open ${document.title}`}
                  aria-selected={index === selectedIndex}
                  className={index === selectedIndex ? "is-selected" : undefined}
                  onClick={() => {
                    onOpen(document.id);
                    close();
                  }}
                  type="button"
                >
                  <span>{document.title}</span>
                  {document.author ? <small>{document.author}</small> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
