# Statistics Admin Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload consented daily app summaries idempotently and give admins aggregate-only Statistics views with minimum-cohort privacy protection.

**Architecture:** The desktop derives numeric daily snapshots from local statistics only after opt-in. A dedicated PocketBase collection upserts one row per account/day/app/schema, and admin endpoints aggregate those rows without exposing user records. Admin Analytics reuses the personal dashboard chart and state components.

**Tech Stack:** PocketBase JavaScript migrations/hooks, Bash smoke tests, Rust account client, React/TypeScript, Vitest, Testing Library.

**Depends on:** Both local-foundation and personal-dashboard plans completed and clean.

---

## File map

**Create:**

- `services/pocketbase/pb_migrations/1784347200_create_daily_statistics.js` — server collection.
- `services/pocketbase/pb_hooks/statistics.pb.js` — upload and aggregate routes.
- `apps/desktop/src/features/statistics/StatisticsAnalyticsSync.tsx` and test — opt-in sync coordinator.
- `apps/desktop/src/features/admin/AdminAnalyticsPage.tsx` and test — aggregate UI.

**Modify:**

- `services/pocketbase/tests/smoke.sh` — privacy, idempotency, and aggregation coverage.
- `apps/desktop/src-tauri/src/account.rs`, `account_tests.rs`, `commands.rs`, `lib.rs` — native HTTP boundary.
- `apps/desktop/src/domain/account.ts`, `lib/account.ts`, `lib/account.test.ts` — frontend account boundary.
- `apps/desktop/src/features/account/AccountGate.test.tsx`, `features/admin/AdminPage.test.tsx`, `lib/analytics.test.ts`, and `app/App.test.tsx` — update every structural `AccountApi` mock.
- `apps/desktop/src/domain/statistics.ts`, `lib/statistics.ts` — daily snapshot query payload.
- `apps/desktop/src/app/App.tsx`, `App.test.tsx` — sync lifecycle.
- `apps/desktop/src/features/admin/AdminPage.tsx`, `AdminPage.test.tsx` — role-restricted Analytics child view.

## Task 1: Add the daily-statistics collection

**Files:**
- Create: `services/pocketbase/pb_migrations/1784347200_create_daily_statistics.js`
- Modify: `services/pocketbase/tests/smoke.sh`

- [ ] **Step 1: Make smoke tests database-isolated and add a failing schema assertion**

At the top of `smoke.sh`, keep the existing `base_url` argument and add an optional data-directory argument:

```bash
data_dir="${2:-services/pocketbase/pb_data}"
database_path="${data_dir%/}/data.db"
```

Replace every existing `sqlite3 services/pocketbase/pb_data/data.db ...` call with `sqlite3 "${database_path}" ...`. This is required before using the isolated test database; otherwise the smoke test mutates the developer database while testing a different server. After PocketBase starts, query the selected database and assert the collection table and unique index exist:

```bash
sqlite3 "${database_path}" \
  "SELECT COUNT(*) FROM _collections WHERE name='daily_statistics';" | grep -q '^1$'
sqlite3 "${database_path}" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_daily_statistics_identity';" | grep -q '^1$'
```

- [ ] **Step 2: Run smoke test and verify failure**

From `services/pocketbase`, use an isolated test database:

```bash
rm -rf /tmp/corelib-statistics-pocketbase
./pocketbase migrate up --dir /tmp/corelib-statistics-pocketbase
./pocketbase serve --http=127.0.0.1:8090 --dir /tmp/corelib-statistics-pocketbase
```

In a second terminal from the repository root:

```bash
bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090 /tmp/corelib-statistics-pocketbase
```

Expected: FAIL because the collection is absent.

- [ ] **Step 3: Create the migration**

Create the complete migration wrapper, including its own helper:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
const users = app.findCollectionByNameOrId("users");
const autoDateFields = () => [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const dailyStatistics = new Collection({
  name: "daily_statistics",
  type: "base",
  fields: [
    { name: "user", type: "relation", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
    { name: "schemaVersion", type: "number", required: true, min: 1, max: 1 },
    { name: "localDay", type: "text", required: true, min: 10, max: 10, pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    { name: "appKey", type: "text", required: true, min: 1, max: 80, pattern: "^[a-z][a-z0-9_-]*$" },
    { name: "activeMs", type: "number", required: true, min: 0 },
    { name: "activeDay", type: "bool", required: true },
    { name: "sessionCount", type: "number", required: true, min: 0 },
    { name: "pageVisitCount", type: "number", required: false, min: 0 },
    { name: "uniquePageCount", type: "number", required: false, min: 0 },
    { name: "realReviewCount", type: "number", required: false, min: 0 },
    { name: "againCount", type: "number", required: false, min: 0 },
    { name: "hardCount", type: "number", required: false, min: 0 },
    { name: "goodCount", type: "number", required: false, min: 0 },
    { name: "easyCount", type: "number", required: false, min: 0 },
    { name: "lapseCount", type: "number", required: false, min: 0 },
    ...autoDateFields(),
  ],
  listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  indexes: [
    "CREATE UNIQUE INDEX `idx_daily_statistics_identity` ON `daily_statistics` (`user`,`localDay`,`appKey`,`schemaVersion`)",
    "CREATE INDEX `idx_daily_statistics_day_app` ON `daily_statistics` (`localDay`,`appKey`)",
  ],
});
app.save(dailyStatistics);
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("daily_statistics")); } catch (_) {}
});
```

The down migration removes `daily_statistics` only.

- [ ] **Step 4: Verify migration smoke tests**

Restart PocketBase against a fresh test data directory and rerun the smoke test.

Expected: PASS schema assertions.

- [ ] **Step 5: Commit**

```bash
git add services/pocketbase/pb_migrations/1784347200_create_daily_statistics.js services/pocketbase/tests/smoke.sh
git commit -m "feat: add daily statistics collection"
```

## Task 2: Implement strict idempotent snapshot upload

**Files:**
- Create: `services/pocketbase/pb_hooks/statistics.pb.js`
- Modify: `services/pocketbase/tests/smoke.sh`

- [ ] **Step 1: Add failing endpoint tests**

Extend smoke coverage to assert:

- opted-out approved user receives `403 analytics_disabled`;
- malformed day, unsupported app, negative/non-integer counts, and extra keys receive `400 invalid_statistics_snapshot`;
- identifiers/content keys receive the same rejection;
- two uploads for the same identity leave one row containing the second cumulative value.

Use payload:

```json
{"schemaVersion":1,"localDay":"2026-07-18","appKey":"reading","activeMs":60000,"activeDay":true,"sessionCount":1,"pageVisitCount":8,"uniquePageCount":6}
```

- [ ] **Step 2: Run smoke and verify route-not-found failure**

Expected: FAIL because `/api/corelib/analytics/daily-statistics` is absent.

- [ ] **Step 3: Implement route and validator**

In `statistics.pb.js`, define exact allowed keys by app:

```js
const COMMON = ["schemaVersion", "localDay", "appKey", "activeMs", "activeDay", "sessionCount"];
const APP_KEYS = {
  reading: COMMON.concat(["pageVisitCount", "uniquePageCount"]),
  memora: COMMON.concat(["realReviewCount", "againCount", "hardCount", "goodCount", "easyCount", "lapseCount"]),
};
```

Reject any key outside the selected list. Require schema version 1, strict date regex plus a valid calendar date, boolean `activeDay`, and safe nonnegative integers. Require rating counts to sum to `realReviewCount`; require `lapseCount <= againCount` and `uniquePageCount <= pageVisitCount`.

For schema version 1, `APP_KEYS` is also the endpoint allowlist, so any app other than `reading` or `memora` is rejected. Keep the collection's `appKey` field as validated text rather than a closed select: a future app then needs a new versioned hook contract, not a destructive collection migration.

Find an existing row by authenticated user/day/app/version. Update it or create it, then return `204`. Never accept a user ID from the request body.

- [ ] **Step 4: Verify idempotency and validation**

Rerun smoke tests and query `daily_statistics` to prove one row contains the replacement value.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/pocketbase/pb_hooks/statistics.pb.js services/pocketbase/tests/smoke.sh
git commit -m "feat: accept idempotent daily statistics"
```

## Task 3: Implement aggregate-only admin APIs

**Files:**
- Modify: `services/pocketbase/pb_hooks/statistics.pb.js`
- Modify: `services/pocketbase/tests/smoke.sh`

- [ ] **Step 1: Add failing privacy and aggregate tests**

Create five opted-in users with deterministic snapshots and a sixth opted-out user. Assert:

- member receives `403 admin_required`;
- admin receives aggregate values and `contributingUsers: 5`;
- no response contains email, display name, account ID, installation ID, document/deck/card ID, or raw row array;
- a filtered bucket with four contributors returns `{ insufficientSample: true, contributingUsers: 4 }` and omits metric values;
- opt-in coverage denominator includes approved users and numerator includes analytics-enabled users.

- [ ] **Step 2: Run smoke and verify missing-route failure**

Expected: FAIL because `/api/corelib/admin/statistics` is absent.

- [ ] **Step 3: Implement aggregate response**

Add `GET /api/corelib/admin/statistics?range=30d&appKey=all`. Validate admin role, range, and app. Produce:

```js
{
  approvedUsers, analyticsEnabledUsers, optInPercentage,
  contributingUsers, insufficientSample,
  dau, wau, mau, activeMs, activeDays, averageActiveMs, averageActiveDays, appAllocation,
  reading: { activeUsers, activeMs, sessionCount, pageVisitCount, returningUserRate },
  memora: { activeUsers, activeMs, sessionCount, realReviewCount, againCount, hardCount, goodCount, easyCount, lapseCount, recallRate, weeklyLearningFrequency },
  buckets: [{ localDay, contributingUsers, insufficientSample, activeMs }]
}
```

For every top-level or daily bucket with fewer than five distinct contributors, set `insufficientSample=true` and omit/suppress value fields. For a sufficient top-level sample, `averageActiveMs = activeMs / contributingUsers` and `averageActiveDays = SUM(activeDay ? 1 : 0) / contributingUsers`. Reading `returningUserRate` is contributors with Reading activity on at least two distinct days divided by Reading `activeUsers`. Memora `weeklyLearningFrequency` is the mean distinct real-review days per contributing Memora user per ISO week intersecting the range. Zero denominators serialize as `null`, never as a misleading zero. Aggregate inside the hook; never return source records.

- [ ] **Step 4: Verify privacy smoke tests**

Expected: PASS with exact aggregate totals and no per-user fields.

- [ ] **Step 5: Commit**

```bash
git add services/pocketbase/pb_hooks/statistics.pb.js services/pocketbase/tests/smoke.sh
git commit -m "feat: aggregate privacy-safe admin statistics"
```

## Task 4: Add native and TypeScript account contracts

**Files:**
- Modify: `apps/desktop/src-tauri/src/account.rs`
- Modify: `apps/desktop/src-tauri/src/account_tests.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/domain/account.ts`
- Modify: `apps/desktop/src/lib/account.ts`
- Modify: `apps/desktop/src/lib/account.test.ts`
- Modify: `apps/desktop/src/features/account/AccountGate.test.tsx`
- Modify: `apps/desktop/src/features/admin/AdminPage.test.tsx`
- Modify: `apps/desktop/src/lib/analytics.test.ts`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing Rust and TypeScript contract tests**

Rust mock HTTP tests must assert POST path/body and GET query. TypeScript wrapper tests must assert:

```ts
await api.upsertDailyStatistics(snapshot);
expect(call).toHaveBeenCalledWith("account_upsert_daily_statistics", { input: snapshot });
await api.adminStatistics("30d", "all");
expect(call).toHaveBeenCalledWith("admin_get_statistics", { range: "30d", appKey: "all" });
```

- [ ] **Step 2: Verify failures**

```bash
cd apps/desktop && npm test -- src/lib/account.test.ts
cd ../.. && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml account_tests
```

Expected: compile/type failures because methods and types are absent.

- [ ] **Step 3: Add exact contracts**

Define matching Rust and TypeScript types with these fields:

```ts
export interface DailyStatisticsSnapshot {
  schemaVersion: 1;
  localDay: string;
  appKey: "reading" | "memora";
  activeMs: number;
  activeDay: boolean;
  sessionCount: number;
  pageVisitCount?: number;
  uniquePageCount?: number;
  realReviewCount?: number;
  againCount?: number;
  hardCount?: number;
  goodCount?: number;
  easyCount?: number;
  lapseCount?: number;
}
export interface AdminStatisticsBucket {
  localDay: string;
  contributingUsers: number;
  insufficientSample: boolean;
  activeMs?: number;
}
export interface AdminAppAggregate {
  activeUsers: number;
  activeMs: number;
  sessionCount: number;
  pageVisitCount?: number;
  realReviewCount?: number;
  againCount?: number;
  hardCount?: number;
  goodCount?: number;
  easyCount?: number;
  lapseCount?: number;
  recallRate?: number | null;
  returningUserRate?: number | null;
  weeklyLearningFrequency?: number | null;
}
export interface AdminStatistics {
  approvedUsers: number;
  analyticsEnabledUsers: number;
  optInPercentage: number;
  contributingUsers: number;
  insufficientSample: boolean;
  dau?: number;
  wau?: number;
  mau?: number;
  activeMs?: number;
  activeDays?: number;
  averageActiveMs?: number | null;
  averageActiveDays?: number | null;
  appAllocation?: Record<string, number>;
  reading?: AdminAppAggregate;
  memora?: AdminAppAggregate;
  buckets: AdminStatisticsBucket[];
}
```

Mirror them in Rust with `Serialize`, `Deserialize`, and camelCase serde. Extend both `AccountApi` traits/interfaces:

```rust
fn upsert_daily_statistics(&self, input: DailyStatisticsSnapshot) -> Result<(), AccountError>;
fn admin_statistics(&self, range: &str, app_key: &str) -> Result<AdminStatistics, AccountError>;
```

Rust posts to `/api/corelib/analytics/daily-statistics` and gets `/api/corelib/admin/statistics?range=...&appKey=...`. Add commands `account_upsert_daily_statistics` and `admin_get_statistics`, then register them in `generate_handler!`. Map 403 errors through existing `AnalyticsDisabled` and `AdminRequired` variants.

Update every literal object that satisfies `AccountApi` in `AccountGate.test.tsx`, `AdminPage.test.tsx`, `analytics.test.ts`, and `App.test.tsx` with `upsertDailyStatistics: vi.fn()` and `adminStatistics: vi.fn()`. Do not weaken `AccountApi` by making the new methods optional merely to avoid fixing mocks.

- [ ] **Step 4: Verify contracts and build**

```bash
cd apps/desktop
npm test -- src/lib/account.test.ts
npm run build
cd ../..
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml account_tests
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/account.rs apps/desktop/src-tauri/src/account_tests.rs apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src/domain/account.ts apps/desktop/src/lib/account.ts apps/desktop/src/lib/account.test.ts apps/desktop/src/features/account/AccountGate.test.tsx apps/desktop/src/features/admin/AdminPage.test.tsx apps/desktop/src/lib/analytics.test.ts apps/desktop/src/app/App.test.tsx
git commit -m "feat: add statistics analytics account API"
```

## Task 5: Derive and sync consent-bounded daily snapshots

**Files:**
- Modify: `apps/desktop/src-tauri/src/statistics.rs`
- Modify: `apps/desktop/src-tauri/src/statistics_tests.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/domain/statistics.ts`
- Modify: `apps/desktop/src/lib/statistics.ts`
- Create: `apps/desktop/src/features/statistics/StatisticsAnalyticsSync.tsx`
- Create: `apps/desktop/src/features/statistics/StatisticsAnalyticsSync.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing consent and retry tests**

Repository tests must prove sessions/reviews before `consentStartedAt` are excluded, a Reading session that started before consent is excluded entirely, and results contain no IDs or text.

React tests must prove:

```tsx
test("never derives or uploads snapshots while opted out", async () => {
  render(<StatisticsAnalyticsSync enabled={false} statisticsApi={statisticsApi} accountApi={accountApi} />);
  await act(() => Promise.resolve());
  expect(statisticsApi.dailySnapshots).not.toHaveBeenCalled();
  expect(accountApi.upsertDailyStatistics).not.toHaveBeenCalled();
});

test("retries idempotent snapshots and clears consent cursor on opt-out", async () => {
  accountApi.upsertDailyStatistics.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  // First flush fails and keeps cursor; online event retries the same identity; disabling removes storage state.
});
```

- [ ] **Step 2: Verify failures**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
cd apps/desktop && npm test -- src/features/statistics/StatisticsAnalyticsSync.test.tsx
```

Expected: FAIL because snapshot query/sync do not exist.

- [ ] **Step 3: Implement snapshot query and sync coordinator**

Add command:

```ts
export interface DailySnapshotQuery {
  consentStartedAt: string;
  fromLocalDay: string;
}
export function getDailyStatisticsSnapshots(
  query: DailySnapshotQuery,
): Promise<DailyStatisticsSnapshot[]>;
```

Rust aggregates only allowlisted numeric fields. Include Reading sessions whose `started_at >= consentStartedAt`; include reviews whose `reviewed_at >= consentStartedAt`. Group by local day/app and apply the five-minute rating cap. Never expose context IDs, pages, titles, or card/deck/document IDs.

`StatisticsAnalyticsSync` uses storage key `library.statistics.analytics-sync.v1` with:

```ts
interface SyncState { consentStartedAt: string; lastSyncAt: string | null; }
```

If enabled and no state exists, set `consentStartedAt=now`; do not upload earlier history. Query from the local day containing `lastSyncAt` (or consent start), upload sequentially, and update `lastSyncAt` only after every snapshot succeeds. Retry every 60 seconds and on `online`. On opt-out, stop timers and delete the state. Do not maintain a second payload queue because snapshots are derived and idempotent.

Mount the coordinator beside `AnalyticsInstrumentation` inside authenticated App state. It receives the same `analyticsEnabled` profile flag.

- [ ] **Step 4: Verify sync behavior**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
cd apps/desktop
npm test -- src/features/statistics/StatisticsAnalyticsSync.test.tsx src/app/App.test.tsx
npm run build
```

Expected: PASS, including offline retry and opt-out cleanup.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/statistics.rs apps/desktop/src-tauri/src/statistics_tests.rs apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src/domain/statistics.ts apps/desktop/src/lib/statistics.ts apps/desktop/src/features/statistics/StatisticsAnalyticsSync.tsx apps/desktop/src/features/statistics/StatisticsAnalyticsSync.test.tsx apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "feat: sync consented daily statistics"
```

## Task 6: Build token-correct Admin Analytics

**Files:**
- Create: `apps/desktop/src/features/admin/AdminAnalyticsPage.tsx`
- Create: `apps/desktop/src/features/admin/AdminAnalyticsPage.test.tsx`
- Modify: `apps/desktop/src/features/admin/AdminPage.tsx`
- Modify: `apps/desktop/src/features/admin/AdminPage.test.tsx`

- [ ] **Step 1: Write failing Admin UI tests**

Assert role-restricted navigation, opt-in coverage, contributor count, cohort suppression, partial error, cached timestamp, Heatmap/Graph reuse, and no user table inside Analytics:

```tsx
expect(await screen.findByText("Analytics coverage")).toBeInTheDocument();
expect(screen.getByText("5 of 8 approved users opted in")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
expect(screen.getByText("Insufficient sample (4 contributors)")).toBeInTheDocument();
expect(screen.queryByText("mai@example.test")).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify failure**

```bash
cd apps/desktop && npm test -- src/features/admin/AdminAnalyticsPage.test.tsx src/features/admin/AdminPage.test.tsx
```

Expected: FAIL because Admin Analytics is absent.

- [ ] **Step 3: Implement the internal Admin child view**

Add `Management | Analytics` navigation inside Admin; keep Analytics internal and admin-only. `AdminAnalyticsPage` uses shared `StatisticsShell`, `KpiGrid/KpiCard`, `MetricSection`, and `ActivityChartCard`. It does not copy AdminPage's hard-coded dark inline CSS. Use semantic tokens only.

Show:

- approved/opted-in/contributing coverage;
- DAU/WAU/MAU;
- active time and active-day trend;
- app allocation;
- Reading and Memora aggregate sections;
- explicit `insufficientSample` instead of zero values;
- last successful load timestamp when cached data is shown.

Cache only the aggregate response and timestamp under `library.admin-statistics.cache.v1`. Read it only after a network failure, label it `Cached`, and clear it on account sign-out. Never cache source records because the API never returns them.

Reuse the shared `ScrollArea` shell and its 20px inset. Do not render any account identity in this page.

- [ ] **Step 4: Verify Admin and token tests**

```bash
cd apps/desktop
npm test -- src/features/admin/AdminAnalyticsPage.test.tsx src/features/admin/AdminPage.test.tsx src/features/statistics/components src/styles/tokens.test.ts
npm run build
```

Expected: PASS in JSDOM and typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/admin/AdminAnalyticsPage.tsx apps/desktop/src/features/admin/AdminAnalyticsPage.test.tsx apps/desktop/src/features/admin/AdminPage.tsx apps/desktop/src/features/admin/AdminPage.test.tsx
git commit -m "feat: add aggregate admin analytics dashboard"
```

## Task 7: Run end-to-end privacy and regression verification

**Files:** Modify only to add an explicit failing regression test and its focused fix.

- [ ] **Step 1: Run PocketBase smoke tests from a clean test database**

Start the bundled server from the service directory against a disposable database:

```bash
rm -rf /tmp/corelib-statistics-pocketbase
cd services/pocketbase
./pocketbase migrate up --dir /tmp/corelib-statistics-pocketbase
./pocketbase serve --http=127.0.0.1:8090 --dir /tmp/corelib-statistics-pocketbase
```

In a second terminal from the repository root, run:

```bash
bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090 /tmp/corelib-statistics-pocketbase
```

Expected: registration/account/feature tests plus new opt-out, idempotency, aggregation, RBAC, and cohort suppression checks PASS.

- [ ] **Step 2: Run all desktop automation**

```bash
cd apps/desktop
npm test
npm run build
cd ../..
cargo test --all-targets --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: PASS with no warnings.

- [ ] **Step 3: Inspect network/privacy boundaries**

Use five synthetic opted-in users and one opted-out user. Confirm saved daily-statistics records contain only allowed numeric fields and auth relation. Confirm Admin responses contain no source rows or identity fields. Toggle opt-out and confirm no new snapshot is derived or uploaded.

- [ ] **Step 4: Fresh desktop verification**

Record:

```bash
git rev-parse --short HEAD
git status --short
pgrep -fal 'tauri dev|vite|library_desktop' || true
```

Restart and launch `npm run tauri dev` from `apps/desktop`. Verify Admin Analytics in light/dark mode, long-scroll thumb inset, narrow heatmap horizontal thumb, cached/offline state, insufficient sample, color picker, and Heatmap/Graph switching. There must be no white native scrollbar track or theme-token crossover.

- [ ] **Step 5: Finish with an evidence-based handoff**

If no defects exist, report the tested commit, `tauri dev` mode, and checkout path. If a defect exists, first add a named failing test, make the focused fix, rerun Steps 1-4, and commit with a defect-specific message. Do not claim release-app verification unless a fresh release bundle was built and launched from `apps/desktop/src-tauri/target/release/bundle/macos/Library.app`.
