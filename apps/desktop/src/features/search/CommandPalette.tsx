import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { CommandEntry, CommandSurface } from "../../app/commandRegistry";

interface CommandPaletteProps {
  mode: CommandSurface;
  search: (query: string) => Promise<CommandEntry[]>;
}

export interface CommandPaletteHandle {
  open: () => void;
}

const SEARCH_DEBOUNCE_MS = 50;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function paletteLabel(mode: CommandSurface): string {
  return mode === "quick-open" ? "Quick Open" : "Command Palette";
}

function resultVerb(mode: CommandSurface): string {
  return mode === "quick-open" ? "Open" : "Run";
}

export const CommandPalette = forwardRef<CommandPaletteHandle, CommandPaletteProps>(function CommandPalette({ mode, search }, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const searchboxRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocus = useRef(false);
  const sequence = useRef(0);
  const label = paletteLabel(mode);

  const groups = useMemo(() => {
    const sections = new Map<string, CommandEntry[]>();
    for (const result of results) {
      const entries = sections.get(result.group) ?? [];
      entries.push(result);
      sections.set(result.group, entries);
    }
    return [...sections.entries()].map(([section, entries]) => ({ section, results: entries }));
  }, [results]);

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
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({ open }), [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const usesPrimaryModifier = event.metaKey || event.ctrlKey;
      const matchesShortcut = mode === "quick-open"
        ? usesPrimaryModifier && !event.shiftKey && event.key.toLowerCase() === "k"
        : usesPrimaryModifier && event.shiftKey && event.key.toLowerCase() === "k";
      if (matchesShortcut) {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, open]);

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
    const request = ++sequence.current;
    setError(null);
    void search(query.trim()).then(
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
    if (!isOpen) return;
    const timer = window.setTimeout(runSearch, query.trim() ? SEARCH_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, query, runSearch]);

  const executeEntry = useCallback((result: CommandEntry) => {
    setError(null);
    void Promise.resolve(result.execute()).then(close, (executionError) => setError(errorMessage(executionError)));
  }, [close]);

  const openSelected = useCallback(() => {
    const result = groups.flatMap((group) => group.results)[selectedIndex];
    if (result) executeEntry(result);
  }, [executeEntry, groups, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="command-palette__backdrop" onMouseDown={close}>
      <section
        aria-label={label}
        aria-modal="true"
        className="command-palette"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          if (event.key !== "Tab") return;
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
        }}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <input
          aria-label={label}
          className="command-palette__input"
          onChange={(event) => {
            sequence.current += 1;
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={(event) => {
            const flat = groups.flatMap((group) => group.results);
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
          placeholder={mode === "quick-open" ? "Search destinations…" : "Search commands…"}
          ref={searchboxRef}
          role="searchbox"
          type="search"
          value={query}
        />
        {error ? <div className="command-palette__error" role="alert"><p>{error}</p></div> : null}
        {groups.length > 0 ? (
          <ul aria-label="Results" className="command-palette__results">
            {(() => {
              let flatIndex = 0;
              return groups.flatMap(({ section, results: sectionResults }) => {
                const items = sectionResults.map((result) => {
                  const index = flatIndex++;
                  return (
                    <li key={result.id}>
                      <button
                        aria-label={`${resultVerb(mode)} ${result.title}`}
                        aria-selected={index === selectedIndex}
                        className={index === selectedIndex ? "is-selected" : undefined}
                        onClick={() => {
                          setSelectedIndex(index);
                          executeEntry(result);
                        }}
                        type="button"
                      >
                        <span>{result.title}</span>
                        <small>{result.breadcrumb.join(" › ")}</small>
                      </button>
                    </li>
                  );
                });
                return [
                  <li key={`header-${section}`} aria-hidden="true" className="command-palette__section-header"><span>{section}</span></li>,
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
