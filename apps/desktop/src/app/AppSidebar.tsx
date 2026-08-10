import { useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

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

function sameSurfaceOrder(left: readonly AppSidebarItem[], right: readonly AppSidebarItem[]): boolean {
  return left.length === right.length && left.every((item, index) => item.surfaceId === right[index]?.surfaceId);
}

function reorderPreviewItems(
  current: readonly AppSidebarItem[],
  sourceId: string,
  clientY: number,
  slotCenters: readonly number[],
): { readonly items: readonly AppSidebarItem[]; readonly overSurfaceId: string | null } {
  const movable = current.filter((item) => item.movable);
  const sourceIndex = movable.findIndex((item) => item.surfaceId === sourceId);
  if (sourceIndex < 0) return { items: current, overSurfaceId: null };

  const [source] = movable.splice(sourceIndex, 1);
  const firstSlotAfterPointer = slotCenters.findIndex((center) => clientY < center);
  let insertionIndex = firstSlotAfterPointer < 0 ? slotCenters.length : firstSlotAfterPointer;
  if (sourceIndex < insertionIndex) insertionIndex -= 1;
  insertionIndex = Math.max(0, Math.min(insertionIndex, movable.length));
  const overSurfaceId = movable[insertionIndex]?.surfaceId ?? movable[movable.length - 1]?.surfaceId ?? null;
  movable.splice(insertionIndex, 0, source);

  let movableIndex = 0;
  return {
    items: current.map((item) => item.movable ? movable[movableIndex++] : item),
    overSurfaceId,
  };
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
  const [previewItems, setPreviewItems] = useState<readonly AppSidebarItem[] | null>(null);
  const previewItemsRef = useRef<readonly AppSidebarItem[] | null>(null);
  const renderedItems = useMemo(() => previewItems ?? items, [items, previewItems]);
  const pointerDragRef = useRef<{
    sourceId: string;
    pointerId: number;
    dragging: boolean;
    initialItems: readonly AppSidebarItem[];
    startClientX: number;
    startClientY: number;
    lastClientX: number;
    lastClientY: number;
    initialLeft: number;
    initialTop: number;
    translateX: number;
    translateY: number;
    slotCenters: readonly number[];
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [draggingSurfaceId, setDraggingSurfaceId] = useState<string | null>(null);
  const [dragOverSurfaceId, setDragOverSurfaceId] = useState<string | null>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const previousRowRects = useRef<Map<string, DOMRect> | null>(null);
  const rowAnimationsRef = useRef(new Map<string, Animation>());

  const captureCurrentRowRects = useCallback(() => {
    const rects = new Map<string, DOMRect>();
    rowRefs.current.forEach((row, surfaceId) => rects.set(surfaceId, row.getBoundingClientRect()));
    previousRowRects.current = rects;
    return rects;
  }, []);

  const positionDraggedRow = useCallback((drag: NonNullable<typeof pointerDragRef.current>) => {
    const row = rowRefs.current.get(drag.sourceId);
    if (!row) return;
    const currentRect = row.getBoundingClientRect();
    const baseLeft = currentRect.left - drag.translateX;
    const baseTop = currentRect.top - drag.translateY;
    const desiredLeft = drag.initialLeft + drag.lastClientX - drag.startClientX;
    const desiredTop = drag.initialTop + drag.lastClientY - drag.startClientY;
    drag.translateX = desiredLeft - baseLeft;
    drag.translateY = desiredTop - baseTop;
    row.style.setProperty("--sidebar-drag-x", `${drag.translateX}px`);
    row.style.setProperty("--sidebar-drag-y", `${drag.translateY}px`);
  }, []);

  useLayoutEffect(() => {
    rowAnimationsRef.current.forEach((animation) => animation.cancel());
    rowAnimationsRef.current.clear();
    const drag = pointerDragRef.current;
    if (drag?.dragging) positionDraggedRow(drag);

    const nextRowRects = new Map<string, DOMRect>();
    rowRefs.current.forEach((row, surfaceId) => nextRowRects.set(surfaceId, row.getBoundingClientRect()));
    const beforeRects = previousRowRects.current;
    if (beforeRects) {
      nextRowRects.forEach((after, surfaceId) => {
        if (surfaceId === drag?.sourceId) return;
        const before = beforeRects.get(surfaceId);
        const row = rowRefs.current.get(surfaceId);
        if (!before || !row) return;
        const deltaX = before.left - after.left;
        const deltaY = before.top - after.top;
        if ((deltaX || deltaY) && typeof row.animate === "function") {
          const animation = row.animate(
            [
              { transform: `translate(${deltaX}px, ${deltaY}px)` },
              { transform: "translate(0, 0)" },
            ],
            { duration: 180, easing: "ease-out" },
          );
          rowAnimationsRef.current.set(surfaceId, animation);
          animation.onfinish = () => {
            if (rowAnimationsRef.current.get(surfaceId) === animation) {
              rowAnimationsRef.current.delete(surfaceId);
            }
          };
        }
      });
    }
    previousRowRects.current = nextRowRects;
  }, [positionDraggedRow, renderedItems]);

  useEffect(() => {
    const preview = previewItemsRef.current;
    if (!preview || draggingSurfaceId || !sameSurfaceOrder(items, preview)) return;
    previewItemsRef.current = null;
    setPreviewItems(null);
  }, [draggingSurfaceId, items, previewItems]);

  const resolvePointerTarget = useCallback((clientX: number, clientY: number) => {
    const drag = pointerDragRef.current;
    const navBounds = navRef.current?.getBoundingClientRect();
    if (!drag || !navBounds || clientX < navBounds.left || clientX > navBounds.right) {
      setDragOverSurfaceId(null);
      return;
    }

    const current = previewItemsRef.current ?? drag.initialItems;
    const next = reorderPreviewItems(current, drag.sourceId, clientY, drag.slotCenters);
    setDragOverSurfaceId(next.overSurfaceId);
    if (!sameSurfaceOrder(current, next.items)) {
      captureCurrentRowRects();
      previewItemsRef.current = next.items;
      setPreviewItems(next.items);
    }
  }, [captureCurrentRowRects]);

  const finishPointerDrag = useCallback((_clientX: number, _clientY: number) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    const finalItems = previewItemsRef.current ?? drag.initialItems;
    const changed = !sameSurfaceOrder(drag.initialItems, finalItems);
    if (drag.dragging && changed && onReorder) {
      const finalMovable = finalItems.filter((item) => item.movable);
      const sourceIndex = finalMovable.findIndex((item) => item.surfaceId === drag.sourceId);
      onReorder(drag.sourceId, finalMovable[sourceIndex + 1]?.surfaceId ?? null);
    } else if (!changed) {
      previewItemsRef.current = null;
      setPreviewItems(null);
    }
    const row = rowRefs.current.get(drag.sourceId);
    row?.style.removeProperty("--sidebar-drag-x");
    row?.style.removeProperty("--sidebar-drag-y");
    pointerDragRef.current = null;
    setDraggingSurfaceId(null);
    setDragOverSurfaceId(null);
  }, [onReorder]);

  const handlePointerDown = (item: AppSidebarItem, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onReorder || !item.movable) return;
    const row = rowRefs.current.get(item.surfaceId);
    const bounds = row?.getBoundingClientRect();
    if (!bounds) return;
    const slotCenters = items
      .filter((candidate) => candidate.movable)
      .map((candidate) => rowRefs.current.get(candidate.surfaceId)?.getBoundingClientRect())
      .filter((candidateBounds): candidateBounds is DOMRect => Boolean(candidateBounds))
      .map((candidateBounds) => candidateBounds.top + candidateBounds.height / 2)
      .sort((left, right) => left - right);
    pointerDragRef.current = {
      sourceId: item.surfaceId,
      pointerId: event.pointerId,
      dragging: false,
      initialItems: items,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      initialLeft: bounds.left,
      initialTop: bounds.top,
      translateX: 0,
      translateY: 0,
      slotCenters,
    };
    previewItemsRef.current = items;
    setPreviewItems(items);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updatePointerDrag = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    if (!drag.dragging) {
      drag.dragging = true;
      suppressClickRef.current = true;
      setDraggingSurfaceId(drag.sourceId);
    }
    drag.lastClientX = clientX;
    drag.lastClientY = clientY;
    positionDraggedRow(drag);
    resolvePointerTarget(clientX, clientY);
  }, [positionDraggedRow, resolvePointerTarget]);

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (pointerDragRef.current?.pointerId !== event.pointerId) return;
      event.preventDefault();
      updatePointerDrag(event.pointerId, event.clientX, event.clientY);
    };
    const handleWindowPointerUp = (event: PointerEvent) => {
      if (pointerDragRef.current?.pointerId !== event.pointerId) return;
      finishPointerDrag(event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [finishPointerDrag, updatePointerDrag]);

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
      <ul className="app-sidebar__nav" ref={navRef}>
        {renderedItems.map((item) => {
          const Icon = item.icon;
          return (
            <li
              data-dragging={draggingSurfaceId === item.surfaceId ? "true" : undefined}
              data-drag-over={dragOverSurfaceId === item.surfaceId ? "true" : undefined}
              data-reorderable={item.movable && Boolean(onReorder) ? "true" : undefined}
              data-surface-id={item.surfaceId}
              key={item.surfaceId}
              ref={(row) => {
                if (row) rowRefs.current.set(item.surfaceId, row);
                else rowRefs.current.delete(item.surfaceId);
              }}
            >
              <button
                aria-current={active === item.section ? "page" : undefined}
                className={`app-sidebar__nav-item ${active === item.section ? "is-active" : ""}`}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  onNavigate(item.surfaceId);
                }}
                onPointerDown={(event) => handlePointerDown(item, event)}
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
