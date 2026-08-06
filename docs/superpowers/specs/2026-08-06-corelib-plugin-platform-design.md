# Corelib Plugin Platform Design

**Status:** Accepted product and architecture direction

## Vision

Corelib is a personal application platform for assembling everyday capabilities rather than a document application with a growing set of permanently built-in features. Users choose the Plugins they need, remove those they do not, arrange their frequently used Surfaces, and may allow a Corelib Agent Runtime to coordinate authorized Commands across those Plugins.

Library and Memora remain important capabilities, but they are First-party Plugins rather than definitions of the host product. The canonical vocabulary is maintained in [`CONTEXT.md`](../../../CONTEXT.md).

## Product principles

1. Corelib keeps a minimal, stable host and makes user-facing capabilities removable Plugins.
2. Marketplace code is reviewed, signed, sandboxed, and least-privileged even after review.
3. Installing code, granting access, allowing AI use, and confirming consequential actions are separate decisions.
4. Plugin Data remains owned and portable by its Plugin.
5. Cross-Plugin behavior uses versioned JSON contracts, not shared database tables or direct callbacks.
6. Human actions, Plugin integrations, Agent tools, and Automations share one Command contract instead of drifting APIs.
7. Current desktop behavior is migrated in stages rather than replaced by a second application or a one-shot rewrite.

## Host and Plugin responsibilities

### Core Services

The following are non-removable Core Services:

- application window, shared shell, theme, navigation frame, and Corelib Home;
- Plugin Registry, lifecycle management, dependency resolution, and recovery;
- Marketplace client, signature verification, update staging, and rollback;
- Plugin Runtime isolation;
- Capability and Permission enforcement;
- isolated storage allocation, backup/export coordination, and future Core Sync;
- Command, Resource, Event, and Automation coordination;
- account integration and Corelib host updates;
- Agent Runtime authorization, planning, confirmation, execution, and audit;
- diagnostics and safe-mode recovery.

The Agent Runtime may be disabled and may have no AI model configured, but ordinary Plugins do not replace its security and execution authority.

### First-party Plugins

The existing product is decomposed into removable First-party Plugins:

- Library: document collection, import, reading, and related document workflows;
- Memora: flashcards, review, and durable-learning workflows;
- Statistics: personal insights over available Plugin integrations;
- Drive: Google Drive document integration;
- model and translation providers;
- future calendar, tasks, notes, finance, media, and other everyday capabilities.

Account, host Settings, Plugin management, and diagnostics remain Core Services. The current PocketBase login gate remains unchanged during the initial platform work; anonymous/local account behavior may be reconsidered separately.

## Marketplace and trust

Plugin Publishers may submit releases, but submission does not make a Plugin installable. Corelib reviews each release, runs automated checks, and signs approved immutable artifacts. Production Corelib installs Marketplace Plugins only when the complete package has a valid Corelib signature. An explicit developer mode may load unsigned local packages for development.

The initial Marketplace distributes free Plugins only. Payments, taxes, refunds, revenue sharing, offline paid-license behavior, and paid dependencies are deferred, while package identity leaves room for later licensing metadata.

Marketplace installation and update operate on immutable Plugin Releases. A release declares one stable Plugin identity, its Publisher, semantic version, supported Plugin API range, dependencies, permissions, contributions, and integrity-protected package files.

## Plugin package and Runtime

A Plugin Release contains declarative manifest metadata, web assets, a DOM-free command worker, optional WebAssembly, schemas, localization, and Plugin-owned migrations. It does not contain native executables, dynamic libraries, unrestricted Tauri commands, or code downloaded after review.

The Plugin Runtime supports:

- sandboxed HTML, CSS, and JavaScript/TypeScript for Plugin Surfaces;
- a separate worker for Commands that must run while no Surface is open;
- optional WebAssembly for heavy computation or additional source languages;
- a strict content security policy;
- no `eval`, Node.js API, direct filesystem, direct Keyring, host DOM, or host React access;
- communication with Corelib only through granted Capabilities and versioned contracts.

Shared contributions such as navigation entries, Commands, and Settings metadata are declarative and rendered by Corelib. Feature-specific Plugin Surfaces are isolated web UIs displayed within Corelib's visual frame. Corelib supplies theme tokens, accessible primitives, and a Plugin SDK without giving Plugins access to host state.

## Capabilities and Permissions

Native and external access is exposed as narrow Plugin Capabilities such as document read, Plugin storage, scoped filesystem selection, notifications, calendars, or declared network domains. Each Plugin Permission grants one Plugin a Capability within an explicit scope.

Plugins declare required and optional Permissions before installation. Users may deny optional Permissions, revoke grants, and inspect current access. Required Permission denial cancels installation. An update that expands Permissions pauses for renewed consent.

Read and write grants are separate. High-impact actions such as deletion, purchase, public posting, messaging, or external sharing still require execution-time confirmation even when the underlying Permission already exists.

## Data, Resources, and Events

Each Plugin owns an isolated storage namespace. The host may provide JSON/key-value, indexed record, and blob storage forms; a Plugin chooses the form appropriate to its workload. Plugins cannot query another Plugin's tables or Corelib's private storage.

Cross-boundary values use versioned JSON Schema contracts:

- Plugin Resources represent authoritative Plugin-owned state.
- Plugin Commands request behavior and return typed results.
- Plugin Events announce changes or occurrences, normally carrying a Resource ID, revision, and change type rather than a stale copy of complete state.
- Plugin References preserve loose relationships to Resources owned by another Plugin and may temporarily be unresolved.

Event subscriptions are declared. Corelib brokers delivery, applies Permission checks, and allows retries, so handlers must tolerate duplicates. Sensitive event details are fetched through authorized Commands rather than broadcast.

Corelib standardizes backup and export. Plugins remain local-first and offline-capable. A later opt-in Core Sync service may synchronize explicitly eligible, client-encrypted Plugin Data while preserving Plugin ownership and declared conflict rules. Plugins may instead use their own cloud through Network Permissions.

## Lifecycle and dependencies

Corelib distinguishes:

- Disable: stop execution and contributions while retaining package and data;
- Uninstall: remove the package while retaining Plugin Data;
- Erase Plugin Data: separately and permanently remove retained data after confirmation.

Reinstallation may restore retained data and resolve dormant Plugin References.

Plugin Dependencies are required or optional, semantic-version constrained, and acyclic. Required dependencies and their Permissions are shown and installed together. Corelib prevents removing an active dependency unless the user cancels or accepts cascade disabling of dependents. Missing optional dependencies disable only the related integration.

Approved updates that remain compatible and add no Permissions may install automatically. Other updates require approval. Corelib verifies a new package in staging, switches atomically, retains the previous package, and rolls back on startup or health-check failure when Plugin Data remains backward-compatible. Data migration is backed up first; non-reversible migrations require explicit approval and recovery guidance.

## Navigation and discovery

Installation and placement are separate. Installed Plugin Surfaces appear in Corelib Home and Quick Open. Users explicitly pin, order, group, hide, and remove frequently used Surfaces from the sidebar, so installing dependencies or multi-Surface Plugins does not clutter navigation.

Quick Open remains navigation-only. The Command Palette remains action-only. Plugin ownership and availability are resolved through the Plugin Registry, and CI rejects public contributions without registration coverage.

## Commands and Agent operation

One Command Registry serves four Command Audiences:

- humans through Surfaces or the Command Palette;
- other Plugins;
- the Agent Runtime;
- saved Automations.

Every cross-boundary Command has a stable ID, versioned input/output JSON Schemas, required Permissions, effect classification, confirmation policy, structured errors, timeout/cancellation behavior, and idempotency guidance. Private implementation functions are not registered.

AI sees a Command only when:

1. its Publisher marks the Command agent-enabled;
2. the user provides an Agent Grant;
3. current Plugin Permissions allow the operation;
4. Corelib does not reserve the operation as human-only authority.

Credentials, Permission grants, unsigned-code settings, Marketplace review, administrative controls, and Agent safety settings are never directly agent-callable.

The Agent Runtime may execute granted reads without confirmation, requests one plan-level confirmation for grouped reversible writes, and requests targeted confirmation for destructive, financial, public, messaging, and external-sharing steps. A materially changed Agent Plan pauses for renewed approval. Execution history exposes progress, failures, cancellation, and available undo actions.

Initial Agent work is interactive. Later Automations may run from user-approved schedules or Plugin Events with fixed Commands, data scopes, resource/cost limits, dependency checks, notifications, and audit history. They never bypass high-impact confirmation requirements.

## Delivery stages

1. **Foundation:** versioned Manifest contracts and a static Registry drive current public route, command, search, settings, and navigation metadata without changing behavior.
2. **First-party lifecycle:** current features become removable First-party Plugins with enable/disable behavior and isolated ownership.
3. **External Runtime:** sandboxed packages, local developer mode, Capabilities, Permissions, isolated storage, and recovery.
4. **Marketplace:** Publisher submission, review, signing, installation, dependencies, updates, and rollback.
5. **Agent Runtime:** Command discovery, Agent Grants, planning, confirmation, execution, and audit.
6. **Later capabilities:** Automation, Core Sync, and paid distribution.

The accepted Phase 1 specification is [`2026-08-06-plugin-platform-foundation-design.md`](./2026-08-06-plugin-platform-foundation-design.md), with its test-first implementation plan in [`../plans/2026-08-06-plugin-platform-foundation-implementation.md`](../plans/2026-08-06-plugin-platform-foundation-implementation.md).
