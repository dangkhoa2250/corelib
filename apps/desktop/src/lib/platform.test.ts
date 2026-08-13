import { describe, expect, it } from "vitest";

import { detectDesktopPlatform, primaryShortcut } from "./platform";

describe("desktop platform", () => {
  it("detects Windows WebView2 and uses Ctrl shortcuts", () => {
    const platform = detectDesktopPlatform({
      platform: "Win32",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/151.0",
    });

    expect(platform).toBe("windows");
    expect(primaryShortcut("K", platform)).toBe("Ctrl+K");
  });

  it("preserves Command shortcuts on macOS", () => {
    const platform = detectDesktopPlatform({ platform: "MacIntel" });

    expect(platform).toBe("macos");
    expect(primaryShortcut("K", platform)).toBe("⌘K");
  });
});
