# Statistics Dashboard Design QA

## Source visual truth

- The older dashboard reference's original temporary path is no longer available, and no in-repository copy of that older reference was preserved.
- The current blue reference exists at `/var/folders/bt/j1f5fvln301gww7qwxzwhfwr0000gn/T/codex-clipboard-bf46a518-1ebd-40fd-88c3-f4862a4bb51f.png`; no implementation screenshot or runtime comparison was captured.
- Viewport: unavailable.
- Intended states: Statistics overview in dark and light themes, including responsive layouts.

## Fresh CLI evidence at `c1d874c`

- From the repository root, `cd apps/desktop && npm test -- src/features/statistics src/components/ScrollArea.test.tsx src/styles/tokens.test.ts` passed 21 files / 147 tests in 3.23s.
- From the repository root, `cd apps/desktop && npm test` passed 76 files / 513 tests in 11.91s.
- From the repository root, `cd apps/desktop && npm run build` (`tsc && vite build`) passed; 6,318 modules were transformed and the build completed in 2.13s. The build emitted a warning about a chunk larger than 500 kB.
- From the repository root, `rg -n 'StatisticsColorPicker|statistics-color-picker|baseColor|Chart color|Custom chart color|Set chart color' apps/desktop/src/features/statistics --glob '!*.test.ts' --glob '!*.test.tsx'` exited 1 with no matches. The scan root was `apps/desktop/src/features/statistics`, and test TypeScript/TSX files were explicitly excluded.
- From the repository root, `rg -n '<select|linear-gradient|radial-gradient|conic-gradient|overflow-x[[:space:]]*:[[:space:]]*(auto|scroll)|width[[:space:]]*:[[:space:]]*max-content' apps/desktop/src/features/statistics` exited 1 with no matches. The scan root was `apps/desktop/src/features/statistics`.
- From the repository root, `rg -n --fixed-strings -e '--statistics-accent: var(--warning);' -e 'padding: 28px 20px 38px 28px;' -e 'padding: 26px 20px 36px 24px;' -e 'padding: 22px 20px 34px 18px;' -e '.statistics-heatmap-wrapper--year { --heatmap-gap: 1px; --heatmap-row-height: 17px; }' -e '.statistics-heatmap-wrapper--year .statistics-heatmap__cell { border-radius: 2px; }' apps/desktop/src/features/statistics/statistics.css` confirmed the warning accent, 20px right content padding at desktop/mid/mobile layouts, and Year gap 1 / row 17 / radius 2.
- From the repository root, `git diff --check` passed.

## 2026-07-23 CLI verification

- Tested source: `c1d874c` (test-only TypeScript compatibility follow-up to `4ba7316`).
- A prior full run was interfered with by overlapping Vitest processes and reported failures. The five affected files subsequently passed individually and together: from `apps/desktop`, `npm test -- src/app/App.test.tsx src/features/cards/CardComposer.test.tsx src/features/reader/ReaderPage.test.tsx src/features/statistics/components/ActivityChartCard.test.tsx src/features/statistics/components/ActivityHeatmap.test.tsx` passed 5 files / 95 tests. Two subsequent isolated full runs passed 76 files / 513 tests each.
- The final focused suite, isolated full suite, production frontend build, removed-API scan, forbidden-pattern scan, invariant scan, and `git diff --check` all passed with the results recorded above.
- No Library app, Tauri development or release app, Vite runtime, preview, browser, or other project UI runtime was launched or used for this verification.
- Actual light and dark WKWebView rendering, scroll behavior, and screenshot comparison remain unverified because runtime execution was forbidden.

## 2026-07-24 CLI verification

- Tested source revision: `b6484cc`. Dirty scope observed before verification: `apps/desktop/src/features/statistics/components/ActivityGraph.test.tsx`, `apps/desktop/src/features/statistics/components/ActivityGraph.tsx`, `apps/desktop/src/features/statistics/statistics.css`, and `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`. These pre-existing changes, including the Vitest cache, were not modified or staged by this QA record.
- Visual reference supplied for comparison (not opened in a browser or runtime): `/var/folders/bt/j1f5fvln301gww7qwxzwhfwr0000gn/T/codex-clipboard-bf46a518-1ebd-40fd-88c3-f4862a4bb51f.png`.
- From `apps/desktop`, `npm test -- src/features/statistics src/components/ScrollArea.test.tsx src/styles/tokens.test.ts` exited 0: 21 test files / 152 tests passed; Vitest duration 3.72s (wall-clock `time -p`: 4.46s).
- From `apps/desktop`, `npm test` exited 0: 76 test files / 518 tests passed; Vitest duration 11.12s (wall-clock `time -p`: 11.54s).
- From `apps/desktop`, `npm run build` (`tsc && vite build`) exited 0: 6,318 modules transformed and Vite completed in 2.28s (wall-clock `time -p`: 4.94s). It emitted the standard warning that some minified chunks exceed 500 kB.
- From the repository root, `git diff --check` exited 0 with no output.
- From the repository root, `rg -n '<select|linear-gradient|radial-gradient|conic-gradient|overflow-x[[:space:]]*:[[:space:]]*(auto|scroll)|width[[:space:]]*:[[:space:]]*max-content' apps/desktop/src/features/statistics` exited 1 with no matches.
- From the repository root, `rg -n --glob '!*.test.ts' --glob '!*.test.tsx' 'statistics-accent:\s*var\(--warning\)|color-mix\(in [^,]+,\s*var\(--warning\)' apps/desktop/src/features/statistics` exited 1 with no production-source matches.
- Process observation was read-only: no running `tauri dev`, `vite`, or `library_desktop` process was present (aside from the process-search command itself).
- No Library app, Tauri process, Vite runtime, browser, or WKWebView comparison was launched, reused, or performed. The supplied image therefore does not establish rendered color fidelity; blue/accent colors remain unverified in an actual rendered surface.

## Visual comparison history

None. No full or focused rendered comparison was performed.

## Finding

Fresh WKWebView evidence is unavailable.

final result: blocked

Fresh rendered WKWebView visual comparison was intentionally not performed because the user explicitly instructed Codex not to run or open the Library/Tauri application. No already-open app or existing Vite process was used as verification evidence.

## 2026-07-24 Statistics Master-Detail Redesign QA

- Tested source revision: `64ff0a2` (includes commits from `a211913` through `64ff0a2`).
- Dirty scope after verification: `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json` (Vitest cache, not staged).
- Checkout path: `/Users/jason/project/corelib/.worktrees/statistics`.
- Launch mode: `tauri dev` started fresh from `apps/desktop` after killing a prior `tauri dev`/`vite`/`library_desktop` process set (PIDs 35274/35297/35537/35573). Vite dev server served at `http://localhost:1420/`. Rust binary recompiled in 7.75s.
- No installed `/Applications/Library.app` was used or overwritten.

### Automated command results

- **Full Rust suite** (`cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`): 199 passed, 1 failed. The single failure (`commands_tests::drive_download_runs_off_command_thread_without_holding_database_lock`) was verified as pre-existing on the clean HEAD by stashing all changes and re-running the same test — it failed identically. Unrelated to statistics work.
- **Full frontend suite** (`npm test` from `apps/desktop`): 82 test files / 545 tests passed in 12.38s.
- **Production frontend build** (`npm run build` from `apps/desktop`): `tsc && vite build` exited 0; 6,326 modules transformed in 2.42s. Pre-existing large-chunk warning (839 kB) noted but not treated as failure.
- **`git diff --check`**: clean (no output).
- **Forbidden-pattern scan** (`statistics.css`): no matches for `overflow: (auto|scroll)`, `::-webkit-scrollbar`, `gradient`, or `width: max-content`.

### Runtime verification (browser via Vite dev server)

The native Tauri WKWebView window could not be automated due to missing Screen Recording and Accessibility permissions for `screencapture`/AppleScript. Instead, the Vite dev server (serving the exact same React/CSS bundle the WKWebView loads) was verified in a browser with a temporary `__TAURI_INTERNALS__.invoke` mock shim returning realistic QA data (5 documents, 4 decks, full statistics). The shim was reverted; `git status` confirmed the source tree was clean afterward.

States verified in the browser:

1. **Statistics Overview** — unchanged: header with period picker, KPI metrics, activity heatmap, and app insight cards for Reading and Memora.
2. **Reading workspace** — opens with "All Reading" selected (`aria-current="page"`). Master-detail layout confirmed: `grid-template-columns: 272px minmax(0,1fr)`. Search box present. 5 books in entity list with author + progress meta.
3. **Book selection** — clicking a book updates only the right panel; left list remains mounted (no unmounting). Selection state correct. Search filtering works.
4. **Memora workspace** — opens with "All Memora" selected. Deck list in left pane. Search box "Search decks" present. Aggregate stats in right panel.
5. **Responsive collapse** — bug found and fixed (see below).

### Bug found and fixed during QA

**CSS class mismatch in narrow-viewport media query.** The `@media (max-width: 1180px)` block targeted `.statistics-scope-picker` (a class that does not exist in the DOM). The collapsed searchable picker renders with class `.statistics-master-detail__collapsed`, which is `display: none` by default and was never set to `display: block` at narrow width. Result: at ≤1180px the entity pane was hidden but the replacement combobox never appeared, leaving users with no way to select a book or deck.

Fix (commit `64ff0a2`): Changed the media query selector from `.statistics-scope-picker` to `.statistics-master-detail__collapsed`. Also removed the dead `.statistics-scope-picker { display: none; }` rule that was never referenced in any component. Verified post-fix: tokens.test.ts and StatisticsMasterDetail.test.tsx both pass (29 tests); production build exits 0.

### Limitations

- WKWebView-specific behaviors (native scroll thumb appearance, trackpad wheel propagation at list boundaries, focus ring rendering) were not verified in the native app due to automation permission constraints. These behaviors are covered by automated tests (ScrollArea.test.tsx, tokens.test.ts) but not by fresh runtime observation.
- Light/dark theme token rendering was not screenshot-compared against a reference.
- No screenshot artifacts from the native WKWebView were captured.

final result: passed (with limitations noted above)
