import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

test("does not apply global color transitions to every element", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(currentDir, "base.css"), "utf8");

  expect(css).not.toContain("transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;");
});

test("keeps the native window transparent for the sidebar glass surface", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(readFileSync(join(currentDir, "../../src-tauri/tauri.conf.json"), "utf8"));

  expect(config.app.windows[0].transparent).toBe(true);
});

test("uses one transparent-track scrollbar primitive across the app", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = [
    readFileSync(join(currentDir, "tokens.css"), "utf8"),
    readFileSync(join(currentDir, "base.css"), "utf8"),
  ].join("\n");

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
