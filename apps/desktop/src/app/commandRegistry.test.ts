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

test("registers every public route for Quick Open", () => {
  expect(Object.keys(PUBLIC_ROUTE_CATALOG).sort()).toEqual([...publicRouteNames].sort());
  expect(PUBLIC_ROUTE_CATALOG.settings).toMatchObject({
    id: "route.settings",
    breadcrumb: ["Settings"],
  });
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

test("executes a Command Palette theme action", async () => {
  const setTheme = vi.fn();
  const registry = createCommandRegistry(createContext({ setTheme }));

  const [entry] = await registry.search("command-palette", "dark theme");
  await entry.execute();

  expect(setTheme).toHaveBeenCalledWith("dark");
});
