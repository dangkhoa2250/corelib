import { describe, expect, it } from "vitest";
import { detectLanguage } from "./languageDetector";

describe("languageDetector", () => {
  it("returns null for empty or whitespace text", () => {
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage("   ")).toBeNull();
  });

  it("detects Japanese script", () => {
    expect(detectLanguage("こんにちは")).toBe("ja");
    expect(detectLanguage("日本語を勉強しています")).toBe("ja");
  });

  it("detects Korean script", () => {
    expect(detectLanguage("안녕하세요")).toBe("ko");
  });

  it("detects Thai script", () => {
    expect(detectLanguage("สวัสดีครับ")).toBe("th");
  });

  it("detects Arabic script", () => {
    expect(detectLanguage("مرحبا بك")).toBe("ar");
  });

  it("detects Hebrew script", () => {
    expect(detectLanguage("שלום לך")).toBe("he");
  });

  it("detects Greek script", () => {
    expect(detectLanguage("Γειά σου κόσμε")).toBe("el");
  });

  it("detects Chinese script (Han only)", () => {
    expect(detectLanguage("你好世界")).toBe("zh");
    expect(detectLanguage("我是学生")).toBe("zh");
  });

  it("detects Russian and Ukrainian scripts (Cyrillic)", () => {
    expect(detectLanguage("Привет мир")).toBe("ru"); // Russian
    expect(detectLanguage("Привіт світ")).toBe("uk"); // Ukrainian (has 'і')
  });

  it("detects Vietnamese (with diacritics)", () => {
    expect(detectLanguage("Xin chào thế giới")).toBe("vi");
    expect(detectLanguage("học tiếng anh")).toBe("vi");
  });

  it("detects Latin languages using stop words", () => {
    // English
    expect(detectLanguage("The quick brown fox jumps over the lazy dog")).toBe("en");
    // French
    expect(detectLanguage("C'est la vie et le chat est sous la table")).toBe("fr");
    // German
    expect(detectLanguage("Der Hund und das Kind sind in dem Garten")).toBe("de");
    // Spanish
    expect(detectLanguage("El gato negro come un pez en la cocina")).toBe("es");
  });

  it("falls back to English for plain Latin text without clear cues", () => {
    expect(detectLanguage("Hello world")).toBe("en");
    expect(detectLanguage("courage")).toBe("en");
  });
});
