import { describe, expect, it } from "vitest";

import {
  aiEngineId,
  builtinTranslationEngines,
  defaultTranslationSelection,
  parseAiEngineId,
  readTranslationSelection,
  targetLanguageCode,
  TRANSLATION_ENGINE_KEY,
} from "./translation";

function memoryStorage(entries: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("translation engines", () => {
  it("keeps platform-native engines ahead of Google Cloud Translation", () => {
    expect(builtinTranslationEngines(true).map((engine) => engine.id)).toEqual([
      "apple-translation",
      "windows-translation",
      "google-translation",
    ]);
  });

  it("defaults to Apple only when the native framework is available", () => {
    expect(defaultTranslationSelection(true)).toBe("apple-translation");
    expect(defaultTranslationSelection(false)).toBeNull();
    expect(defaultTranslationSelection(false, true)).toBe("windows-translation");
  });

  it("maps settings language names to BCP 47 codes", () => {
    expect(targetLanguageCode("Japanese")).toBe("ja");
    expect(targetLanguageCode("vi-VN")).toBe("vi");
    expect(targetLanguageCode("unknown")).toBeNull();
  });

  it("round-trips AI engine IDs whose model names contain punctuation", () => {
    const id = aiEngineId("openrouter", "vendor/model:free");
    expect(parseAiEngineId(id)).toEqual({
      provider: "openrouter",
      model: "vendor/model:free",
    });
  });

  it("preserves a valid saved engine selection", () => {
    const storage = memoryStorage({ [TRANSLATION_ENGINE_KEY]: "google-translation" });
    expect(readTranslationSelection(storage, true)).toBe("google-translation");
  });

  it("uses a saved native engine only on a runtime that supports it", () => {
    const storage = memoryStorage({ [TRANSLATION_ENGINE_KEY]: "windows-translation" });
    expect(readTranslationSelection(storage, false, true)).toBe("windows-translation");
    expect(readTranslationSelection(storage, false, false)).toBeNull();
  });

  it("migrates a legacy AI provider and model selection", () => {
    const storage = memoryStorage({
      "library.ai.default-provider": "google-ai-studio",
      "library.ai.default-provider.model": "gemini-2.5-flash",
    });

    expect(readTranslationSelection(storage, true)).toBe(
      "ai:google-ai-studio:gemini-2.5-flash",
    );
    expect(storage.getItem(TRANSLATION_ENGINE_KEY)).toBe(
      "ai:google-ai-studio:gemini-2.5-flash",
    );
  });
});
