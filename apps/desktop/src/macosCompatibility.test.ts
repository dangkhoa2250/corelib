import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("macOS compatibility floor", () => {
  it("targets macOS 12 in the Tauri config and Rust linker flags", () => {
    const tauriConfig = JSON.parse(
      readSource("../src-tauri/tauri.macos.conf.json"),
    );
    expect(tauriConfig.bundle.macOS.minimumSystemVersion).toBe("12.0");

    const buildRs = readSource("../src-tauri/build.rs");
    expect(buildRs).toContain('const MACOS_DEPLOYMENT_TARGET: &str = "12.0"');
    expect(buildRs).toContain(
      "-mmacosx-version-min={MACOS_DEPLOYMENT_TARGET}",
    );
    expect(buildRs).toContain("SwiftLinker::new(MACOS_DEPLOYMENT_TARGET)");
  });

  it("builds the AppleTranslation Swift package for macOS 12", () => {
    const packageSwift = readSource(
      "../src-tauri/swift/AppleTranslation/Package.swift",
    );
    expect(packageSwift).toContain("platforms: [.macOS(.v12)]");
  });

  it("keeps Apple Translation runtime availability gated to macOS 15", () => {
    const appleTranslation = readSource(
      "../src-tauri/swift/AppleTranslation/Sources/AppleTranslation/AppleTranslation.swift",
    );
    expect(appleTranslation).toContain("@available(macOS 15.0, *)");

    const availableGuards = appleTranslation.match(
      /#available\(macOS 15\.0, \*\)/g,
    );
    expect(availableGuards?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("verifies macOS 12 universal compatibility on the release workflow artifact", () => {
    const workflow = readSource("../../../.github/workflows/release-desktop.yml");
    const verifier = readSource("../scripts/verify-macos-universal.mjs");
    expect(workflow).toContain("Verify macOS 12 Universal compatibility");
    expect(workflow).toContain('node scripts/verify-macos-universal.mjs "$app"');
    expect(verifier).toContain("LSMinimumSystemVersion");
    expect(verifier).toContain('"lipo"');
    expect(verifier).toContain('"otool"');
    expect(verifier).toContain("minos");
  });

  it("ensures Promise.withResolvers polyfill and pdfjs legacy bundle aliases for WebKit/Safari on older macOS", () => {
    const viteConfig = readSource("../vite.config.ts");
    const indexHtml = readSource("../index.html");
    const mainTsx = readSource("./main.tsx");
    const polyfills = readSource("./lib/polyfills.ts");

    expect(viteConfig).toContain("pdfjs-dist/legacy/build/pdf.mjs");
    expect(viteConfig).toContain("pdfjs-dist/legacy/build/pdf.worker.mjs");
    expect(indexHtml).toContain("Promise.withResolvers");
    expect(mainTsx).toContain('import "./lib/polyfills";');
    expect(polyfills).toContain("Promise.withResolvers");
  });
});
