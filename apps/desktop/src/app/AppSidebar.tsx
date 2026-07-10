export type AppSection = "library" | "memora";

interface AppSidebarProps {
  active: AppSection;
  onNavigate: (section: AppSection) => void;
  onSearchClick: () => void;
}

const NAV_ITEMS: { section: AppSection; label: string; icon: string }[] = [
  { section: "library", label: "Library", icon: "📚" },
  { section: "memora", label: "Memora", icon: "🧠" },
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
        <span aria-hidden="true" className="app-sidebar__search-icon">⌕</span>
        <span className="app-sidebar__search-label">Search</span>
        <kbd className="app-sidebar__search-kbd">⌘K</kbd>
      </button>
      <ul className="app-sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.section}>
            <button
              aria-current={active === item.section ? "page" : undefined}
              className={`app-sidebar__nav-item ${active === item.section ? "is-active" : ""}`}
              onClick={() => onNavigate(item.section)}
              type="button"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
