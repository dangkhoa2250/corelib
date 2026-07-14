import { useEffect, useRef, useState } from "react";
import { IconCloud, IconUpload } from "../../app/icons";
import googleDriveMark from "../../assets/import-sources/google-drive.svg";
import oneDriveMark from "../../assets/import-sources/onedrive.svg";

interface ImportMenuProps {
  onUpload: () => void;
  onGoogleDrive: () => void;
}

export function ImportMenu({ onUpload, onGoogleDrive }: ImportMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
        ?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        const items = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          ) ?? [],
        );
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        if (items.length === 0) return;

        event.preventDefault();
        if (event.key === "Home") {
          items[0]?.focus();
        } else if (event.key === "End") {
          items[items.length - 1]?.focus();
        } else {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          const nextIndex =
            (currentIndex + direction + items.length) % items.length;
          items[nextIndex]?.focus();
        }
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  const select = (action: () => void) => {
    action();
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="library-import-menu">
      <button
        ref={triggerRef}
        type="button"
        className="library-import-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Import
      </button>
      {open ? (
        <div ref={menuRef} className="library-import-menu__items" role="menu">
          <button type="button" role="menuitem" className="library-import-menu__item" onClick={() => select(onUpload)}>
            <IconUpload />
            <span>Upload file</span>
          </button>
          <button type="button" role="menuitem" className="library-import-menu__item" onClick={() => select(onGoogleDrive)}>
            <img src={googleDriveMark} alt="" aria-hidden="true" />
            <span>Google Drive</span>
          </button>
          <button type="button" role="menuitem" className="library-import-menu__item" disabled>
            <IconCloud />
            <span>iCloud Drive</span>
            <span className="library-import-menu__coming-soon">Coming soon</span>
          </button>
          <button type="button" role="menuitem" className="library-import-menu__item" disabled>
            <img src={oneDriveMark} alt="" aria-hidden="true" />
            <span>OneDrive</span>
            <span className="library-import-menu__coming-soon">Coming soon</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
