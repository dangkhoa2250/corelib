import { useContext, useCallback, useState, type ComponentType, type MouseEvent as ReactMouseEvent } from "react";

import { IconLibrary, IconMemora, IconSearch, IconSettings, IconStatistics, IconTrash } from "./icons";
import { AccountContext } from "../features/account/AccountGate";

export type AppSection = "library" | "memora" | "trash" | "settings" | "admin" | "statistics";

const SIDEBAR_MIN_WIDTH = 160;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 220;

interface AppSidebarProps {
  active: AppSection;
  onNavigate: (section: AppSection) => void;
  onSearchClick: () => void;
  onSettingsClick: () => void;
  onAdminClick?: () => void;
}

const NAV_ITEMS: { section: AppSection; label: string; icon: ComponentType }[] = [
  { section: "library", label: "Library", icon: IconLibrary },
  { section: "memora", label: "Memora", icon: IconMemora },
  { section: "statistics", label: "Statistics", icon: IconStatistics },
  { section: "trash", label: "Trash", icon: IconTrash },
];

export function AppSidebar({ active, onNavigate, onSearchClick, onSettingsClick, onAdminClick }: AppSidebarProps) {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  
  const accountContext = useContext(AccountContext);
  const isAdmin = accountContext?.session?.profile?.role === "admin";

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
      <div aria-hidden="true" className="app-sidebar__drag-region" data-tauri-drag-region="true" />
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
        {isAdmin && onAdminClick && (
          <li>
            <button
              aria-current={active === "admin" ? "page" : undefined}
              className={`app-sidebar__nav-item ${active === "admin" ? "is-active" : ""}`}
              onClick={onAdminClick}
              type="button"
            >
              <span aria-hidden="true" className="app-sidebar__nav-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              Admin
            </button>
          </li>
        )}
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
        <button
          className="app-sidebar__nav-item app-sidebar__logout"
          onClick={() => accountContext?.signOut()}
          type="button"
        >
          <span aria-hidden="true" className="app-sidebar__nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          Log Out
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
