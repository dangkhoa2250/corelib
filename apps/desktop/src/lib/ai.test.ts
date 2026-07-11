import { describe, expect, it, vi } from "vitest";

import {
  appleTranslationAvailable,
  listAiModels,
  saveAiApiKey,
  translateText,
  translateWithAi,
} from "./ai";

describe("AI bridge", () => {
  it("stores a provider API key through the native command", async () => {
    const call = vi.fn().mockResolvedValue(undefined);
    await saveAiApiKey("nvidia", "secret", call);
    expect(call).toHaveBeenCalledWith("save_ai_api_key", { provider: "nvidia", apiKey: "secret" });
  });

  it("lists models for a provider", async () => {
    const call = vi.fn().mockResolvedValue([{ id: "model-1", name: "Model 1" }]);
    await expect(listAiModels("openrouter", call)).resolves.toEqual([{ id: "model-1", name: "Model 1" }]);
    expect(call).toHaveBeenCalledWith("list_ai_models", { provider: "openrouter" });
  });

  it("translates using the selected provider and model", async () => {
    const call = vi.fn().mockResolvedValue({ translation: "Xin chào" });
    await translateWithAi("google-ai-studio", "gemini-flash", "Hello", "Vietnamese", call);
    expect(call).toHaveBeenCalledWith("translate_with_ai", {
      provider: "google-ai-studio",
      model: "gemini-flash",
      text: "Hello",
      targetLanguage: "Vietnamese",
    });
  });

  it("translates using a unified engine ID", async () => {
    const call = vi.fn().mockResolvedValue({ translation: "Xin chào" });
    await translateText("apple-translation", "Hello", "Vietnamese", call);
    expect(call).toHaveBeenCalledWith("translate_text", {
      engineId: "apple-translation",
      text: "Hello",
      targetLanguage: "Vietnamese",
    });
  });

  it("checks Apple Translation availability through Tauri", async () => {
    const call = vi.fn().mockResolvedValue(true);
    await expect(appleTranslationAvailable(call)).resolves.toBe(true);
    expect(call).toHaveBeenCalledWith("apple_translation_available");
  });
});
