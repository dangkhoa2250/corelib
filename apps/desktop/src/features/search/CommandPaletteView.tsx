import type { RefObject, ReactNode } from "react";

import type { CommandEntry } from "../../app/commandRegistry";

export interface CommandPaletteGroup {
  section: string;
  results: CommandEntry[];
}

export interface CommandPaletteViewProps {
  label: string;
  query: string;
  onQueryChange: (query: string) => void;
  groups: CommandPaletteGroup[];
  selectedIndex: number;
  onExecute: (entry: CommandEntry) => void;
  onSelectNext: () => void;
  onSelectPrevious: () => void;
  close: () => void;
  error: string | null;
  searchboxRef: RefObject<HTMLInputElement | null>;
  resultVerb: string;
}

export function highlightMatch(value: string, query: string): ReactNode[] {
  const characters = [...value];
  const matched = new Set<number>();
  const normalizedValue = characters.map((character) => character.toLocaleLowerCase());

  for (const term of query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)) {
    const termCharacters = [...term];
    const termMatches: number[] = [];
    let termIndex = 0;
    for (let index = 0; index < normalizedValue.length && termIndex < termCharacters.length; index += 1) {
      if (normalizedValue[index] === termCharacters[termIndex]) {
        termMatches.push(index);
        termIndex += 1;
      }
    }
    if (termIndex === termCharacters.length) termMatches.forEach((index) => matched.add(index));
  }

  return characters.map((character, index) => (
    matched.has(index)
      ? <mark className="command-palette__match" key={index}>{character}</mark>
      : <span key={index}>{character}</span>
  ));
}

export function CommandPaletteView({
  close,
  error,
  groups,
  label,
  onExecute,
  onQueryChange,
  onSelectNext,
  onSelectPrevious,
  query,
  resultVerb,
  searchboxRef,
  selectedIndex,
}: CommandPaletteViewProps) {
  let flatIndex = 0;

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
          const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
          );
          if (focusable.length === 0) return;
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
        role="dialog"
      >
        <input
          aria-label={label}
          className="command-palette__input"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onSelectNext();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              onSelectPrevious();
            } else if (event.key === "Enter") {
              event.preventDefault();
              const selected = groups.flatMap((group) => group.results)[selectedIndex];
              if (selected) onExecute(selected);
            }
          }}
          placeholder="Search…"
          ref={searchboxRef}
          role="searchbox"
          type="search"
          value={query}
        />
        {error ? <div className="command-palette__error" role="alert">{error}</div> : null}
        <ul aria-label="Results" className="command-palette__results">
          {groups.flatMap(({ results, section }) => {
            const entries = results.map((result) => {
              const index = flatIndex;
              flatIndex += 1;
              const isSelected = index === selectedIndex;
              return (
                <li key={result.id}>
                  <button
                    aria-label={`${resultVerb} ${result.title}${isSelected ? ", selected" : ""}`}
                    className={isSelected ? "is-selected" : undefined}
                    data-selected={isSelected ? "true" : undefined}
                    onClick={() => onExecute(result)}
                    type="button"
                  >
                    <span className="command-palette__title">{highlightMatch(result.title, query)}</span>
                    <small>{result.breadcrumb.join(" › ")}</small>
                  </button>
                </li>
              );
            });
            return [
              <li aria-hidden="true" className="command-palette__section-header" key={`header-${section}`}>{section}</li>,
              ...entries,
            ];
          })}
        </ul>
        <footer className="command-palette__footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> {resultVerb}</span>
          <span><kbd>Escape</kbd> Close</span>
        </footer>
      </section>
    </div>
  );
}
