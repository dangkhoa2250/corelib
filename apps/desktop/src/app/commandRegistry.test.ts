import { expect, test, vi } from "vitest";

import { createCommandRegistry } from "./commandRegistry";
import { PUBLIC_ROUTE_CATALOG, publicRouteNames } from "./routes";

const document = {
  id: "linear-algebra",
  title: "Linear Algebra",
  author: "Gilbert Strang",
  source: "local_managed" as const,
  coverUrl: null,
  indexed: true,
  status: "ready" as const,
  lastReadPage: null,
  numPages: null,
};

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    documents: [],
    decks: [],
    searchCards: vi.fn().mockResolvedValue([]),
    searchTrash: vi.fn().mockResolvedValue([]),
    openRoute: vi.fn(),
    openDocument: vi.fn(),
    openDeck: vi.fn(),
    openCard: vi.fn(),
    openTrash: vi.fn(),
    importPdf: vi.fn(),
    reviewToday: vi.fn(),
    setTheme: vi.fn(),
    ...overrides,
  };
}

test("registers every public route for Quick Open", async () => {
  expect(Object.keys(PUBLIC_ROUTE_CATALOG).sort()).toEqual([...publicRouteNames].sort());
  expect(PUBLIC_ROUTE_CATALOG.settings).toMatchObject({
    id: "route.settings",
    breadcrumb: ["Settings"],
    route: { name: "settings" },
  });
  expect(PUBLIC_ROUTE_CATALOG.statistics).toEqual({
    id: "route.statistics",
    title: "Statistics",
    aliases: ["analytics", "activity", "progress", "insights"],
    breadcrumb: ["Statistics"],
    route: { name: "statistics" },
  });

  const registry = createCommandRegistry(createContext());
  const entries = await registry.search("quick-open", "");
  const catalogIds = Object.values(PUBLIC_ROUTE_CATALOG).map((route) => route.id);
  expect(entries.filter((entry) => catalogIds.includes(entry.id)).map((entry) => entry.id).sort())
    .toEqual(catalogIds.sort());
});

test("matches Quick Open entries by breadcrumb and never returns actions", async () => {
  const registry = createCommandRegistry(createContext({ documents: [document] }));

  await expect(registry.search("quick-open", "library linear")).resolves.toEqual([
    expect.objectContaining({
      title: "Linear Algebra",
      breadcrumb: ["Library", "Documents"],
      surface: "quick-open",
    }),
  ]);
  await expect(registry.search("quick-open", "dark theme")).resolves.toEqual([]);
});

test("opens a settings section from Quick Open without performing a setting action", async () => {
  const openRoute = vi.fn();
  const setTheme = vi.fn();
  const registry = createCommandRegistry(createContext({ openRoute, setTheme }));

  const [entry] = await registry.search("quick-open", "appearance");
  await entry.execute();

  expect(entry.breadcrumb).toEqual(["Settings", "General"]);
  expect(openRoute).toHaveBeenCalledWith({ name: "settings", section: "appearance" });
  expect(setTheme).not.toHaveBeenCalled();
});

test("registers Memora settings as an Apps destination in Quick Open", async () => {
  const openRoute = vi.fn();
  const registry = createCommandRegistry(createContext({ openRoute }));

  const [entry] = await registry.search("quick-open", "apps retention");
  await entry.execute();

  expect(entry).toEqual(expect.objectContaining({
    id: "route.settings.memora",
    title: "Memora",
    breadcrumb: ["Settings", "Apps"],
    surface: "quick-open",
  }));
  expect(openRoute).toHaveBeenCalledWith({ name: "settings", section: "memora" });
});

test("keeps card and trash provenance in Quick Open breadcrumbs", async () => {
  const registry = createCommandRegistry(createContext({
    searchCards: vi.fn().mockResolvedValue([{ kind: "card", id: "card-1", title: "Eigenvectors", subtitle: "Linear Algebra" }]),
    searchTrash: vi.fn().mockResolvedValue([{ id: "trash-1", title: "Old proof", deckName: "Calculus" }]),
  }));

  const [card] = await registry.search("quick-open", "eigenvectors");
  const [trash] = await registry.search("quick-open", "old proof");
  expect(card).toEqual(expect.objectContaining({ title: "Eigenvectors", breadcrumb: ["Memora", "Linear Algebra", "Cards"] }));
  expect(trash).toEqual(expect.objectContaining({ title: "Old proof", breadcrumb: ["Trash", "Calculus"] }));
});

test("finds the statistics route when searching Quick Open for insights", async () => {
  const openRoute = vi.fn();
  const registry = createCommandRegistry(createContext({ openRoute }));

  const [entry] = await registry.search("quick-open", "insights");
  expect(entry).toMatchObject({
    id: "route.statistics",
    group: "Navigate",
  });
  await entry.execute();
  expect(openRoute).toHaveBeenCalledWith({ name: "statistics" });
});

test("executes a Command Palette theme action", async () => {
  const setTheme = vi.fn();
  const registry = createCommandRegistry(createContext({ setTheme }));

  const [entry] = await registry.search("command-palette", "dark theme");
  await entry.execute();

  expect(setTheme).toHaveBeenCalledWith("dark");
});
