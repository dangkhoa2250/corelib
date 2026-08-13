import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

export interface CompactToolbarMenuItem {
  label: string;
  icon?: ReactNode;
  /** Renders the icon alone; the label stays available as the accessible name. */
  iconOnly?: boolean;
  active: boolean;
  disabled?: boolean;
  role?: "menuitemcheckbox" | "menuitemradio";
  onSelect(): void;
}

export interface CompactToolbarMenuProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  items: CompactToolbarMenuItem[];
  layout?: "vertical" | "horizontal";
}

const MENU_OPEN_EVENT = "corelib-toolbar-menu-open";

/**
 * One compact dropdown for the formatting toolbar. Owns its trigger,
 * dismissal, focus restoration, and keyboard navigation; peers close when
 * another menu opens.
 */
export function CompactToolbarMenu({
  label,
  icon,
  active = false,
  disabled = false,
  items,
  layout = "vertical",
}: CompactToolbarMenuProps) {
  const instanceId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const close = () => setOpen(false);

  // A peer menu opening (or this menu opening elsewhere) closes this one.
  useEffect(() => {
    if (!open) return;
    const onMenuOpen = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (custom.detail !== instanceId) close();
    };
    document.addEventListener(MENU_OPEN_EVENT, onMenuOpen);
    return () => document.removeEventListener(MENU_OPEN_EVENT, onMenuOpen);
  }, [open, instanceId]);

  // Any pointer press outside this menu dismisses it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    document.dispatchEvent(new CustomEvent(MENU_OPEN_EVENT, { detail: instanceId }));
  };

  const focusItem = (index: number) => {
    itemRefs.current[index]?.focus();
  };

  const selectItem = (index: number) => {
    if (index < 0 || items[index].disabled) return;
    items[index].onSelect();
    close();
  };

  const moveFocus = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const currentIndex = itemRefs.current.findIndex((element) => element === document.activeElement);
    const position = enabledIndexes.indexOf(currentIndex);
    const next =
      position < 0
        ? 0
        : (position + direction + enabledIndexes.length) % enabledIndexes.length;
    focusItem(enabledIndexes[next]);
  };

  // Keyboard navigation while the menu is open. Registered on the document in
  // the capture phase so it wins over host dialogs, and so keys work even
  // when pointer opening deliberately left focus in the editor.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const focusInMenu = rootRef.current?.contains(document.activeElement) ?? false;
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          event.stopPropagation();
          close();
          triggerRef.current?.focus();
          break;
        case "ArrowDown":
          event.preventDefault();
          event.stopPropagation();
          if (focusInMenu) moveFocus(1);
          else focusItem(enabledIndexes[0]);
          break;
        case "ArrowUp":
          event.preventDefault();
          event.stopPropagation();
          if (focusInMenu) moveFocus(-1);
          else focusItem(enabledIndexes[enabledIndexes.length - 1]);
          break;
        case "Enter":
        case " ":
          const index = itemRefs.current.findIndex((element) => element === document.activeElement);
          if (index >= 0) {
            event.preventDefault();
            event.stopPropagation();
            selectItem(index);
          }
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, enabledIndexes, items]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (open) return;
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
      // Keyboard opening moves roving focus into the menu after it renders.
      setTimeout(() => {
        if (rootRef.current?.contains(document.activeElement)) {
          focusItem(enabledIndexes[0]);
        }
      }, 0);
    }
  };

  return (
    <div
      className="card-rich-text-editor__toolbar-menu-root"
      onKeyDown={handleKeyDown}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={
          active || open
            ? "card-rich-text-editor__toolbar-button is-active"
            : "card-rich-text-editor__toolbar-button"
        }
        disabled={disabled}
        onClick={openMenu}
        onMouseDown={(event) => event.preventDefault()}
        ref={triggerRef}
        title={label}
        type="button"
      >
        {icon}
      </button>
      {open ? (
        <div
          className={
            layout === "horizontal"
              ? "card-rich-text-editor__toolbar-menu card-rich-text-editor__toolbar-menu--horizontal"
              : "card-rich-text-editor__toolbar-menu"
          }
          role="menu"
        >
          {items.map((item, index) => {
            const role = item.role ?? "menuitem";
            return (
              <button
                aria-checked={role === "menuitem" ? undefined : item.active}
                aria-label={item.label}
                className={
                  [
                    "card-rich-text-editor__toolbar-menu-item",
                    item.iconOnly ? "card-rich-text-editor__toolbar-menu-item--icon-only" : "",
                    item.active ? "is-active" : "",
                  ].filter(Boolean).join(" ")
                }
                disabled={item.disabled}
                key={item.label}
                onClick={() => selectItem(index)}
                onMouseDown={(event) => event.preventDefault()}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                role={role}
                title={item.label}
                type="button"
              >
                {item.icon ?? null}
                {item.iconOnly ? null : <span>{item.label}</span>}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
