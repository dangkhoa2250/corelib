import { useCallback, useState, type ComponentType, type MouseEvent as ReactMouseEvent } from "react";

import { IconLibrary, IconMemora, IconSearch, IconSettings, IconTrash } from "./icons";

export type AppSection = "library" | "memora" | "trash" | "settings";

const SIDEBAR_MIN_WIDTH = 160;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 220;

interface AppSidebarProps {
  active: AppSection;
  onNavigate: (section: AppSection) => void;
  onSearchClick: () => void;
  onSettingsClick: () => void;
}

const NAV_ITEMS: { section: AppSection; label: string; icon: ComponentType }[] = [
  { section: "library", label: "Library", icon: IconLibrary },
  { section: "memora", label: "Memora", icon: IconMemora },
  { section: "trash", label: "Trash", icon: IconTrash },
];

export function AppSidebar({ active, onNavigate, onSearchClick, onSettingsClick }: AppSidebarProps) {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);

  const handleResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (ev: MouseEvent) => {
        const next = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth + ev.clientX - startX),
        );
        setWidth(next);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  return (
    <nav aria-label="Primary" className="app-sidebar" style={{ width, flexBasis: width }}>
      <button
        aria-label="Search (Command K)"
        className="app-sidebar__search"
        onClick={onSearchClick}
        type="button"
      >
        <span aria-hidden="true" className="app-sidebar__search-icon"><IconSearch /></span>
        <span className="app-sidebar__search-label">Search</span>
        <kbd className="app-sidebar__search-kbd">⌘K</kbd>
      </button>
      <ul className="app-sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.section}>
              <button
                aria-current={active === item.section ? "page" : undefined}
                className={`app-sidebar__nav-item ${active === item.section ? "is-active" : ""}`}
                onClick={() => onNavigate(item.section)}
                type="button"
              >
                <span aria-hidden="true" className="app-sidebar__nav-icon"><Icon /></span>
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="app-sidebar__footer">
        <button
          aria-current={active === "settings" ? "page" : undefined}
          className={`app-sidebar__nav-item ${active === "settings" ? "is-active" : ""}`}
          onClick={onSettingsClick}
          type="button"
        >
          <span aria-hidden="true" className="app-sidebar__nav-icon"><IconSettings /></span>
          Settings
        </button>
      </div>
      <div
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        className="app-sidebar__resize-handle"
        onMouseDown={handleResizeStart}
        role="separator"
      />
    </nav>
  );
}
