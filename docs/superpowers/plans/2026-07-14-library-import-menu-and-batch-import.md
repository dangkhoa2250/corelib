# Library Import Menu and Batch Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Consolidate Library imports in an accessible source dropdown and import every selected PDF concurrently while rendering an independent loading card for each file.

**Architecture:** Extract an \`ImportMenu\` presentation component for the Library header. Keep App as the owner of picker, Drive routing, pending-import state, and error aggregation; replace its single-operation guard and sequential loop with concurrent per-file jobs.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tauri dialog plugin, semantic CSS tokens.

---

## File structure

- Create: \`apps/desktop/src/features/library/ImportMenu.tsx\` — accessible source dropdown.
- Create: \`apps/desktop/src/features/library/ImportMenu.test.tsx\` — menu behavior tests.
- Create: \`apps/desktop/src/assets/import-sources/google-drive.png\` and \`onedrive.svg\` — unaltered official local assets. Google’s current standalone product mark is PNG; OneDrive remains SVG.
- Modify: \`apps/desktop/src/features/library/LibraryPage.tsx\`, \`LibraryPage.test.tsx\`, \`apps/desktop/src/app/App.tsx\`, \`App.test.tsx\`, and \`apps/desktop/src/styles/tokens.css\`.

### Task 1: Define the import menu with tests

**Files:**
- Create: \`apps/desktop/src/features/library/ImportMenu.test.tsx\`
- Create: \`apps/desktop/src/features/library/ImportMenu.tsx\`

- [ ] **Step 1: Write the failing test**

    test("opens sources and invokes only enabled actions", async () => {
      const user = userEvent.setup();
      const onUpload = vi.fn();
      const onGoogleDrive = vi.fn();
      render(<ImportMenu onUpload={onUpload} onGoogleDrive={onGoogleDrive} />);
      await user.click(screen.getByRole("button", { name: "Import" }));
      await user.click(screen.getByRole("menuitem", { name: "Upload file" }));
      expect(onUpload).toHaveBeenCalledOnce();
      await user.click(screen.getByRole("button", { name: "Import" }));
      expect(screen.getByRole("menuitem", { name: /Google Drive/ })).toBeEnabled();
      expect(screen.getByRole("menuitem", { name: /iCloud Drive.*Coming soon/ })).toBeDisabled();
      expect(screen.getByRole("menuitem", { name: /OneDrive.*Coming soon/ })).toBeDisabled();
    });

- [ ] **Step 2: Verify RED**

Run: \`npm test -- src/features/library/ImportMenu.test.tsx\`

Expected: FAIL because \`ImportMenu\` does not exist.

- [ ] **Step 3: Implement the minimal menu**

Create a button with \`aria-haspopup="menu"\` and \`aria-expanded\`. Render a \`role="menu"\` containing \`role="menuitem"\` buttons for Upload file, Google Drive, iCloud Drive, and OneDrive. Call and close for the first two; disable the latter two with visible \`Coming soon\` text. Add Escape and outside-pointer close behavior. Use the existing neutral cloud for iCloud, an upload icon from \`app/icons.tsx\`, and local image assets for Google Drive/OneDrive with empty alt text.

- [ ] **Step 4: Verify GREEN**

Run: \`npm test -- src/features/library/ImportMenu.test.tsx\`

Expected: PASS.

- [ ] **Step 5: Commit**

    git add apps/desktop/src/features/library/ImportMenu.tsx apps/desktop/src/features/library/ImportMenu.test.tsx apps/desktop/src/assets/import-sources/google-drive.png apps/desktop/src/assets/import-sources/onedrive.svg
    git commit -m "feat: add library import source menu"

### Task 2: Integrate the menu and theme-aware styles

**Files:**
- Modify: \`apps/desktop/src/features/library/LibraryPage.tsx\`
- Modify: \`apps/desktop/src/features/library/LibraryPage.test.tsx\`
- Modify: \`apps/desktop/src/styles/tokens.css\`

- [ ] **Step 1: Write the failing LibraryPage test**

    test("renders one Import menu instead of source buttons", () => {
      render(<LibraryPage documents={[document]} onImport={() => {}} onOpen={() => {}} onOpenDrive={() => {}} />);
      expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Import from Mac" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Google Drive" })).not.toBeInTheDocument();
    });

- [ ] **Step 2: Verify RED**

Run: \`npm test -- src/features/library/LibraryPage.test.tsx\`

Expected: FAIL because the old two buttons still render.

- [ ] **Step 3: Replace the header group**

Render \`<ImportMenu onUpload={onImport} onGoogleDrive={() => onOpenDrive?.()} />\` in the header. The component contract must not invoke Google Drive when that callback is unavailable.

- [ ] **Step 4: Add CSS**

Add \`.library-import-menu\`, \`__items\`, and \`__item\` rules using \`--main-bg\`, \`--surface-1\`, \`--text-primary\`, \`--text-secondary\`, \`--border-strong\`, \`--interactive-selected\`, and \`--shadow-xl\`. Include visible keyboard focus and disabled opacity/cursor. Do not add hard-coded theme colors or invert brand marks.

- [ ] **Step 5: Verify GREEN and commit**

Run: \`npm test -- src/features/library/LibraryPage.test.tsx src/features/library/ImportMenu.test.tsx\`

Expected: PASS.

    git add apps/desktop/src/features/library/LibraryPage.tsx apps/desktop/src/features/library/LibraryPage.test.tsx apps/desktop/src/styles/tokens.css
    git commit -m "refactor: consolidate library import actions"

### Task 3: Run each selected file import concurrently

**Files:**
- Modify: \`apps/desktop/src/app/App.tsx\`
- Modify: \`apps/desktop/src/app/App.test.tsx\`

- [ ] **Step 1: Write the failing concurrency test**

    test("shows a pending card per selected file and imports concurrently", async () => {
      const first = deferred<typeof document[]>();
      const second = deferred<typeof document[]>();
      const importDocuments = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      render(<App libraryApi={{ list: vi.fn().mockResolvedValue([]), pick: vi.fn().mockResolvedValue(["/a.pdf", "/b.pdf"]), importDocuments }} />);
      await user.click(screen.getByRole("button", { name: "Import" }));
      await user.click(screen.getByRole("menuitem", { name: "Upload file" }));
      expect(await screen.findByLabelText("Importing a")).toBeInTheDocument();
      expect(screen.getByLabelText("Importing b")).toBeInTheDocument();
      await waitFor(() => expect(importDocuments).toHaveBeenCalledTimes(2));
      first.resolve([]);
      await waitFor(() => expect(screen.queryByLabelText("Importing a")).not.toBeInTheDocument());
      expect(screen.getByLabelText("Importing b")).toBeInTheDocument();
    });

- [ ] **Step 2: Verify RED**

Run: \`npm test -- src/app/App.test.tsx\`

Expected: FAIL because \`handleImport\` rejects pending work and imports sequentially.

- [ ] **Step 3: Implement independent jobs**

Remove the \`pendingImports.length > 0\` early return. Append generated \`PendingImport\` items to current state before starting work. Replace the \`for\` loop with \`await Promise.all(paths.map(async ...))\`; each callback calls \`libraryApi.importDocuments([path])\`, merges successful documents, records only its own error, and removes only its own pending ID in \`finally\`. Remove the final blanket \`setPendingImports([])\`. Reload after the originating batch settles.

- [ ] **Step 4: Verify GREEN and commit**

Run: \`npm test -- src/app/App.test.tsx\`

Expected: PASS.

    git add apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
    git commit -m "feat: import local PDFs concurrently"

### Task 4: Verify production behavior

**Files:** Verify only.

- [ ] **Step 1: Run all frontend tests**

Run: \`npm test\`

Expected: PASS.

- [ ] **Step 2: Build**

Run: \`npm run build\`

Expected: PASS.

- [ ] **Step 3: Manual two-theme check**

Run: \`npm run tauri dev\`

In light and dark mode, verify menu contrast, focus, Escape/outside close, disabled rows, brand mark legibility, multiple simultaneous placeholders, and responsive navigation during import.
