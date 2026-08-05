import { describe, expect, it, vi } from "vitest";

import {
  translateWithWindowsOnDevice,
  windowsOnDeviceTranslationAvailable,
  type WindowsTranslationRuntime,
} from "./windowsTranslation";

describe("Windows on-device translation", () => {
  it("feature-detects the WebView2 Translator API", () => {
    expect(windowsOnDeviceTranslationAvailable({})).toBe(false);
    expect(windowsOnDeviceTranslationAvailable({
      Translator: {
        availability: vi.fn(),
        create: vi.fn(),
      },
    })).toBe(true);
  });

  it("downloads or loads a language-pair model and translates locally", async () => {
    const destroy = vi.fn();
    const translate = vi.fn().mockResolvedValue("こんにちは");
    const runtime: WindowsTranslationRuntime = {
      Translator: {
        availability: vi.fn().mockResolvedValue("downloadable"),
        create: vi.fn().mockResolvedValue({ translate, destroy }),
      },
    };

    await expect(translateWithWindowsOnDevice("Hello", "Japanese", runtime)).resolves.toEqual({
      translation: "こんにちは",
    });
    expect(runtime.Translator?.create).toHaveBeenCalledWith({
      sourceLanguage: "en",
      targetLanguage: "ja",
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("rejects unsupported language pairs without invoking a cloud fallback", async () => {
    const runtime: WindowsTranslationRuntime = {
      Translator: {
        availability: vi.fn().mockResolvedValue("unavailable"),
        create: vi.fn(),
      },
    };

    await expect(translateWithWindowsOnDevice("Hello", "Japanese", runtime))
      .rejects.toThrow("unsupported_language_pair");
    expect(runtime.Translator?.create).not.toHaveBeenCalled();
  });
});
