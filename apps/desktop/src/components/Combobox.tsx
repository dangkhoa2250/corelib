import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconChevronDown, IconSearch } from "../app/icons";
import { ScrollArea } from "./ScrollArea";

export interface ComboboxOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface ComboboxProps<T extends string> {
  value: T | null;
  onChange: (value: T) => void;
  options: ComboboxOption<T>[];
  placeholder?: string;
  searchPlaceholder?: string;
  noOptionsMessage?: string;
  disabled?: boolean;
  ariaLabel?: string;
  searchable?: boolean;
  className?: string;
}

export function Combobox<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  noOptionsMessage = "No options found",
  disabled = false,
  ariaLabel,
  searchable = true,
  className,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(
    () =>
      query
        ? options.filter((o) =>
            o.label.toLowerCase().includes(query.toLowerCase()),
          )
        : options,
    [options, query],
  );

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      setQuery("");
      setHighlightedIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const justOpened = !wasOpenRef.current;
      wasOpenRef.current = true;
      if (!searchable) {
        setQuery("");
      }
      searchRef.current?.focus();
      setHighlightedIndex((currentIndex) => {
        if (justOpened && currentIndex >= 0 && currentIndex < filtered.length) {
          return currentIndex;
        }
        const selectedIndex = filtered.findIndex((o) => o.value === value);
        return selectedIndex >= 0 ? selectedIndex : filtered.length > 0 ? 0 : -1;
      });
    }
  }, [open, filtered, value, searchable]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "Tab") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filtered.length - 1,
        );
        return;
      }
      if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const option = filtered[highlightedIndex];
        if (option) {
          onChange(option.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
        return;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, filtered, highlightedIndex, onChange]);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const list = listRef.current;
    const item = list?.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);

  const activeOptionId =
    open && highlightedIndex >= 0 && filtered[highlightedIndex]
      ? `${listboxId}-option-${filtered[highlightedIndex].value}`
      : undefined;
  const searchablePopupOpen = open && searchable;

  return (
    <div className={`combobox${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        role={searchablePopupOpen ? undefined : "combobox"}
        className="combobox__trigger"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (disabled || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          event.preventDefault();
          const selectedIndex = filtered.findIndex((option) => option.value === value);
          setHighlightedIndex(
            selectedIndex >= 0
              ? selectedIndex
              : event.key === "ArrowDown"
                ? 0
                : filtered.length - 1,
          );
          setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open && !searchable ? listboxId : undefined}
        aria-activedescendant={open && !searchable ? activeOptionId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="combobox__trigger-label">
          {selected ? selected.label : placeholder}
        </span>
        <IconChevronDown size={16} />
      </button>

      {open && (
        <div ref={panelRef} className="combobox__panel">
          {searchable && (
            <div className="combobox__search">
              <IconSearch size={14} />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                className="combobox__search-input"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={ariaLabel ?? searchPlaceholder}
                aria-expanded="true"
                aria-controls={listboxId}
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
              />
            </div>
          )}

          <ScrollArea ref={listRef} id={listboxId} className="combobox__list" role="listbox">
            {filtered.length === 0 ? (
              <div className="combobox__empty">{noOptionsMessage}</div>
            ) : (
              filtered.map((option, idx) => (
                <button
                  key={option.value}
                  id={`${listboxId}-option-${option.value}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={option.value === value}
                  className={`combobox__option ${idx === highlightedIndex ? "combobox__option--highlighted" : ""} ${option.value === value ? "combobox__option--selected" : ""}`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  {option.icon}
                  <span className="combobox__option-label">{option.label}</span>
                  {option.value === value ? (
                    <IconCheck size={14} />
                  ) : null}
                </button>
              ))
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
