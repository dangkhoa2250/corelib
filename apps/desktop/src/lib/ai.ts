import { invoke } from "@tauri-apps/api/core";

import type { AiModel, AiProviderId, TranslationResult } from "../domain/ai";
import type { TranslationEngineId } from "../domain/translation";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function saveAiApiKey(provider: AiProviderId, apiKey: string, call: Invoke = invoke): Promise<void> {
  return call("save_ai_api_key", { provider, apiKey });
}

export function clearAiApiKey(provider: AiProviderId, call: Invoke = invoke): Promise<void> {
  return call("clear_ai_api_key", { provider });
}

export function hasAiApiKey(provider: AiProviderId, call: Invoke = invoke): Promise<boolean> {
  return call("has_ai_api_key", { provider });
}

export function listAiModels(provider: AiProviderId, call: Invoke = invoke): Promise<AiModel[]> {
  return call("list_ai_models", { provider });
}

export function translateWithAi(
  provider: AiProviderId,
  model: string,
  text: string,
  targetLanguage: string,
  call: Invoke = invoke,
): Promise<TranslationResult> {
  return call("translate_with_ai", { provider, model, text, targetLanguage });
}

export function translateText(
  engineId: TranslationEngineId,
  text: string,
  targetLanguage: string,
  sourceLanguage?: string | null | Invoke,
  call: Invoke = invoke,
): Promise<TranslationResult> {
  const actualCall: Invoke = typeof sourceLanguage === "function" ? sourceLanguage : call;
  const actualSourceLanguage: string | null = typeof sourceLanguage === "string" ? sourceLanguage : null;
  return actualCall("translate_text", {
    engineId,
    text,
    targetLanguage,
    sourceLanguage: actualSourceLanguage,
  });
}

export function appleTranslationAvailable(call: Invoke = invoke): Promise<boolean> {
  return call("apple_translation_available");
}
