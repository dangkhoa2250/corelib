import type { ComponentType } from "react";

import { IconLibrary, IconMemora, IconSearch } from "./icons";

export type AppSection = "library" | "memora";

interface AppSidebarProps {
  active: AppSection;
  onNavigate: (section: AppSection) => void;
  onSearchClick: () => void;
}

const NAV_ITEMS: { section: AppSection; label: string; icon: ComponentType }[] = [
  { section: "library", label: "Library", icon: IconLibrary },
  { section: "memora", label: "Memora", icon: IconMemora },
];

export function AppSidebar({ active, onNavigate, onSearchClick }: AppSidebarProps) {
  return (
    <nav aria-label="Primary" className="app-sidebar">
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
    </nav>
  );
}
