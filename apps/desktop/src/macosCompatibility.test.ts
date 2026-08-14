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
    expect(workflow).toContain("Verify macOS 12 Universal compatibility");
    expect(workflow).toContain("LSMinimumSystemVersion");
    expect(workflow).toContain('expected_archs="x86_64 arm64"');
    expect(workflow).toContain("otool -arch x86_64 -l");
    expect(workflow).toContain("otool -arch arm64 -l");
  });
});
