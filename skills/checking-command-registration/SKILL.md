---
name: checking-command-registration
description: Use when adding or exposing a public Corelib desktop page, route, feature entry point, navigation destination, or user-invokable action that users should find through Quick Open or the Command Palette.
---

# Checking Command Registration

## Overview

Keep public Corelib capabilities discoverable. A feature is incomplete until its route and command registration pass the same checks as its UI.

## Workflow

1. Classify the change before editing. A user-reachable page or section needs a Quick Open destination; a user-triggered operation or direct setting change needs a Command Palette action. A genuinely internal route must be marked internal with a concise reason.
2. Locate `apps/desktop/src/app/routes.ts` and `apps/desktop/src/app/commandRegistry.ts` before adding UI. Do not edit legacy arrays or result-kind conditionals in `App.tsx`.
3. For a public page, add one `PUBLIC_ROUTE_CATALOG` entry containing its route, stable ID, title, aliases, and non-empty internal-app breadcrumb. The registry derives Quick Open entries from this catalog automatically. Keep a destination route separate from a direct action handler.
4. Register dynamic resources through the feature resolver. Their breadcrumb must describe Corelib navigation (for example, `Memora › Deck name › Cards`), not a filesystem or cloud-provider path.
5. Add or update focused registry and palette tests, then run the desktop typecheck/build and relevant test suite. Do not report the feature complete while command coverage fails.

## Surface Rules

| Surface | Include | Never do |
| --- | --- | --- |
| `⌘K` Quick Open | pages, settings sections, documents, decks, cards, other destinations | mutate settings or perform an operation |
| `⇧⌘K` Command Palette | actions, workflow commands, direct setting pickers/toggles | act as a duplicate page navigator |

## Red Flags

| Rationalization | Required response |
| --- | --- |
| “I can just add one result in `App.tsx`.” | Stop; add or update `PUBLIC_ROUTE_CATALOG` or the typed command registry so it remains the source of truth. |
| “The page is too small to search.” | Register it if a user can navigate to it; mark it internal only with a concrete reason. |
| “The breadcrumb is cosmetic.” | Add it and test it; it is both result provenance and a search term. |
| “CI will catch it later.” | Run focused coverage tests before handoff. |

## Completion Check

- [ ] Public destination is registered in `PUBLIC_ROUTE_CATALOG`; dynamic resources use the registry resolver.
- [ ] Title, aliases, and internal breadcrumb are searchable and non-empty.
- [ ] The entry uses exactly one surface and the matching handler type.
- [ ] Registry coverage and palette tests pass.
