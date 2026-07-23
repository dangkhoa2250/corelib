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
