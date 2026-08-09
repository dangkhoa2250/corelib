import { useContext, useCallback, useState, type ComponentType, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";

import { IconHome, IconLibrary, IconMemora, IconSearch, IconSettings, IconSparkles, IconStatistics, IconTrash } from "./icons";
import { AccountContext } from "../features/account/AccountGate";
import { primaryShortcut } from "../lib/platform";
import type { PluginRegistry } from "../plugins/registry";

export type AppSection = "home" | "library" | "memora" | "trash" | "settings" | "admin" | "statistics";

const SIDEBAR_MIN_WIDTH = 160;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_DEFAULT_WIDTH = 220;

interface AppSidebarProps {
  active: AppSection;
  items: readonly AppSidebarItem[];
  onNavigate: (surfaceId: string) => void;
  onReorder?: (surfaceId: string, beforeSurfaceId: string | null) => void;
  onSearchClick: () => void;
  onSettingsClick: () => void;
  onAdminClick?: () => void;
}

export interface AppSidebarItem {
  readonly surfaceId: string;
  readonly section: AppSection;
  readonly label: string;
  readonly icon: ComponentType;
  readonly movable: boolean;
}

function sectionForBinding(bindingId: string): AppSection {
  switch (bindingId) {
    case "route.home": return "home";
    case "route.library": return "library";
    case "route.memora": return "memora";
    case "route.statistics": return "statistics";
    case "route.trash": return "trash";
    case "route.settings.drive":
    case "route.settings.memora":
    case "route.settings.model": return "settings";
    default: throw new Error(`Unsupported sidebar Surface binding: ${bindingId}`);
  }
}

function iconForId(iconId: string | undefined): ComponentType {
  switch (iconId) {
    case "home": return IconHome;
    case "library": return IconLibrary;
    case "memora": return IconMemora;
    case "statistics": return IconStatistics;
    case "trash": return IconTrash;
    case "settings": return IconSettings;
    default: return IconSparkles;
  }
}

export function createDefaultSidebarItems(
  registry: PluginRegistry,
  pinnedSurfaceIds?: readonly string[],
): readonly AppSidebarItem[] {
  const surfaces = registry.listSurfaces();
  const home = surfaces.find((surface) => surface.id === "route.home");
  if (!home) throw new Error("Corelib Home Surface is not registered.");
  const requestedPluginSurfaceIds = pinnedSurfaceIds ?? surfaces
    .filter((surface) => surface.owner.kind === "plugin" && surface.navigation?.defaultPinned)
    .map((surface) => surface.id);
  const orderedSurfaces = [
    home,
    ...requestedPluginSurfaceIds
      .map((surfaceId) => surfaces.find((surface) => surface.id === surfaceId))
      .filter((surface): surface is NonNullable<typeof surface> => Boolean(surface)),
  ];
  return Object.freeze(orderedSurfaces.map((surface) => Object.freeze({
    surfaceId: surface.id,
    section: sectionForBinding(surface.bindingId),
    label: surface.title,
    icon: iconForId(surface.icon),
    movable: surface.owner.kind === "plugin",
  })));
}

export function AppSidebar({ active, items, onNavigate, onReorder, onSearchClick, onSettingsClick, onAdminClick }: AppSidebarProps) {
  const [width, setWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const searchShortcut = primaryShortcut("K");
  const accountContext = useContext(AccountContext);
  const isAdmin = accountContext?.session?.profile?.role === "admin";
  const movableItems = items.filter((item) => item.movable);

  const handleDrop = (item: AppSidebarItem, event: DragEvent<HTMLLIElement>) => {
    if (!onReorder || !item.movable) return;
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === item.surfaceId) return;
    const itemIndex = movableItems.findIndex((candidate) => candidate.surfaceId === item.surfaceId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const droppedAfter = event.clientY > bounds.top + bounds.height / 2;
    const beforeSurfaceId = droppedAfter
      ? movableItems[itemIndex + 1]?.surfaceId ?? null
      : item.surfaceId;
    onReorder(sourceId, beforeSurfaceId);
  };

  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + ev.clientX - startX));
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
  }, [width]);

  return (
    <nav aria-label="Primary" className="app-sidebar" style={{ width, flexBasis: width }}>
      <div aria-hidden="true" className="app-sidebar__drag-region" data-tauri-drag-region="true" />
      <button aria-label={`Search (${searchShortcut})`} className="app-sidebar__search" onClick={onSearchClick} type="button">
        <span aria-hidden="true" className="app-sidebar__search-icon"><IconSearch /></span>
        <span className="app-sidebar__search-label">Search</span>
        <kbd className="app-sidebar__search-kbd">{searchShortcut}</kbd>
      </button>
      <ul className="app-sidebar__nav">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li
              draggable={item.movable && Boolean(onReorder)}
              key={item.surfaceId}
              onDragOver={(event) => {
                if (item.movable && onReorder) event.preventDefault();
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.surfaceId);
              }}
              onDrop={(event) => handleDrop(item, event)}
            >
              <button
                aria-current={active === item.section ? "page" : undefined}
                className={`app-sidebar__nav-item ${active === item.section ? "is-active" : ""}`}
                onClick={() => onNavigate(item.surfaceId)}
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
            <button aria-current={active === "admin" ? "page" : undefined} className={`app-sidebar__nav-item ${active === "admin" ? "is-active" : ""}`} onClick={onAdminClick} type="button">
              <span aria-hidden="true" className="app-sidebar__nav-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </span>
              Admin
            </button>
          </li>
        )}
      </ul>
      <div className="app-sidebar__footer">
        <button aria-current={active === "settings" ? "page" : undefined} className={`app-sidebar__nav-item ${active === "settings" ? "is-active" : ""}`} onClick={onSettingsClick} type="button">
          <span aria-hidden="true" className="app-sidebar__nav-icon"><IconSettings /></span>
          Settings
        </button>
        <button className="app-sidebar__nav-item app-sidebar__logout" onClick={() => accountContext?.signOut()} type="button">
          <span aria-hidden="true" className="app-sidebar__nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          </span>
          Log Out
        </button>
      </div>
      <div aria-label="Resize sidebar" aria-orientation="vertical" className="app-sidebar__resize-handle" onMouseDown={handleResizeStart} role="separator" />
    </nav>
  );
}
