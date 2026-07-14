import { useEffect, useRef, useState } from "react";

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface ActionMenuProps {
  label: string;
  items: ActionMenuItem[];
  triggerLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function ActionMenu({ label, items, triggerLabel, disabled = false, className }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.document.addEventListener("click", closeOnOutsideClick);
    return () => window.document.removeEventListener("click", closeOnOutsideClick);
  }, [open]);

  return (
    <div className={["action-menu", className].filter(Boolean).join(" ")} ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="action-menu__trigger"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        type="button"
      >
        {triggerLabel ?? label}
      </button>
      {open ? (
        <div className="action-menu__popover" role="menu">
          {items.map((item) => (
            <button
              className={`action-menu__item${item.destructive ? " action-menu__item--destructive" : ""}`}
              disabled={item.disabled}
              key={item.label}
              onClick={(event) => {
                event.stopPropagation();
                if (item.disabled) return;
                item.onSelect();
                setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
