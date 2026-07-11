import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconSearch } from "../app/icons";

export interface ComboboxOption<T extends string> {
  value: T;
  label: string;
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
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
      setQuery("");
      setHighlightedIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
      const idx = filtered.findIndex((o) => o.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [open, filtered, value]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
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

  return (
    <div className="combobox">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="combobox__trigger"
        onClick={() => !disabled && setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="combobox__trigger-label">
          {selected ? selected.label : placeholder}
        </span>
        <IconChevronDown size={16} />
      </button>

      {open && (
        <div ref={panelRef} className="combobox__panel" role="listbox">
          <div className="combobox__search">
            <IconSearch size={14} />
            <input
              ref={searchRef}
              type="text"
              className="combobox__search-input"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div ref={listRef} className="combobox__list">
            {filtered.length === 0 ? (
              <div className="combobox__empty">{noOptionsMessage}</div>
            ) : (
              filtered.map((option, idx) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={`combobox__option ${idx === highlightedIndex ? "combobox__option--highlighted" : ""} ${option.value === value ? "combobox__option--selected" : ""}`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                >
                  <span className="combobox__option-label">{option.label}</span>
                  {option.value === value ? (
                    <IconCheck size={14} />
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
