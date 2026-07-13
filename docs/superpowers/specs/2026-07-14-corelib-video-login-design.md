# Corelib video login design

## Goal

Replace the legacy Antigravity-branded account entry screen with a Corelib sign-in experience that uses the supplied animated background and a right-aligned glass form panel.

## Scope

- Add the supplied `corelib-login-page.mp4` as a bundled, muted, looping background video for the account gate.
- Add a dark overlay so form content remains legible regardless of the video frame.
- Rework the sign-in and registration layouts as a dark, translucent glass card positioned on the right of wide windows and centered on narrow windows.
- Use `Corelib` consistently in account-screen branding, removing the legacy `Antigravity Library` label.
- Preserve all current account actions: sign-in, registration, loading state, error state, remember-me selection, and tab switching.

## Design

The account gate fills the viewport. A `video` element renders behind the UI using `autoplay`, `muted`, `loop`, and `playsInline`; it uses `object-fit: cover` to avoid letterboxing. A fixed dark overlay reduces visual noise and offers a stable contrast baseline.

The form card is a 440px-wide dark panel with a subtle translucent border, soft shadow, and backdrop blur. On desktop it is aligned to the right with comfortable outer spacing. At smaller widths it becomes nearly full width, remains centered, and the background remains visible around it.

Corelib branding sits above the account controls. The existing sign-in/register tabs remain, with a neutral high-contrast active treatment. Inputs, checkbox, error state, and primary action preserve their existing accessible labels and behavior while adopting the new dark visual system.

## Implementation boundaries

- `AccountGate.tsx` owns the shared viewport, video, overlay, and account-gate CSS.
- `SignInPage.tsx` and `RegisterPage.tsx` own their content and Corelib wording only.
- The video is stored as a desktop frontend asset so Tauri/Vite bundles it with the application.

## Validation

- Existing sign-in and registration component tests continue to pass.
- Add targeted assertions for the visible Corelib branding and video background semantics where practical.
- Run the desktop test suite and production build after the change.
