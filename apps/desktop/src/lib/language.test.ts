import { describe, expect, test } from "vitest";
import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  test("returns zh-CN for Chinese text", () => {
    expect(detectLanguage("你好世界")).toBe("zh-CN");
  });

  test("returns ja-JP for Japanese text with hiragana", () => {
    expect(detectLanguage("こんにちは世界")).toBe("ja-JP");
  });

  test("returns ko-KR for Korean text", () => {
    expect(detectLanguage("안녕하세요")).toBe("ko-KR");
  });

  test("returns ru-RU for Cyrillic text", () => {
    expect(detectLanguage("Привет мир")).toBe("ru-RU");
  });

  test("returns ar-SA for Arabic text", () => {
    expect(detectLanguage("مرحبا بالعالم")).toBe("ar-SA");
  });

  test("returns undefined for Latin-only text", () => {
    expect(detectLanguage("Hello world")).toBeUndefined();
  });

  test("returns undefined for empty or whitespace text", () => {
    expect(detectLanguage("")).toBeUndefined();
    expect(detectLanguage("   ")).toBeUndefined();
  });

  test("handles mixed content with dominant script", () => {
    // Mostly Chinese with some Latin
    expect(detectLanguage("你好世界 Hello")).toBe("zh-CN");
  });
});
