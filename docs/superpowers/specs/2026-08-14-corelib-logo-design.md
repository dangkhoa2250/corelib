# Corelib Logo Design

## Goal

Create a simple, brandable desktop app icon for Corelib, replacing the generic current mark after the concept is visually approved.

## Approved Direction

Use the supplied image of an illuminated open book on a pedestal as a mood and composition reference. Translate it into a compact **Knowledge Monument** mark rather than reproducing its detailed voxel scene.

The icon consists of:

- an open book as the dominant silhouette;
- a short, two-step pedestal suggesting a library or monument to knowledge;
- a dark navy rounded-square app-icon field;
- cyan/teal as the primary color and warm yellow as the page/spine accent;
- restrained dimensional depth, with no small decorative pixels or environmental scene.

## ImageGen Prototype

Generate one polished square raster concept using the supplied image as a reference. The concept has no text, watermark, letters, people, loose particles, floor plane, or complex background. Keep the symbol centered with generous padding and strong contrast.

The generated concept is preview-only at first. It must remain readable at 32 px before it is accepted for app integration.

## Acceptance Criteria

- Recognizable as an open book on a knowledge pedestal at 32 px.
- Uses a simple silhouette and no fragile micro-detail.
- Feels distinctive enough to identify Corelib without a wordmark.
- Works as a macOS and Windows desktop app icon.
- Preserves the existing cyan-and-yellow brand connection without copying the current mark.

## Integration Scope

After visual approval, export a square master asset and regenerate the Tauri icon set in `apps/desktop/src-tauri/icons`, including PNG, ICNS, and ICO bundle assets. Runtime verification must use a fresh build from the current checkout and follow the repository's version-sensitive desktop verification instructions.

## Out of Scope

- A full brand system or wordmark.
- In-app navigation or feature changes.
- Replacing bundled icons before the prototype is approved.
