# Extensible Statistics Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete local-first personal Statistics platform and privacy-preserving aggregate Admin Analytics.

**Architecture:** Implementation is split into three independently testable plans. Complete them in order: canonical local data first, reusable personal UI second, and opt-in server analytics last. Never begin a dependent plan on a dirty or failing predecessor.

**Tech Stack:** Tauri 2, Rust, SQLite/rusqlite, React 19, TypeScript, PocketBase hooks/migrations, Vitest, Testing Library, Bash smoke tests.

---

## Required reading

1. `docs/superpowers/specs/2026-07-18-extensible-statistics-platform-design.md`
2. `.agents/skills/checking-command-registration/SKILL.md`
3. `.agents/skills/checking-scroll-surfaces/SKILL.md`
4. `AGENTS.md`

## Execution order

- [ ] **Phase 1: Local foundation and instrumentation**

Execute every checkbox in:

`docs/superpowers/plans/2026-07-18-statistics-local-foundation.md`

Exit gate:

```bash
cd apps/desktop && npm test && npm run build
cd ../.. && cargo test --all-targets --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
git status --short
```

Expected: all checks PASS and `git status --short` is empty.

- [ ] **Phase 2: Personal dashboard and reusable UI**

Execute every checkbox in:

`docs/superpowers/plans/2026-07-18-statistics-personal-dashboard.md`

Exit gate: automated checks pass, the public route catalog test includes Statistics, and a fresh `tauri dev` run verifies light/dark tokens plus vertical and horizontal `ScrollArea` behavior.

- [ ] **Phase 3: Opt-in Admin Analytics**

Execute every checkbox in:

`docs/superpowers/plans/2026-07-18-statistics-admin-analytics.md`

Exit gate: PocketBase smoke, desktop frontend, Rust, and clippy pass; cohort suppression and no-per-user response are demonstrated; fresh desktop Admin Analytics has no theme or scrollbar regressions.

## Spec coverage map

| Design requirement | Implementation task |
| --- | --- |
| Active-time, sessions, page visits, coverage, revisit | Local Foundation Tasks 1-4 and 6-7 |
| Memora cap, recall, lapse, Practice separation, due forecast | Local Foundation Tasks 4, 6, and 7 |
| Typed Tauri statistics boundary | Local Foundation Task 5 |
| Public route and Quick Open registration | Personal Dashboard Task 2 |
| Shared components and semantic theme tokens | Personal Dashboard Tasks 1 and 3 |
| Vertical/horizontal WKWebView-safe scrolling | Personal Dashboard Tasks 3, 4, and 10 |
| Heatmap, Graph, color, accessibility | Personal Dashboard Tasks 1 and 4-6 |
| Dynamic app registry and Overview | Personal Dashboard Tasks 6-7 |
| Reading/Memora/document/deck drill-down | Personal Dashboard Tasks 8-9 |
| Opt-in daily snapshots and idempotency | Admin Analytics Tasks 1-2 and 4-5 |
| Aggregate-only admin metrics and cohort suppression | Admin Analytics Tasks 3 and 6 |
| Privacy, offline, light/dark, fresh runtime | Admin Analytics Task 7 |

## Final completion gate

- [ ] Verify every acceptance criterion in the design spec has a corresponding passing test or recorded manual observation.
- [ ] Record `git rev-parse --short HEAD` and `git status --short`.
- [ ] State whether verification used fresh `tauri dev` or a freshly built release artifact.
- [ ] If release verification was performed, record the exact artifact path and confirm its modification time is newer than the build start.
- [ ] Do not overwrite `/Applications/Library.app` without explicit user approval.
