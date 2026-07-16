---
name: checking-scroll-surfaces
description: Prevent WKWebView scrollbar regressions in Corelib desktop UI. Use before adding or modifying any scrollable desktop surface, list, pane, modal, or custom scrollbar, and when diagnosing a white scrollbar track or a thumb overlapping content.
---

# Checking Scroll Surfaces

WKWebView can reserve a white native scrollbar gutter even when CSS styles its pseudo-elements. A custom overlay thumb can then cover content unless the content explicitly reserves space.

## Required workflow

1. Prefer `apps/desktop/src/components/ScrollArea.tsx` for a scrollable surface that must not show a native track. Do not try to solve WKWebView's white gutter with more `::-webkit-scrollbar` overrides.
2. When `ScrollArea` is used, reserve a gutter in its immediate content element. Its thumb is 8px wide with a 4px outer margin; use at least 20px padding on the thumb side (for example `padding-right: 20px`) so text, buttons, selected-row backgrounds, and controls never sit under it.
3. Keep the thumb and surrounding surface theme-token based. Never hard-code light track colours or rely on a transparent native track.
4. Add a focused regression assertion for both decisions: the surface uses `ScrollArea`, and its content has the required thumb-side inset.
5. For macOS behavior, restart `tauri dev` from the current checkout before manual verification. Check the scrollbar on a long list in both theme modes and verify the thumb neither reveals a white track nor overlays any interactive row.

## Red flags

- `overflow: auto` or `overflow-y: auto` on a new desktop list without a reasoned native-scroll strategy.
- Styling only `::-webkit-scrollbar-track`; WKWebView can ignore it.
- Overlay thumbs with no matching content inset.
- Treating an already-open app, installed app, or another worktree's Vite server as proof of the current checkout.

## Completion check

- [ ] The surface has no white native track in a fresh desktop runtime.
- [ ] Thumb-side content padding keeps all row content and row backgrounds clear of the thumb.
- [ ] Light and dark colours derive from existing tokens.
- [ ] Focused and relevant desktop tests pass.
