# Desktop Account Approval, Feature Access, and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every implementation task must also use `superpowers:test-driven-development` before changing production code and `superpowers:verification-before-completion` before its commit.

**Goal:** Add a macOS-first account system in which email/password registrations wait for administrator approval, approved accounts receive server-enforced feature entitlements, admins manage users and see opt-in aggregate analytics, and users can install signed GitHub Releases updates.

**Architecture:** Keep library and learning data in the existing local SQLite store. Add a PocketBase service on Oracle for account records, feature policy, audit history, and analytics. The Tauri Rust layer owns the authenticated HTTP client and macOS Keychain session storage; React receives only safe account/entitlement view models through Tauri commands. Caddy exposes the service on one free DuckDNS HTTPS hostname. GitHub Releases hosts signed Tauri updater artifacts.

**Tech Stack:** Tauri 2, React 19, TypeScript, Rust, `reqwest`, `keyring`, PocketBase + SQLite + JS migrations/hooks, Caddy, DuckDNS, GitHub Actions, Tauri Updater.

---

## Non-negotiable boundaries

- Do **not** upload, sync, or expose the existing local document/card/learning SQLite data.
- Do **not** collect PDF text, card text, search terms, raw paths, AI prompts, API keys, or location/map data.
- Do **not** put tokens, account passwords, DuckDNS tokens, PocketBase superuser credentials, or Tauri signing keys in git, browser local storage, test snapshots, or logs.
- Do **not** use PocketBase's public records endpoints from React. All product calls go through typed Tauri commands so the auth token stays in the OS Keychain.
- Do **not** treat hidden UI as authorization. Every non-public PocketBase route must check the authenticated record is `approved`; every admin route must separately check `role = admin`.
- Do **not** include Google OAuth, password-reset email, browser admin UI, cross-device sync, or map/location collection in this implementation.

## Human-only prerequisites

An agent must stop and ask the owner to perform these steps; it must never fabricate values or commit them:

1. Create one DuckDNS hostname, recorded locally as `ACCOUNT_API_BASE_URL`, for example `https://library-home.duckdns.org`.
2. Create a strong PocketBase superuser on the Oracle host with `./pocketbase superuser create <email> <password>`; store it in a password manager.
3. Generate the Tauri updater key pair with `npm run tauri signer generate -- -w ~/.tauri/library-updater.key`; store the private key and its password in a password manager and GitHub Actions secrets. Only the generated public key belongs in `tauri.conf.json`.
4. Before distribution to friends, provide Apple Developer signing/notarization credentials. The unsigned developer build is only for local development.

## Target file structure

```text
apps/desktop/
  src/domain/account.ts                         # safe account, entitlement, analytics types
  src/lib/account.ts                            # typed Tauri invoke wrappers
  src/lib/account.test.ts
  src/features/account/AccountGate.tsx          # startup auth/pending/rejected screens
  src/features/account/SignInPage.tsx
  src/features/account/RegisterPage.tsx
  src/features/account/AccountSettingsSection.tsx
  src/features/account/*.test.tsx
  src/features/admin/AdminPage.tsx              # desktop-only normal admin dashboard
  src/features/admin/AdminPage.test.tsx
  src/app/App.tsx                               # gate app shell; account/admin routes
  src/app/AppSidebar.tsx                        # conditionally show Admin
  src-tauri/src/account.rs                       # request client, DTO conversion, Keychain session
  src-tauri/src/account_tests.rs
  src-tauri/src/commands.rs                      # Tauri account/admin command handlers
  src-tauri/src/lib.rs                           # module, state, command registration, updater plugin
  src-tauri/Cargo.toml                           # updater dependency
  src-tauri/capabilities/default.json            # updater/process permissions only
  src-tauri/tauri.conf.json                      # updater public key, endpoint, artifacts
  package.json                                  # updater/process JS packages and release scripts

services/pocketbase/
  README.md                                     # local run, migration, deployment and restore commands
  pb_migrations/1783950000_create_account_platform.js
  pb_hooks/corelib.pb.js                         # auth, entitlement, admin, analytics custom routes
  tests/smoke.sh                                # black-box API acceptance test against ephemeral PB
  deploy/Caddyfile
  deploy/pocketbase.service
  deploy/backup-pocketbase.sh
  deploy/backup-pocketbase.service
  deploy/backup-pocketbase.timer
  deploy/duckdns-update.sh
  deploy/duckdns.service
  deploy/duckdns.timer
  .env.example                                  # names only; no values/secrets

.github/workflows/
  release-macos.yml                              # tag -> signed artifacts -> GitHub Release
```

## Shared API contract

All JSON values use camelCase on the Tauri/React boundary. PocketBase custom routes use a single stable prefix: `/api/corelib`.

```ts
// apps/desktop/src/domain/account.ts
export type AccountStatus = "anonymous" | "pending" | "approved" | "rejected";
export type AccountRole = "member" | "admin";

export interface AccountProfile {
  id: string;
  displayName: string;
  email: string;
  status: Exclude<AccountStatus, "anonymous">;
  role: AccountRole;
  analyticsEnabled: boolean;
}

export interface Entitlements {
  featureKeys: string[];
  refreshedAt: string;
}

export interface AccountGroup { id: string; name: string; description: string; }
export interface FeatureDefinition { id: string; key: string; description: string; }
export interface AdminUser { profile: AccountProfile; groupIds: string[]; }
export type FeatureSubjectType = "user" | "group";
export interface FeatureAssignmentInput {
  featureKey: string;
  subjectType: FeatureSubjectType;
  subjectId: string;
  enabled: boolean;
}
export interface FeatureAssignment extends FeatureAssignmentInput { id: string; }

export interface SessionSnapshot {
  profile: AccountProfile | null;
  entitlements: Entitlements | null;
}

export interface AnalyticsEventInput {
  name: "app_opened" | "feature_opened" | "feature_completed" | "handled_error" | "updater_state";
  occurredAt: string;
  appVersion: string;
  installationId: string;
  payload: Record<string, string | number | boolean>;
}
```

Required endpoint behavior:

| Method and path | Authentication | Success response | Required rejection |
| --- | --- | --- | --- |
| `POST /api/corelib/register` | guest | `{ status: "pending" }` | `400 invalid_input`, `409 email_taken` |
| `POST /api/corelib/sign-in` | guest | `{ status: "approved", token, profile }` or `{ status: "pending" }` or `{ status: "rejected" }` | `401 invalid_credentials` |
| `GET /api/corelib/me` | approved token | `{ profile, entitlements }` | `401 invalid_session`, `403 account_not_approved` |
| `POST /api/corelib/me/analytics` | approved token | changed safe profile | `400 invalid_input`, `403 account_not_approved` |
| `POST /api/corelib/analytics` | approved token | `204` | `400 invalid_event`, `403 analytics_disabled` |
| `GET /api/corelib/admin/users` | approved admin token | `{ users: AdminUser[] }` | `403 admin_required` |
| `POST /api/corelib/admin/users/{id}/status` | approved admin token | changed profile | `400 invalid_status`, `403 admin_required` |
| `POST /api/corelib/admin/users/{id}/groups` | approved admin token | changed group IDs | `400 unknown_group`, `403 admin_required` |
| `GET /api/corelib/admin/groups` | approved admin token | `{ groups: AccountGroup[] }` | `403 admin_required` |
| `POST /api/corelib/admin/groups` | approved admin token | created group | `400 invalid_input`, `409 group_taken`, `403 admin_required` |
| `GET /api/corelib/admin/features` | approved admin token | `{ features: FeatureDefinition[] }` | `403 admin_required` |
| `POST /api/corelib/admin/features` | approved admin token | created feature | `400 invalid_input`, `409 feature_taken`, `403 admin_required` |
| `POST /api/corelib/admin/assignments` | approved admin token | assignment record | `400 invalid_assignment`, `403 admin_required` |
| `GET /api/corelib/admin/metrics` | approved admin token | aggregates only | `403 admin_required` |

## Task 1: Create the backend service skeleton and reproducible local runtime

**Files:**
- Create: `services/pocketbase/README.md`
- Create: `services/pocketbase/.env.example`
- Create: `services/pocketbase/tests/smoke.sh`
- Create: `services/pocketbase/pb_migrations/.gitkeep`
- Create: `services/pocketbase/pb_hooks/.gitkeep`

- [ ] **Step 1: Write the failing smoke test before adding any service behavior.**

```bash
#!/usr/bin/env bash
set -euo pipefail

base_url="${1:?pass PocketBase base URL, e.g. http://127.0.0.1:8090}"
status="$(curl --silent --output /tmp/corelib-register.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/register" \
  --header 'content-type: application/json' \
  --data '{"displayName":"Test Member","email":"member@example.test","password":"correct horse battery staple","passwordConfirm":"correct horse battery staple"}')"

test "${status}" = "200"
grep -q '"status":"pending"' /tmp/corelib-register.json
```

- [ ] **Step 2: Run the smoke test and record the expected initial failure.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: non-zero exit because `/api/corelib/register` does not exist yet.

- [ ] **Step 3: Add only operational documentation and secret names.**

`services/pocketbase/.env.example` must contain exactly these names with empty values:

```dotenv
ACCOUNT_API_BASE_URL=
DUCKDNS_DOMAIN=
DUCKDNS_TOKEN=
POCKETBASE_DATA_DIR=/var/lib/corelib-pocketbase/pb_data
POCKETBASE_BINARY=/opt/corelib-pocketbase/pocketbase
```

`README.md` must document: run the pinned PocketBase binary with `serve --http=127.0.0.1:8090 --dir "$POCKETBASE_DATA_DIR"`; run `migrate up`; run the smoke test; and state that `pb_data/` and `.env` are ignored and never committed.

- [ ] **Step 4: Add repository ignore rules only if absent.**

Add these exact lines to `.gitignore` if they are not already present:

```gitignore
services/pocketbase/.env
services/pocketbase/pb_data/
services/pocketbase/pocketbase
```

- [ ] **Step 5: Re-run the smoke test; it must still fail only because behavior is not implemented.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: non-zero exit and no secret or data file appears in `git status --short`.

- [ ] **Step 6: Commit the scaffolding.**

```bash
git add .gitignore services/pocketbase
git commit -m "chore: scaffold account service"
```

## Task 2: Define PocketBase collections in a committed migration

**Files:**
- Create: `services/pocketbase/pb_migrations/1783950000_create_account_platform.js`
- Modify: `services/pocketbase/tests/smoke.sh`

- [ ] **Step 1: Extend the smoke test with an assertion that a public registration cannot self-approve.**

Append this request and assertion:

```bash
status="$(curl --silent --output /tmp/corelib-escalation.json --write-out '%{http_code}' \
  --request POST "${base_url}/api/corelib/register" \
  --header 'content-type: application/json' \
  --data '{"displayName":"Escalation","email":"escalation@example.test","password":"correct horse battery staple","passwordConfirm":"correct horse battery staple","status":"approved","role":"admin"}')"
test "${status}" = "200"
grep -q '"status":"pending"' /tmp/corelib-escalation.json
```

- [ ] **Step 2: Run the test and confirm it fails because registration is still absent.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: non-zero exit before the new assertions execute.

- [ ] **Step 3: Create one migration with these collections and no Dashboard-only schema changes.**

Use `migrate create create_account_platform`, then replace the generated body. The migration must define the following fields and rules:

```js
// Required collection names and field shapes.
// users (type: auth): displayName text required max 80; status select
// [pending, approved, rejected] required; role select [member, admin]
// required; analyticsEnabled bool. All direct CRUD rules locked (null).
// groups (base): name text required unique, description text max 240. Rules locked.
// group_members (base): user relation -> users, group relation -> groups;
// unique index on (user, group). Rules locked.
// features (base): key text required unique, description text max 240. Rules locked.
// feature_assignments (base): feature relation -> features, subjectType select
// [user, group], subjectId text required, enabled bool required. Rules locked.
// analytics_events (base): user relation -> users, installationId text max 80,
// name select [app_opened, feature_opened, feature_completed, handled_error,
// updater_state], appVersion text max 40, occurredAt date, payload json. Rules locked.
// admin_audit_logs (base): actor relation -> users, action text max 80,
// targetType text max 40, targetId text max 40, before json, after json. Rules locked.
```

The migration must create these indexes: `group_members(user, group)`, `feature_assignments(feature, subjectType, subjectId)`, `analytics_events(user, occurredAt)`, `analytics_events(name, occurredAt)`, and `admin_audit_logs(created)`.

- [ ] **Step 4: Apply the migration to a clean local data directory.**

Run: `rm -rf /tmp/corelib-pb-data && mkdir -p /tmp/corelib-pb-data && "$POCKETBASE_BINARY" migrate up --dir /tmp/corelib-pb-data`

Expected: exit 0 and an `_migrations` entry for `1783950000_create_account_platform.js`.

- [ ] **Step 5: Inspect the generated schema without modifying it through the Dashboard.**

Run: `"$POCKETBASE_BINARY" migrate collections --dir /tmp/corelib-pb-data`

Expected: a generated snapshot that lists all seven collections. Do not add that snapshot to git; delete it after inspection because the handwritten migration is the schema source of truth.

- [ ] **Step 6: Commit the migration.**

```bash
git add services/pocketbase/pb_migrations/1783950000_create_account_platform.js services/pocketbase/tests/smoke.sh
git commit -m "feat: add account platform schema"
```

## Task 3: Implement server-enforced registration, sign-in, session, and entitlement routes

**Files:**
- Create: `services/pocketbase/pb_hooks/corelib.pb.js`
- Modify: `services/pocketbase/tests/smoke.sh`

- [ ] **Step 1: Add failing black-box cases for pending sign-in, invalid password, and approved `/me`.**

Add assertions for this contract:

```bash
# Pending account: HTTP 200 and no token field.
POST /api/corelib/sign-in {"email":"member@example.test","password":"correct horse battery staple"}
# Wrong password: HTTP 401 with error code invalid_credentials.
POST /api/corelib/sign-in {"email":"member@example.test","password":"wrong"}
# /me with no Authorization header: HTTP 401.
GET /api/corelib/me
```

The script must use `grep -q` for exact response fields and fail on an unexpected HTTP status.

- [ ] **Step 2: Run the test against the migrated service and verify the missing-route failure.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: non-zero exit because `corelib.pb.js` has not been created.

- [ ] **Step 3: Implement the hook helpers and routes.**

The hook must contain these helpers; keep the safe profile serializer as the sole response shape for users:

```js
function safeProfile(record) {
  return {
    id: record.id,
    displayName: record.getString("displayName"),
    email: record.getString("email"),
    status: record.getString("status"),
    role: record.getString("role"),
    analyticsEnabled: record.getBool("analyticsEnabled"),
  }
}

function requireApproved(e) {
  if (!e.auth || e.auth.getString("status") !== "approved") {
    throw new ForbiddenError("account_not_approved")
  }
}

function requireAdmin(e) {
  requireApproved(e)
  if (e.auth.getString("role") !== "admin") {
    throw new ForbiddenError("admin_required")
  }
}
```

Implement `register` by binding `displayName`, `email`, `password`, and `passwordConfirm`; reject blank/overlength display names and unequal/short passwords; create a `users` auth record with fixed `status = pending`, `role = member`, and `analyticsEnabled = false`. Never bind, echo, or honour client `status` or `role` fields.

Implement `sign-in` by loading the account with `findAuthRecordByEmail("users", email)`, verifying `record.validatePassword(password)`, returning only `{ status }` for pending/rejected accounts, and returning `{ status: "approved", token: record.newAuthToken(), profile: safeProfile(record) }` only for approved accounts.

Implement `/me` with `requireApproved`, `safeProfile`, and the entitlement helper from Task 5. Return `401 invalid_session` for a missing or bad bearer token and `403 account_not_approved` for a valid non-approved record.

- [ ] **Step 4: Re-run the expanded smoke test.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: registration always returns pending; pending sign-in returns no token; wrong password is rejected; anonymous `/me` is rejected.

- [ ] **Step 5: Add a manual approval fixture only inside the test script.**

The test may call a temporary local-only PocketBase superuser setup command, then update the member to `approved` and assert `/me` returns the safe profile. Do not add a backdoor endpoint or a hard-coded superuser password to `corelib.pb.js`.

- [ ] **Step 6: Commit the auth boundary.**

```bash
git add services/pocketbase/pb_hooks/corelib.pb.js services/pocketbase/tests/smoke.sh
git commit -m "feat: add approved account authentication"
```

## Task 4: Add groups, feature precedence, admin actions, and audit history

**Files:**
- Modify: `services/pocketbase/pb_hooks/corelib.pb.js`
- Modify: `services/pocketbase/tests/smoke.sh`

- [ ] **Step 1: Add failing test cases for authorization.**

The smoke test must prove all five conditions:

```text
1. Approved member -> GET /api/corelib/admin/users returns 403 admin_required.
2. Admin approves a pending member -> response status is approved and audit row count increases by one.
3. Member in group beta gets feature beta_reader when a group assignment is enabled.
4. A user assignment enabled=false for beta_reader overrides the group assignment.
5. A pending/rejected token cannot call /me, analytics, or any admin route.
```

- [ ] **Step 2: Run the test and confirm the new route assertions fail.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: non-zero exit at the first absent admin route.

- [ ] **Step 3: Add the entitlement resolver before route handlers.**

Implement one pure helper that returns sorted, unique keys:

```js
function resolveFeatureKeys(app, userId) {
  // Query group_members for userId, then feature_assignments.
  // First collect enabled group assignments.
  // Then apply user assignments last; enabled=true inserts, enabled=false removes.
  // Return Array.from(keys).sort().
}
```

The implementation must use parameterized PocketBase query APIs, never string-concatenate a user ID into raw SQL. The `/me` response must be `{ profile, entitlements: { featureKeys, refreshedAt } }`.

- [ ] **Step 4: Implement admin-only routes with audit writes in the same request transaction.**

Implement exactly these actions:

```text
POST /api/corelib/admin/users/{id}/status
body: { "status": "approved" | "rejected" }

POST /api/corelib/admin/users/{id}/groups
body: { "groupIds": ["..."] }

POST /api/corelib/admin/features
body: { "key": "beta_reader", "description": "..." }

POST /api/corelib/admin/assignments
body: { "featureKey": "beta_reader", "subjectType": "user" | "group", "subjectId": "...", "enabled": true | false }
```

For each mutation, write an `admin_audit_logs` record containing actor, action, target type/id, and before/after JSON. Reject an attempt to set an unknown status or assign a missing group/feature with `400`.

- [ ] **Step 5: Re-run the smoke test and inspect only aggregate-safe route outputs.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: all five authorization cases pass and no response contains password hashes, token keys, or PocketBase internal fields.

- [ ] **Step 6: Commit feature policy.**

```bash
git add services/pocketbase/pb_hooks/corelib.pb.js services/pocketbase/tests/smoke.sh
git commit -m "feat: add account feature entitlements"
```

## Task 5: Add opt-in analytics ingestion and aggregate admin metrics

**Files:**
- Modify: `services/pocketbase/pb_hooks/corelib.pb.js`
- Modify: `services/pocketbase/tests/smoke.sh`

- [ ] **Step 1: Add failing analytics test cases.**

```text
1. Approved member with analyticsEnabled=false -> POST /analytics returns 403 analytics_disabled.
2. That member posts `{ "enabled": true }` to `/me/analytics` -> allowed event returns 204.
3. Event with name "pdf_content" -> 400 invalid_event.
4. Event payload containing "query", "path", "content", "prompt", "location", or "address" -> 400 invalid_event.
5. Admin metrics returns counts and version distribution, not raw analytics_events rows.
```

- [ ] **Step 2: Run the test and confirm the analytics route is missing.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: non-zero exit at `POST /api/corelib/analytics`.

- [ ] **Step 3: Implement a fixed event schema validator.**

Use this exact allowlist and payload keys:

```js
const ANALYTICS_SCHEMA = {
  app_opened: ["source"],
  feature_opened: ["featureKey"],
  feature_completed: ["featureKey"],
  handled_error: ["code"],
  updater_state: ["state", "targetVersion"],
}
```

Accept only strings, finite numbers, and booleans as payload values. Enforce maximum 20 payload keys, 80-character keys, 160-character strings, 80-character installation IDs, and 40-character app versions. Save `occurredAt` supplied by the client only if it parses as RFC 3339 and is no more than 24 hours in the future; otherwise use server time.

Implement `POST /api/corelib/me/analytics` with `requireApproved`. It binds only one boolean `enabled`, updates only the caller's `analyticsEnabled` field, writes an account audit entry with action `analytics_preference_changed`, and returns `safeProfile(e.auth)`. No administrator route may set a member's analytics preference.

- [ ] **Step 4: Implement metrics as a separate admin-only aggregate route.**

`GET /api/corelib/admin/metrics` returns only this shape:

```json
{
  "approvedUsers": 0,
  "pendingUsers": 0,
  "activeUsersLast30Days": 0,
  "eventsByName": [{"name":"app_opened","count":0}],
  "versions": [{"appVersion":"0.1.0","count":0}],
  "errorsByCode": [{"code":"network_unavailable","count":0}]
}
```

Use server-side grouped queries. Do not return member emails, IDs, installation IDs, timestamps, or individual event payloads from this route.

- [ ] **Step 5: Run analytics tests.**

Run: `bash services/pocketbase/tests/smoke.sh http://127.0.0.1:8090`

Expected: disabled analytics and prohibited payloads are rejected; enabled allowlisted events are accepted; metrics are aggregate-only.

- [ ] **Step 6: Commit analytics.**

```bash
git add services/pocketbase/pb_hooks/corelib.pb.js services/pocketbase/tests/smoke.sh
git commit -m "feat: collect opt-in account analytics"
```

## Task 6: Add typed account transport and Keychain persistence in Tauri

**Files:**
- Create: `apps/desktop/src-tauri/src/account.rs`
- Create: `apps/desktop/src-tauri/src/account_tests.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Write Rust tests for pure DTO and session behavior.**

Start with tests for these public functions:

```rust
#[test]
fn maps_pending_sign_in_without_persisting_a_token() { /* assert no keyring write */ }

#[test]
fn converts_an_approved_response_to_the_safe_profile_shape() { /* assert only six safe fields */ }

#[test]
fn rejects_analytics_payloads_before_sending_them() { /* prohibited key -> Err */ }
```

Use a `MemorySessionStore` test double; never exercise the real macOS Keychain in unit tests.

- [ ] **Step 2: Run the focused Rust tests and confirm compilation fails because the module does not exist.**

Run: `cargo test account_tests --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: failure referencing the missing `account` module.

- [ ] **Step 3: Implement a narrow account client.**

`account.rs` must define `AccountProfile`, `Entitlements`, `SessionSnapshot`, `AnalyticsEventInput`, an `AccountApi` trait, and `PocketBaseAccountApi`. The trait boundary must expose only:

```rust
fn register(&self, display_name: &str, email: &str, password: &str) -> Result<AccountStatusResponse, AccountError>;
fn sign_in(&self, email: &str, password: &str) -> Result<AccountStatusResponse, AccountError>;
fn current_session(&self) -> Result<SessionSnapshot, AccountError>;
fn sign_out(&self) -> Result<(), AccountError>;
fn set_analytics_enabled(&self, enabled: bool) -> Result<AccountProfile, AccountError>;
fn send_analytics(&self, event: AnalyticsEventInput) -> Result<(), AccountError>;
fn admin_list_users(&self, status: Option<AccountStatus>) -> Result<Vec<AccountProfile>, AccountError>;
fn admin_set_status(&self, user_id: &str, status: AccountStatus) -> Result<AccountProfile, AccountError>;
fn admin_set_groups(&self, user_id: &str, group_ids: Vec<String>) -> Result<(), AccountError>;
fn admin_list_groups(&self) -> Result<Vec<AccountGroup>, AccountError>;
fn admin_create_group(&self, name: &str, description: &str) -> Result<AccountGroup, AccountError>;
fn admin_list_features(&self) -> Result<Vec<FeatureDefinition>, AccountError>;
fn admin_create_feature(&self, key: &str, description: &str) -> Result<FeatureDefinition, AccountError>;
fn admin_set_feature_assignment(&self, input: FeatureAssignmentInput) -> Result<FeatureAssignment, AccountError>;
fn admin_metrics(&self) -> Result<AdminMetrics, AccountError>;
```

Store only the approved bearer token in the existing `keyring` crate under service name `com.library.desktop.account` and account name `session`. Delete it on sign-out, invalid session, rejected session, or any `403 account_not_approved` response. Keep `ACCOUNT_API_BASE_URL` in a compile-time `option_env!` value; return a clear `account_service_not_configured` error in developer builds that omit it.

- [ ] **Step 4: Add commands without putting HTTP or Keychain work in React.**

Add commands named `account_register`, `account_sign_in`, `account_session`, `account_sign_out`, `account_set_analytics_enabled`, `account_track_event`, `admin_list_users`, `admin_set_user_status`, `admin_set_user_groups`, `admin_list_groups`, `admin_create_group`, `admin_list_features`, `admin_create_feature`, `admin_set_feature_assignment`, and `admin_get_metrics`. Register them in `lib.rs` and keep error strings limited to the API codes in the shared contract.

- [ ] **Step 5: Run the focused tests and full Rust checks.**

Run:

```bash
cargo test account_tests --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo test --all-targets --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the native account boundary.**

```bash
git add apps/desktop/src-tauri/src/account.rs apps/desktop/src-tauri/src/account_tests.rs apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add native account service client"
```

## Task 7: Add TypeScript account types, invoke wrappers, and the startup gate

**Files:**
- Create: `apps/desktop/src/domain/account.ts`
- Create: `apps/desktop/src/lib/account.ts`
- Create: `apps/desktop/src/lib/account.test.ts`
- Create: `apps/desktop/src/features/account/AccountGate.tsx`
- Create: `apps/desktop/src/features/account/AccountGate.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`

- [ ] **Step 1: Write failing wrapper tests using the existing injected `Invoke` pattern.**

```ts
it("sends a registration request through the typed native command", async () => {
  const call = vi.fn().mockResolvedValue({ status: "pending" });
  await registerAccount({ displayName: "Mai", email: "mai@example.test", password: "password-123" }, call);
  expect(call).toHaveBeenCalledWith("account_register", { payload: { displayName: "Mai", email: "mai@example.test", password: "password-123" } });
});

it("loads the session through account_session", async () => {
  const call = vi.fn().mockResolvedValue({ profile: null, entitlements: null });
  await loadAccountSession(call);
  expect(call).toHaveBeenCalledWith("account_session");
});
```

- [ ] **Step 2: Run the test and verify the module failure.**

Run: `npm test -- --run src/lib/account.test.ts`

Expected: FAIL because `src/lib/account.ts` is missing.

- [ ] **Step 3: Implement the wrappers and safe input validation.**

`registerAccount` rejects blank names, malformed email strings, and passwords shorter than 12 characters before invoking Rust. `trackAnalyticsEvent` rejects payload keys outside the schema from Task 5 before invoking Rust. Do not write a token or profile to `localStorage`.

- [ ] **Step 4: Implement `AccountGate` as the sole entry to the normal `App` shell.**

```tsx
export function AccountGate({ api, children }: { api: AccountApi; children: React.ReactNode }) {
  // GateState: loading | anonymous | pending | rejected | approved(session)
  // pending/rejected are sign-in outcomes and never have a stored token.
  // approved(session) is the only state that renders children.
}
```

Define the state exactly as follows:

```ts
type GateState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "pending" }
  | { kind: "rejected" }
  | { kind: "approved"; session: SessionSnapshot };
```

The gate loads `account_session` on mount and clears its state after `account_sign_out`. Registration and a pending/rejected sign-in set the matching transient state; only an approved response persists a Keychain token and becomes `approved`. It must never render `AppSidebar`, Library, Memora, Reader, or Settings for anonymous/pending/rejected states.

- [ ] **Step 5: Add gate tests for all four status branches.**

Test `loading`, `anonymous`, `pending`, `rejected`, and `approved` states. The approved test must assert the child renders; every other state must assert it does not.

- [ ] **Step 6: Run frontend verification and commit.**

Run:

```bash
npm test -- --run src/lib/account.test.ts src/features/account/AccountGate.test.tsx src/app/App.test.tsx
npm run build
```

Expected: both commands exit 0.

```bash
git add apps/desktop/src/domain/account.ts apps/desktop/src/lib/account.ts apps/desktop/src/lib/account.test.ts apps/desktop/src/features/account apps/desktop/src/app/App.tsx
git commit -m "feat: gate desktop app by account approval"
```

## Task 8: Build registration, sign-in, pending, and account-settings UI

**Files:**
- Create: `apps/desktop/src/features/account/SignInPage.tsx`
- Create: `apps/desktop/src/features/account/RegisterPage.tsx`
- Create: `apps/desktop/src/features/account/PendingAccountPage.tsx`
- Create: `apps/desktop/src/features/account/RejectedAccountPage.tsx`
- Create: `apps/desktop/src/features/account/AccountSettingsSection.tsx`
- Create: matching `*.test.tsx` files
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing UI tests before components.**

Cover: toggle between sign-in/register; registration submits `displayName`, `email`, `password`; pending screen says approval is required; rejected screen offers sign-out only; Settings starts with analytics disabled and submits an explicit opt-in change.

- [ ] **Step 2: Run focused tests and verify missing-component failures.**

Run: `npm test -- --run src/features/account`

Expected: FAIL because the five account components are absent.

- [ ] **Step 3: Implement the forms with accessible, deterministic states.**

Use `<label htmlFor>`, `aria-describedby` for field errors, disabled submit buttons while the request is pending, and the API codes from the shared contract. The pending/rejected pages must not include a back link into the normal app. The account settings section must include:

```text
Usage analytics
[ ] Help improve Library by sharing anonymous feature and error events.
You can change this at any time. Documents, cards, searches, and locations are never sent.
```

- [ ] **Step 4: Add a version/status display placeholder API boundary, not an updater implementation.**

Render the app version and an empty `UpdateStatus` slot in Account Settings. Task 11 supplies the updater data; do not fake an update result in production.

- [ ] **Step 5: Run focused UI tests and a production build.**

Run:

```bash
npm test -- --run src/features/account src/features/settings/SettingsPage.test.tsx
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the account screens.**

```bash
git add apps/desktop/src/features/account apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/styles/tokens.css
git commit -m "feat: add account approval screens"
```

## Task 9: Build the desktop Admin section and feature-gated navigation

**Files:**
- Create: `apps/desktop/src/features/admin/AdminPage.tsx`
- Create: `apps/desktop/src/features/admin/AdminPage.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/AppSidebar.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing admin tests.**

Test these outcomes with injected `AdminApi` fakes: non-admin receives no Admin sidebar item; admin sees pending user list; Approve calls `admin_set_user_status` with `approved`; Reject calls it with `rejected`; metrics render aggregate count cards; no component asks for raw event details.

- [ ] **Step 2: Run the test and verify it fails because the admin module/route is absent.**

Run: `npm test -- --run src/features/admin/AdminPage.test.tsx`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Add a typed `admin` route and sidebar section.**

Extend `AppRoute` with `{ name: "admin" }`. Add the sidebar item only when `profile.role === "admin"`. If a stale local profile tries to navigate to Admin after a server downgrade, `admin_list_users` returns `admin_required`; clear the local session snapshot, refresh it, and return to the account gate.

- [ ] **Step 4: Implement the bounded first dashboard.**

The page has exactly four sections: Pending Accounts (approve/reject), Approved/Rejected Accounts (status and group membership), Feature Access (create/list features and assign enabled/disabled user/group rules), and Overview Metrics (five aggregates from Task 5). Fetch groups and features through the explicit admin list routes before rendering select controls. Use explicit confirm dialogs for approve, reject, and feature-assignment changes; show a success/error result beside the affected row.

- [ ] **Step 5: Add feature-gate helper tests.**

Create `hasFeature(entitlements, key)` in `src/domain/account.ts`, return `entitlements.featureKeys.includes(key)`, and test false for a missing/null snapshot. Use it only to hide ordinary UI; add comments at every server-backed feature call that the server remains the authority.

- [ ] **Step 6: Run focused tests and commit.**

Run:

```bash
npm test -- --run src/features/admin/AdminPage.test.tsx src/app/App.test.tsx
npm run build
```

Expected: both commands exit 0.

```bash
git add apps/desktop/src/features/admin apps/desktop/src/app/App.tsx apps/desktop/src/app/AppSidebar.tsx apps/desktop/src/domain/account.ts apps/desktop/src/styles/tokens.css
git commit -m "feat: add desktop administration dashboard"
```

## Task 10: Add opt-in client analytics with a bounded offline queue

**Files:**
- Create: `apps/desktop/src/lib/analytics.ts`
- Create: `apps/desktop/src/lib/analytics.test.ts`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/features/account/AccountSettingsSection.tsx`

- [ ] **Step 1: Write failing queue tests.**

```ts
it("does not enqueue when analytics is disabled", () => { /* disabled -> [] */ });
it("drops the oldest item after 100 queued events", () => { /* queue length stays 100 */ });
it("redacts prohibited payload keys before enqueue", () => { /* path/content/query omitted */ });
it("keeps events when transport fails and clears them after a successful batch", async () => { /* retry */ });
```

- [ ] **Step 2: Run the test and verify the missing-module failure.**

Run: `npm test -- --run src/lib/analytics.test.ts`

Expected: FAIL because `analytics.ts` is absent.

- [x] **Step 3: Implement only the allowed event names/payloads.**

Store the queue in a dedicated localStorage key `library.analytics.queue.v1`; it contains no tokens, document IDs, card IDs, raw error stacks, or free-form text. Generate an installation ID once with `crypto.randomUUID()` under `library.analytics.installation-id.v1`. Flush at approved-app start, after an event is enqueued, and on `online`; no timer shorter than 60 seconds.

- [x] **Step 4: Instrument only safe lifecycle points.**

Track `app_opened` after an approved session and analytics opt-in. Track `feature_opened` only with fixed feature keys. Map handled network/account/updater errors to fixed codes, never `String(error)`. Do not add reader, card, search, or map content to events.

- [x] **Step 5: Run tests and commit.**

Run:

```bash
npm test -- --run src/lib/analytics.test.ts src/features/account
npm run build
```

Expected: both commands exit 0.

```bash
git add apps/desktop/src/lib/analytics.ts apps/desktop/src/lib/analytics.test.ts apps/desktop/src/app/App.tsx apps/desktop/src/features/account/AccountSettingsSection.tsx
git commit -m "feat: add opt-in product analytics"
```

## Task 11: Configure Tauri signed updates and the Account Settings update action

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/capabilities/default.json`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src/lib/updater.ts`
- Create: `apps/desktop/src/lib/updater.test.ts`
- Modify: `apps/desktop/src/features/account/AccountSettingsSection.tsx`

- [x] **Step 1: Write failing updater wrapper tests.**

```ts
it("returns idle when check reports no update", async () => { /* check() -> null */ });
it("exposes version and notes when an update is available", async () => { /* update -> available */ });
it("reports download progress and requests relaunch after installation", async () => { /* progress */ });
```

- [x] **Step 2: Run the tests and confirm the updater module is missing.**

Run: `npm test -- --run src/lib/updater.test.ts`

Expected: FAIL with module-not-found.

- [x] **Step 3: Add official Tauri updater dependencies and permissions.**

Run from `apps/desktop`:

```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
npm run tauri add updater
```

Check the generated capability permission identifiers against the installed plugin's `permissions` manifest. Grant only `updater:default` and `process:allow-restart`; do not grant shell/process spawning permissions broadly.

- [x] **Step 4: Configure signed artifact generation.**

Set `bundle.createUpdaterArtifacts` to `true`. Add `plugins.updater.pubkey` to the generated public key from the human-only prerequisite and set its sole endpoint to the repository's public GitHub Releases `latest.json` URL. Do not insert the private key or password in this file.

- [x] **Step 5: Implement a user-initiated update UI.**

`updater.ts` wraps `check`, `downloadAndInstall`, and `relaunch`. Account Settings calls `check` on mount and has a green `Install vX.Y.Z` button only after a valid signed update is available. While installing, show percentage if content length is known, disable duplicate clicks, preserve the old app on failure, and display the fixed error code `update_failed` rather than the raw error.

- [x] **Step 6: Run JS/Rust checks and commit.**

Run:

```bash
npm test -- --run src/lib/updater.test.ts src/features/account
npm run build
cargo test --all-targets --manifest-path src-tauri/Cargo.toml
```

Expected: all commands exit 0.

```bash
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/capabilities/default.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src/lib/updater.ts apps/desktop/src/lib/updater.test.ts apps/desktop/src/features/account/AccountSettingsSection.tsx
git commit -m "feat: add signed macOS updater"
```

## Task 12: Add the macOS GitHub Release workflow

**Files:**
- Create: `.github/workflows/release-macos.yml`
- Modify: `apps/desktop/README.md`

- [x] **Step 1: Write a release workflow validation checklist in the README before YAML.**

The checklist must require a version tag `desktop-vX.Y.Z`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, a manually tested signed update from the immediately preceding version, and no private signing value in checkout logs.

- [x] **Step 2: Add a workflow that runs only on desktop release tags.**

The workflow must: check out the tag; run `npm ci` in `apps/desktop`; install Rust stable; export the two signing secrets only into the build step; run `npm run tauri build`; upload updater artifacts and `latest.json` to the GitHub Release; and fail if any expected `.sig` file is absent. Use a macOS runner because this is a macOS-first release.

- [x] **Step 3: Validate YAML syntax and dry-run the build locally without signing.**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release-macos.yml")'
cd apps/desktop && npm run build
```

Expected: YAML parser exits 0; frontend build exits 0. Do not claim a release build is signed until the workflow has run with real GitHub secrets.

- [x] **Step 4: Commit release automation.**

```bash
git add .github/workflows/release-macos.yml apps/desktop/README.md
git commit -m "ci: publish signed macOS releases"
```

## Task 13: Deploy PocketBase securely on Oracle with DuckDNS, Caddy, and backup/restore

**Files:**
- Create: `services/pocketbase/deploy/Caddyfile`
- Create: `services/pocketbase/deploy/pocketbase.service`
- Create: `services/pocketbase/deploy/backup-pocketbase.sh`
- Create: `services/pocketbase/deploy/backup-pocketbase.service`
- Create: `services/pocketbase/deploy/backup-pocketbase.timer`
- Create: `services/pocketbase/deploy/duckdns-update.sh`
- Create: `services/pocketbase/deploy/duckdns.service`
- Create: `services/pocketbase/deploy/duckdns.timer`
- Modify: `services/pocketbase/README.md`

- [x] **Step 1: Write deployment acceptance commands before service files.**

```bash
curl --fail --silent --show-error https://APP_HOST.duckdns.org/api/health
sudo ss -ltnp | rg ':(80|443|8090)'
sudo systemctl is-active caddy corelib-pocketbase backup-pocketbase.timer duckdns.timer
```

Expected: health check succeeds; Caddy owns 80/443; PocketBase listens only on `127.0.0.1:8090`; all listed services are active.

- [x] **Step 2: Implement Caddy and systemd files with least exposure.**

`Caddyfile` must redirect HTTP to HTTPS and reverse proxy `APP_HOST.duckdns.org` to `127.0.0.1:8090`. `pocketbase.service` must use a dedicated non-login `corelib` user, set `WorkingDirectory=/opt/corelib-pocketbase`, set `UMask=0077`, and run `serve --http=127.0.0.1:8090 --dir /var/lib/corelib-pocketbase/pb_data`. It must not use `--automigrate`; deploy migrations explicitly before restart.

- [x] **Step 3: Implement DuckDNS refresh without leaking the token.**

`duckdns-update.sh` sources `/etc/corelib-pocketbase.env`, requires both `DUCKDNS_DOMAIN` and `DUCKDNS_TOKEN`, calls only `https://www.duckdns.org/update`, and returns non-zero unless the body is exactly `OK`. The systemd timer runs it every 5 minutes and logs no query string.

- [x] **Step 4: Implement a SQLite-consistent backup and restoration drill.**

`backup-pocketbase.sh` must stop the service briefly or use the PocketBase backup command, write a timestamped archive outside `pb_data`, encrypt it before copying off-host, and retain seven local archives. The README must include an exact restoration drill into `/tmp/corelib-restore`, start PocketBase on `127.0.0.1:8091`, and run `tests/smoke.sh http://127.0.0.1:8091` against the restored database.

- [x] **Step 5: Deploy manually and execute acceptance commands.**

Open only ports 80 and 443 publicly. Restrict SSH at the Oracle firewall/security-list and OS firewall to the owner's source IP where possible. Confirm the raw server IP cannot serve the product API with a valid host certificate.

- [x] **Step 6: Commit deployment artifacts after redacting all values.**

```bash
git add services/pocketbase
git commit -m "ops: deploy account service on Oracle"
```

## Task 14: End-to-end release readiness

**Files:**
- Modify: `apps/desktop/README.md`
- Modify: `services/pocketbase/README.md`

- [x] **Step 1: Add a manual release checklist that must be completed in order.**

```text
1. Register a fresh account; verify it sees only Pending.
2. Verify a pending account cannot call protected routes with a forged/old token.
3. Approve it with the desktop Admin section; sign in and open Library.
4. Assign a group feature; verify it appears. Add a user deny; verify it disappears.
5. Opt in to analytics; open a feature; verify aggregate metrics only.
6. Opt out; verify new events return analytics_disabled and are not queued.
7. Install previous signed build, publish a higher signed tag, check/install/relaunch update.
8. Restore the latest encrypted server backup into an isolated directory and run smoke tests.
```

- [x] **Step 2: Run all automated checks from the repository root.**

Run:

```bash
cd apps/desktop && npm test
cd apps/desktop && npm run build
cargo test --all-targets --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
bash services/pocketbase/tests/smoke.sh https://APP_HOST.duckdns.org
```

Expected: each command exits 0. If any command fails, stop and fix only the first root cause before moving to the next checklist item.

- [x] **Step 3: Commit the release checklist only after all local automated checks pass.**

```bash
git add apps/desktop/README.md services/pocketbase/README.md
git commit -m "docs: add account release checklist"
```

## Plan self-review

### Spec coverage

- Account self-registration, pending block, approval/rejection: Tasks 2, 3, 7, and 8.
- In-app administrator management: Tasks 4 and 9.
- Groups and per-user feature restrictions: Tasks 4 and 9.
- Opt-in, minimal analytics and aggregate metrics: Tasks 5 and 10.
- Local-first data boundary: enforced in Non-negotiable boundaries and Task 6 transport design.
- DuckDNS/Caddy/Oracle HTTPS and backup: Task 13.
- GitHub Releases signed macOS updater: Tasks 11 and 12.
- Test, restore, and release verification: Task 14.

### Deliberately deferred requirements

Google OAuth, password reset email, cloud sync, web dashboard, Windows/Linux release, and map navigation data are not included. They require separate approved designs.

### Handoff rules for smaller agents

Assign one task at a time, in order. Do not parallelize Tasks 2-5 (shared PocketBase schema/hooks), Tasks 6-10 (shared client contract), or Tasks 11-14 (release/deployment chain). A supervising agent must inspect the diff, run the task's exact verification commands, and confirm the stated commit exists before assigning the next task.
