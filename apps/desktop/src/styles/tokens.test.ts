import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("does not apply global color transitions to every element", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");

  expect(css).not.toContain("transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;");
});

test("moves lowered review states down responsively", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const lowered = css.match(/\.review-page--lowered \.review-page__done-content \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(lowered).toContain("transform: translateY(clamp(32px, 6vh, 64px));");
});

test("uses a dark-theme-safe compact surface for the import trigger", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const trigger = css.match(/\.library-import-menu__trigger \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(trigger).toContain("border: 1px solid var(--border-strong);");
  expect(trigger).toContain("border-radius: 8px;");
  expect(trigger).toContain("padding: 8px 10px;");
  expect(trigger).toContain("color: var(--text-primary);");
  expect(trigger).toContain("background: var(--surface-1);");
  expect(trigger).not.toContain("--button-primary");
  expect(css).toContain(".library-import-menu__trigger:hover:not(:disabled) {");
});

test("keeps the native window transparent for the sidebar glass surface", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(readFileSync(join(currentDir, "../../src-tauri/tauri.conf.json"), "utf8"));

  expect(config.app.windows[0].transparent).toBe(true);
});

test("uses a tinted glass fallback instead of a fully transparent sidebar", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");
  const sidebar = css.match(/\.app-sidebar \{([\s\S]*?)\n\}/)?.[1] ?? "";

  expect(css).toMatch(/--sidebar-bg:\s*rgb\([^)]*\/\s*\d+%\);/);
  expect(sidebar).toContain("background: var(--sidebar-bg);");
  expect(sidebar).toContain("backdrop-filter: blur(24px) saturate(1.15);");
  expect(sidebar).toContain("-webkit-backdrop-filter: blur(24px) saturate(1.15);");
});

test("uses one transparent-track scrollbar primitive across the app", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "tokens.css"), "utf8");

  expect(css).toContain("--scrollbar-track: transparent;");
  expect(css).toContain("--scrollbar-thumb:");
  expect(css).toContain(":where(*) {\n  scrollbar-width: thin;\n  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);");
  expect(css).toContain(":where(*)::-webkit-scrollbar-track {\n  background: var(--scrollbar-track);");
  expect(css).toContain(":where(*)::-webkit-scrollbar-track-piece {\n  background: var(--scrollbar-track);");
  expect(css).toContain(":where(*)::-webkit-scrollbar-thumb {");
  expect(css).not.toContain("scrollbar-width: none;");
  expect(css).not.toContain("scrollbar-color: var(--border-subtle) transparent;");
});

test("uses only public macOS view APIs to enable overlay scrollers", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const nativeApp = readFileSync(join(currentDir, "../../src-tauri/src/lib.rs"), "utf8");
  const manifest = readFileSync(join(currentDir, "../../src-tauri/Cargo.toml"), "utf8");

  expect(nativeApp).toContain("configure_macos_overlay_scrollers(&window);");
  expect(nativeApp).toContain("setScrollerStyle(NSScrollerStyle::Overlay)");
  expect(nativeApp).toContain("subviews()");
  expect(nativeApp).not.toContain("_scrollView");
  expect(manifest).toContain('objc2-app-kit = { version = "0.3", features = ["NSView", "NSScrollView", "NSScroller"] }');
});

test("uses the reusable ScrollArea for the reader's thumbnail and PDF panes", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const reader = readFileSync(join(currentDir, "../features/reader/ReaderPage.tsx"), "utf8");

  expect(reader).toContain('import { ScrollArea } from "../../components/ScrollArea";');
  expect(reader.match(/<ScrollArea/g)?.length).toBeGreaterThanOrEqual(2);
});
