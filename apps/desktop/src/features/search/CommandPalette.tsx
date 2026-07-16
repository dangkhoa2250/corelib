import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { CommandEntry, CommandSurface } from "../../app/commandRegistry";
import { CommandPaletteView } from "./CommandPaletteView";

interface CommandPaletteProps {
  mode: CommandSurface;
  search: (query: string) => Promise<CommandEntry[]>;
}

export interface CommandPaletteHandle {
  open: () => void;
}

const SEARCH_DEBOUNCE_MS = 50;
const PALETTE_OPEN_EVENT = "corelib:command-palette-open";

interface ActivePalette {
  source: symbol;
  restoreFocusTo: HTMLElement | null;
}

interface PaletteOpenDetail {
  source: symbol;
}

let activePalette: ActivePalette | null = null;

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
  const instanceId = useRef(Symbol("command-palette"));
  const isOpenRef = useRef(false);
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

  const close = useCallback((restoreFocus = true) => {
    if (!isOpenRef.current) return;
    isOpenRef.current = false;
    sequence.current += 1;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setError(null);
    shouldRestoreFocus.current = restoreFocus;
    if (restoreFocus && activePalette?.source === instanceId.current) activePalette = null;
    setIsOpen(false);
  }, []);

  const open = useCallback(() => {
    if (isOpenRef.current) {
      searchboxRef.current?.focus();
      return;
    }
    const restoreFocusTo = activePalette?.restoreFocusTo
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    previousFocusRef.current = restoreFocusTo;
    window.dispatchEvent(new CustomEvent<PaletteOpenDetail>(PALETTE_OPEN_EVENT, { detail: { source: instanceId.current } }));
    activePalette = { source: instanceId.current, restoreFocusTo };
    isOpenRef.current = true;
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
    const onPaletteOpen = (event: Event) => {
      const { source } = (event as CustomEvent<PaletteOpenDetail>).detail;
      if (source !== instanceId.current) close(false);
    };
    window.addEventListener(PALETTE_OPEN_EVENT, onPaletteOpen);
    return () => {
      window.removeEventListener(PALETTE_OPEN_EVENT, onPaletteOpen);
      if (activePalette?.source === instanceId.current) activePalette = null;
    };
  }, [close]);

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

  const changeQuery = useCallback((nextQuery: string) => {
    sequence.current += 1;
    setQuery(nextQuery);
    setResults([]);
    setSelectedIndex(0);
    setError(null);
  }, []);

  const selectNext = useCallback(() => {
    if (results.length === 0) return;
    setSelectedIndex((index) => (index + 1) % results.length);
  }, [results.length]);

  const selectPrevious = useCallback(() => {
    if (results.length === 0) return;
    setSelectedIndex((index) => (index - 1 + results.length) % results.length);
  }, [results.length]);

  const select = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  if (!isOpen) return null;

  return (
    <CommandPaletteView
      close={close}
      error={error}
      groups={groups}
      label={label}
      onExecute={executeEntry}
      onQueryChange={changeQuery}
      onSelect={select}
      onSelectNext={selectNext}
      onSelectPrevious={selectPrevious}
      query={query}
      resultVerb={resultVerb(mode)}
      searchboxRef={searchboxRef}
      selectedIndex={selectedIndex}
    />
  );
});
