# Command Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace duplicated Cmd+K search lists with one typed registry that powers navigation-only Quick Open and action-only Command Palette, with CI coverage for registered public routes.

**Architecture:** app/routes.ts owns public route metadata and requires a Quick Open entry for every public route. app/commandRegistry.ts turns static route definitions and live documents/decks/cards/trash into executable palette entries; CommandPalette.tsx renders either surface from the same model. App owns navigation and side effects, passes those handlers to the registry, and no longer switches on legacy search-result kinds.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Tauri desktop app.

---

## File structure

- Create: apps/desktop/src/app/routes.ts — route union, settings-section union, exhaustive public-route metadata.
- Create: apps/desktop/src/app/commandRegistry.ts — palette entry types, fuzzy ranking, static/dynamic command construction, and command-surface validation.
- Create: apps/desktop/src/app/commandRegistry.test.ts — registration coverage, surface separation, breadcrumb matching, and execution tests.
- Modify: apps/desktop/src/features/search/CommandPalette.tsx — render supplied entries for quick-open or command-palette and own each shortcut.
- Modify: apps/desktop/src/features/search/CommandPalette.test.tsx — test distinct shortcuts, breadcrumb output, and action grouping.
- Modify: apps/desktop/src/app/App.tsx — consume route and command registries and remove legacy SearchResult dispatch.
- Modify: apps/desktop/src/features/settings/SettingsPage.tsx — accept an initial section for route-only Settings destinations.
- Modify: apps/desktop/src/app/App.test.tsx — cover destination navigation and action/theme changes.
- Modify: apps/desktop/src/app/AppSidebar.tsx, apps/desktop/src/styles/tokens.css, apps/desktop/tests/e2e/library.spec.ts, apps/desktop/README.md — expose and document the two surfaces.

### Task 1: Establish an exhaustive public-route catalog

**Files:**
- Create: apps/desktop/src/app/routes.ts
- Test: apps/desktop/src/app/commandRegistry.test.ts

- [ ] **Step 1: Write the failing route-coverage test**

~~~ts
import { expect, test } from "vitest";
import { PUBLIC_ROUTE_CATALOG, publicRouteNames } from "./routes";

test("registers every public route for Quick Open", () => {
  expect(Object.keys(PUBLIC_ROUTE_CATALOG).sort()).toEqual([...publicRouteNames].sort());
  expect(PUBLIC_ROUTE_CATALOG.settings).toMatchObject({
    id: "route.settings",
    breadcrumb: ["Settings"],
  });
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- --run src/app/commandRegistry.test.ts

Expected: FAIL with a module-not-found error for ./routes.

- [ ] **Step 3: Define route names, route union, and catalog**

~~~ts
export type SettingsSection = "account" | "appearance" | "drive" | "model";
export const publicRouteNames = ["library", "memora", "trash", "settings"] as const;
export type PublicRouteName = (typeof publicRouteNames)[number];

export const PUBLIC_ROUTE_CATALOG = {
  library: { id: "route.library", title: "Library", aliases: ["documents", "pdf"], breadcrumb: ["Library"] },
  memora: { id: "route.memora", title: "Memora", aliases: ["flashcards", "decks"], breadcrumb: ["Memora"] },
  trash: { id: "route.trash", title: "Trash", aliases: ["deleted cards"], breadcrumb: ["Trash"] },
  settings: { id: "route.settings", title: "Settings", aliases: ["preferences"], breadcrumb: ["Settings"] },
} satisfies Record<PublicRouteName, { id: string; title: string; aliases: string[]; breadcrumb: string[] }>;
~~~

Move the existing AppRoute discriminated union into this file, add settings.section?: SettingsSection, and export it. Keep reader, review, deckDetail, cardBrowser, and admin variants with their existing payloads.

- [ ] **Step 4: Run test to verify it passes**

Run: npm test -- --run src/app/commandRegistry.test.ts

Expected: PASS for registers every public route for Quick Open.

- [ ] **Step 5: Commit**

~~~bash
git add apps/desktop/src/app/routes.ts apps/desktop/src/app/commandRegistry.test.ts
git commit -m "feat: define public route command catalog"
~~~

### Task 2: Build and test the typed command registry

**Files:**
- Create: apps/desktop/src/app/commandRegistry.ts
- Modify: apps/desktop/src/app/commandRegistry.test.ts

- [ ] **Step 1: Write failing matching and surface-safety tests**

~~~ts
test("matches Quick Open entries by breadcrumb and never returns actions", async () => {
  const registry = createCommandRegistry(contextWith({
    documents: [document],
    decks: [],
  }));

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
  const registry = createCommandRegistry(contextWith({ setTheme }));
  const [entry] = await registry.search("command-palette", "dark theme");
  await entry.execute();
  expect(setTheme).toHaveBeenCalledWith("dark");
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- --run src/app/commandRegistry.test.ts

Expected: FAIL because createCommandRegistry does not exist.

- [ ] **Step 3: Implement exclusive entry types and search**

~~~ts
export type CommandSurface = "quick-open" | "command-palette";
export type CommandEntry = {
  id: string;
  surface: CommandSurface;
  title: string;
  aliases: string[];
  breadcrumb: string[];
  group: string;
  execute: () => void | Promise<void>;
};

function matches(entry: CommandEntry, query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const text = [entry.title, ...entry.aliases, ...entry.breadcrumb].join(" ").toLocaleLowerCase();
  return terms.every((term) => fuzzyMatch(text, term));
}
~~~

Create createCommandRegistry(context). Context contains the current documents/decks, injected card and trash search functions, route/document/deck/card/trash open handlers, importPdf, reviewToday, and setTheme. Its search(surface, query) returns only entries for that surface. Populate these entries:

- Quick Open: public routes; Appearance, Google Drive, Model, and Account settings sections; documents; decks; backend card matches; trash cards.
- Command Palette: Import PDF, Review today, Theme: Light, Theme: Dark, Theme: System.

Resolve cards and trash only for non-empty queries. Use breadcrumbs Library › Documents, Memora › Decks, Memora › <deck name> › Cards, and Trash › <deck name>. Construct the entry execute closure when creating each entry; do not return a kind field that App must switch on.

- [ ] **Step 4: Run test to verify it passes**

Run: npm test -- --run src/app/commandRegistry.test.ts

Expected: PASS for coverage, breadcrumb matching, surface separation, and action execution.

- [ ] **Step 5: Commit**

~~~bash
git add apps/desktop/src/app/commandRegistry.ts apps/desktop/src/app/commandRegistry.test.ts
git commit -m "feat: add typed command registry"
~~~

### Task 3: Convert the palette UI to two shortcut surfaces

**Files:**
- Modify: apps/desktop/src/features/search/CommandPalette.tsx
- Modify: apps/desktop/src/features/search/CommandPalette.test.tsx
- Modify: apps/desktop/src/styles/tokens.css

- [ ] **Step 1: Write failing component tests**

~~~tsx
test("opens Quick Open with Cmd+K and renders a breadcrumb", async () => {
  render(<CommandPalette mode="quick-open" search={search} />);
  await user.keyboard("{Meta>}k{/Meta}");
  await user.type(screen.getByRole("searchbox"), "linear");
  expect(await screen.findByText("Library › Documents")).toBeInTheDocument();
});

test("opens Command Palette with Shift+Cmd+K and executes", async () => {
  const execute = vi.fn();
  render(<CommandPalette mode="command-palette" search={vi.fn().mockResolvedValue([entry(execute)])} />);
  await user.keyboard("{Shift>}{Meta>}k{/Meta}{/Shift}");
  await user.keyboard("{Enter}");
  expect(execute).toHaveBeenCalledOnce();
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- --run src/features/search/CommandPalette.test.tsx

Expected: FAIL because the current palette has no mode prop and handles only Cmd/Ctrl+K.

- [ ] **Step 3: Implement mode-aware rendering**

Replace SearchResult props and NAV_ITEMS with CommandEntry props. Add mode, label, shortcut, and search props. Register exactly one key listener per mounted palette:

~~~ts
const matchesShortcut = mode === "quick-open"
  ? (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "k"
  : (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k";
~~~

Render entry.title in the primary span, entry.breadcrumb.join(" › ") in the existing small element, and entry.group as section header. On click or Enter, await entry.execute before closing. If it rejects, retain the dialog and render the error. Keep Escape, focus restoration, debounce, arrow wrapping, and focus trapping.

- [ ] **Step 4: Run test to verify it passes**

Run: npm test -- --run src/features/search/CommandPalette.test.tsx

Expected: PASS, including adapted focus and Escape coverage.

- [ ] **Step 5: Commit**

~~~bash
git add apps/desktop/src/features/search/CommandPalette.tsx apps/desktop/src/features/search/CommandPalette.test.tsx apps/desktop/src/styles/tokens.css
git commit -m "feat: split quick open from command palette"
~~~

### Task 4: Integrate routes, settings, and registry actions

**Files:**
- Modify: apps/desktop/src/app/App.tsx
- Modify: apps/desktop/src/features/settings/SettingsPage.tsx
- Modify: apps/desktop/src/app/App.test.tsx
- Modify: apps/desktop/src/app/AppSidebar.tsx

- [ ] **Step 1: Write failing App tests**

~~~tsx
test("opens Appearance from Quick Open without changing the theme", async () => {
  render(<App libraryApi={libraryApi} />);
  await user.keyboard("{Meta>}k{/Meta}");
  await user.type(screen.getByRole("searchbox"), "appearance");
  await user.keyboard("{Enter}");
  expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument();
});

test("changes theme from Command Palette", async () => {
  render(<App libraryApi={libraryApi} />);
  await user.keyboard("{Shift>}{Meta>}k{/Meta}{/Shift}");
  await user.type(screen.getByRole("searchbox"), "dark theme");
  await user.keyboard("{Enter}");
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm test -- --run src/app/App.test.tsx

Expected: FAIL because App still creates legacy search results and does not handle Shift+Cmd/Ctrl+K.

- [ ] **Step 3: Replace legacy App search wiring**

Import AppRoute from routes.ts. Remove the local AppRoute union, SearchResult import, fuzzyMatch, search callback, and handleOpenSearchResult. Use const { resolvedTheme, setTheme } = useTheme(). Memoize createCommandRegistry with these handlers:

~~~ts
openRoute: (route) => setRoute(route),
openDocument: handleOpen,
openDeck: handleOpenDeck,
openCard: async (id, title) => {
  const card = await learning.getCard(id);
  const deck = decks.find((candidate) => candidate.id === card.deckId);
  if (!deck) throw new Error("This card's deck is no longer available.");
  setRoute({ name: "deckDetail", deck, searchQuery: title });
},
openTrash: () => setRoute({ name: "trash" }),
importPdf: () => handleImport(),
reviewToday: () => handleReviewToday(),
setTheme,
~~~

Render one CommandPalette in quick-open mode and one in command-palette mode. Keep the sidebar button attached to the Quick Open ref.

- [ ] **Step 4: Add route-only settings sections**

Add initialSection?: SettingsSection to SettingsPage props. Initialize its existing searchQuery from the matching section keyword and pass route.section from App. Register Appearance, Google Drive, Model, and Account as Quick Open destinations. None may invoke setTheme or another setting mutation.

- [ ] **Step 5: Run test to verify it passes**

Run: npm test -- --run src/app/App.test.tsx

Expected: PASS for sidebar Quick Open, Appearance navigation, and Shift+Cmd/Ctrl+K theme execution.

- [ ] **Step 6: Commit**

~~~bash
git add apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx apps/desktop/src/app/AppSidebar.tsx apps/desktop/src/features/settings/SettingsPage.tsx
git commit -m "feat: wire app commands through registry"
~~~

### Task 5: Verify CI-facing behavior end to end

**Files:**
- Modify: apps/desktop/tests/e2e/library.spec.ts
- Modify: apps/desktop/README.md

- [ ] **Step 1: Write a failing browser check**

~~~ts
test("Library exposes Quick Open and Command Palette shortcuts", async ({ page }) => {
  await page.keyboard.press("Meta+K");
  await expect(page.getByRole("dialog", { name: "Quick Open" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+Shift+K");
  await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
});
~~~

- [ ] **Step 2: Run test to verify it fails**

Run: npm run test:e2e -- --grep "Quick Open and Command Palette"

Expected: FAIL until updated dialog labels exist.

- [ ] **Step 3: Update documentation**

Document Cmd/Ctrl+K as Quick Open for destinations and Shift+Cmd/Ctrl+K as Command Palette for actions and direct settings. Do not claim the app stores source filesystem folders.

- [ ] **Step 4: Run full verification**

Run: npm test -- --run src/app/commandRegistry.test.ts src/features/search/CommandPalette.test.tsx src/app/App.test.tsx

Expected: PASS with no failed tests.

Run: npm run build

Expected: TypeScript and Vite build exit 0.

Run: npm run test:e2e

Expected: Playwright exits 0.

- [ ] **Step 5: Commit**

~~~bash
git add apps/desktop/tests/e2e/library.spec.ts apps/desktop/README.md
git commit -m "test: cover command registry shortcuts"
~~~

## Plan self-review

- Route coverage, internal breadcrumbs, exclusive surfaces, direct setting actions, keyboard behavior, focused tests, build, and end-to-end coverage map to the approved design.
- The plan uses createCommandRegistry, CommandEntry, AppRoute, SettingsSection, and the two surfaces consistently.
- Repository search finds no unfinished-plan markers.
