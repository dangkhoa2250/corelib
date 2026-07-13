# Desktop Account Approval, Feature Access, and Analytics Design

## Problem

Library is a macOS-first, local-first desktop app that currently has no
application account or shared service. The owner wants to let family and
friends create their own accounts, approve each account before it can use the
app, selectively release features to people or groups, and view basic usage
statistics. The app must also support signed self-updates from GitHub Releases.

The available infrastructure is a GitHub repository and an Oracle Always Free
server (2 CPU, 12 GB RAM). The owner does not want to purchase a domain yet.

## Decisions

- Target macOS first; Windows and Linux are deferred.
- Use email and password authentication for the first release. Google sign-in
  is explicitly deferred.
- New registrations enter a `pending` state. A pending account cannot access
  app content or protected APIs.
- PocketBase, backed by its SQLite database, is the first shared-service
  backend. It runs on the Oracle server behind Caddy.
- Use a free DuckDNS hostname for the first deployment. Caddy terminates TLS;
  the desktop app never talks to PocketBase over HTTP or by a raw IP address.
- Keep the primary administrative interface in the existing Tauri application.
  PocketBase's own dashboard is a break-glass server-administration tool, not
  the normal product dashboard.
- Keep current documents, cards, and learning progress local. This project
  introduces identity, entitlements, and analytics only; it does not introduce
  document or learning-data sync.
- Ship one signed macOS build to everyone through GitHub Releases. Feature
  flags, not separate binaries, control staged capability access.

## Architecture

```text
Tauri macOS app
  |-- HTTPS --> APP_HOST.duckdns.org --> Caddy --> PocketBase + SQLite
  |                                                   |-- accounts and approval
  |                                                   |-- groups and feature flags
  |                                                   |-- aggregate analytics API
  |                                                   `-- audit log
  `-- HTTPS --> GitHub Releases --> signed Tauri update artifacts
```

PocketBase is intentionally limited to app-service data. The existing local
SQLite databases remain the source of truth for imported PDFs, documents,
cards, review history, Google Drive cache, and user-provided AI credentials.

## Account and Approval Flow

1. A person enters display name, email, and password in the desktop app.
2. The backend creates an account with `status = pending` and a creation time.
3. The app immediately shows a pending-approval screen. On future sign-in
   attempts, the backend returns an explicit pending result; the normal app
   shell and protected data APIs remain unavailable.
4. An administrator opens the Admin section, reviews the request, and either
   approves or rejects it. The action records the acting admin, prior status,
   next status, and timestamp in an audit log.
5. An approved person signs in and receives a session that can access only the
   endpoints and features granted to that account.

There is no public account registration for administrators. The initial
administrator is bootstrapped during deployment and stored separately from
ordinary member registration. The server must enforce `status = approved` and
administrator authorization; hiding a navigation item in React is not a
security boundary.

Password-reset and email-verification flows are deferred because they require
an outbound email provider. The first release must clearly state this in the
registration and support UI instead of silently treating an email address as
verified.

## Authorization and Feature Flags

Each account has one role (`member` or `admin`) and can belong to zero or more
groups. Feature rules support an explicit allow/deny decision by account or by
group. An account-specific decision takes precedence over a group decision.

The desktop app loads its entitlement snapshot after sign-in and whenever it
returns to the foreground. It uses that snapshot to show or hide features.
Any server-backed capability must also check the same entitlement on the
backend. A local-only capability can be hidden from normal use but cannot be
made tamper-proof once its code is shipped in a desktop binary; sensitive or
quota-limited features must remain server-mediated.

The first Admin section provides:

- pending, approved, and rejected account lists;
- approve/reject actions and membership assignment;
- feature assignment to a user or group;
- basic activity and release-version statistics; and
- a read-only audit history of administrative changes.

## Analytics and Privacy

On first approved sign-in, the app asks the member to opt in to product usage
analytics. Analytics are disabled until that choice is made and can be disabled
again in Settings.

The initial event allowlist is deliberately small:

- app opened or closed;
- app version and operating-system version;
- approved feature opened or completed;
- handled application error code; and
- updater state (available, downloaded, installed, failed).

Events include the account ID, anonymized installation ID, app version, event
name, event time, and a narrowly typed payload. The client batches events and
retries them later if offline. The server rejects arbitrary event names and
payload fields.

The system must not collect PDF contents, card text, search queries, raw file
paths, AI prompts, API keys, or location/address/navigation history. A future
map feature requires a separate design, separate opt-in, retention policy,
export/deletion controls, and a decision about whether exact locations are
necessary at all.

The Admin dashboard reports aggregates such as approved users, recently active
users, app-version distribution, feature use, and error counts. It does not
expose a raw event browser by default.

## Updates

Tauri's updater will check a GitHub Releases `latest.json` endpoint at startup
and on an explicit manual check. The app shows an available version and release
notes as a green update action in Settings/account UI. The person chooses to
download and install; progress and errors are visible, then the app relaunches.

Every update artifact is signed with the Tauri update private key. The public
key is bundled in the app configuration, while the private key is kept outside
the repository and supplied only to the release workflow. Losing or publishing
that private key invalidates the update trust chain and is a release incident.

Updates are universal for the current macOS release. Feature flags control
rollout after installation, avoiding different application binaries for
different people. macOS code signing and notarization are a follow-up
deployment requirement for a polished friend-and-family install experience.

## Deployment and Operations

The Oracle server runs Caddy and PocketBase as managed services. Caddy owns
ports 80 and 443, redirects HTTP to HTTPS, and proxies only the necessary
PocketBase routes. PocketBase must bind only to localhost. The firewall allows
80, 443, and restricted SSH; database files and administration credentials are
never public.

Before deployment, the owner selects one available DuckDNS slug (`APP_HOST`).
DuckDNS maps `APP_HOST.duckdns.org` to the Oracle public IP. If the server IP
changes, an authenticated updater task refreshes the DuckDNS record. The
hostname becomes the app's stable API base URL and TLS certificate name.

The PocketBase data directory is backed up daily using a SQLite-consistent
backup procedure. A local backup alone does not protect against a lost Oracle
instance, so the deployment checklist requires an encrypted, off-server copy
before real member analytics are retained. Do not commit database files,
passwords, API keys, update keys, or backups to GitHub.

## Error Handling

- Network outage: retain the current local app data; show an offline account
  state and retry entitlement/analytics requests without blocking local files.
- Pending/rejected account: show a dedicated status screen, never a generic
  authentication failure.
- Expired or invalid session: clear the stored session and return to sign-in.
- Unauthorized server response: revoke the current entitlement snapshot and
  redirect to the appropriate account-status screen.
- Analytics failure: drop no user work; queue a bounded number of events and
  discard overflow rather than growing local storage indefinitely.
- Update failure: preserve the installed version and show a retryable error;
  never replace an installed app with an unverified artifact.

## Testing

- Frontend unit tests cover registration, pending/rejected/approved routing,
  session expiry, opt-in behavior, entitlement-gated controls, and Admin UI
  state.
- Backend integration tests cover password hashing, default pending state,
  blocked pending access, admin-only approve/reject/group/flag routes,
  entitlement precedence, analytics event validation, and audit-log writes.
- End-to-end tests exercise member registration, admin approval, member sign
  in, feature visibility, analytics opt-in, and an update-available UI state
  using test doubles for GitHub Releases.
- Deployment verification checks trusted HTTPS, PocketBase's non-public bind,
  firewall exposure, backup restoration, and a signed update installed over a
  prior macOS build.

## Acceptance Criteria

- A person can create an email/password account and cannot use the app until
  an administrator approves it.
- An administrator can manage users, groups, feature access, and aggregate
  statistics from the desktop Admin section.
- Server routes enforce approval, role, and feature access independently of
  the client UI.
- Existing local documents and learning data remain local and work offline.
- Analytics are opt-in, allowlisted, and exclude document/card content and
  location data.
- A user sees, chooses, downloads, and installs a verified macOS update from
  GitHub Releases.
- The service is reachable through trusted HTTPS on a DuckDNS hostname, with
  a tested backup-and-restore path.

## Deferred Work

- Google, Apple, or other third-party sign-in.
- Email verification, password reset, and outbound email delivery.
- Cloud synchronization or sharing of documents, cards, and learning data.
- Windows and Linux distribution.
- Browser-based administration dashboard.
- Collection of map navigation or precise location data.
