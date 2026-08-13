import { AI_PROVIDERS, type AiProviderId } from "./ai";

export type TranslationEngineId =
  | "apple-translation"
  | "windows-translation"
  | "google-translation"
  | `ai:${AiProviderId}:${string}`;

export interface TranslationEngine {
  id: TranslationEngineId;
  name: string;
  description: string;
  source: "native" | "translation-api" | "ai";
  provider: AiProviderId | null;
  model: string | null;
  available: boolean;
}

export const TRANSLATION_ENGINE_KEY = "library.translation.engine";
const LEGACY_PROVIDER_KEY = "library.ai.default-provider";
const LEGACY_MODEL_KEY = `${LEGACY_PROVIDER_KEY}.model`;

export function builtinTranslationEngines(
  appleAvailable: boolean,
  googleConfigured = true,
  windowsAvailable = false,
): TranslationEngine[] {
  return [
    {
      id: "apple-translation",
      name: "Apple Translation",
      description: "On-device · Fast · No API key",
      source: "native",
      provider: null,
      model: null,
      available: appleAvailable,
    },
    {
      id: "windows-translation",
      name: "Windows Translation",
      description: "On-device · Private · No API key",
      source: "native",
      provider: null,
      model: null,
      available: windowsAvailable,
    },
    {
      id: "google-translation",
      name: "Google Cloud Translation",
      description: "Cloud NMT · API key required",
      source: "translation-api",
      provider: "google-translation",
      model: "nmt",
      available: googleConfigured,
    },
  ];
}

export function defaultTranslationSelection(
  appleAvailable: boolean,
  windowsAvailable = false,
): TranslationEngineId | null {
  if (appleAvailable) return "apple-translation";
  if (windowsAvailable) return "windows-translation";
  return null;
}

export function targetLanguageCode(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const codes: Record<string, string> = {
    arabic: "ar", ar: "ar",
    chinese: "zh", "chinese (simplified)": "zh", zh: "zh", "zh-cn": "zh",
    "chinese (traditional)": "zh-TW", "zh-tw": "zh-TW",
    dutch: "nl", nl: "nl",
    english: "en", en: "en", "en-us": "en", "en-gb": "en",
    french: "fr", fr: "fr",
    german: "de", de: "de",
    hindi: "hi", hi: "hi",
    indonesian: "id", id: "id",
    italian: "it", it: "it",
    japanese: "ja", ja: "ja",
    korean: "ko", ko: "ko",
    polish: "pl", pl: "pl",
    portuguese: "pt", pt: "pt", "pt-br": "pt",
    russian: "ru", ru: "ru",
    spanish: "es", es: "es",
    thai: "th", th: "th",
    turkish: "tr", tr: "tr",
    ukrainian: "uk", uk: "uk",
    vietnamese: "vi", vi: "vi", "vi-vn": "vi",
  };
  return codes[normalized] ?? null;
}

export function aiEngineId(
  provider: AiProviderId,
  model: string,
): TranslationEngineId {
  return `ai:${provider}:${encodeURIComponent(model)}`;
}

export function parseAiEngineId(
  id: TranslationEngineId,
): { provider: AiProviderId; model: string } | null {
  if (!id.startsWith("ai:")) return null;
  const match = /^ai:([^:]+):(.+)$/.exec(id);
  if (!match) return null;
  const provider = match[1] as AiProviderId;
  if (!AI_PROVIDERS.some((candidate) => candidate.id === provider)) return null;
  try {
    const model = decodeURIComponent(match[2]);
    return model ? { provider, model } : null;
  } catch {
    return null;
  }
}

function validEngineId(value: string | null): TranslationEngineId | null {
  if (value === "apple-translation" || value === "windows-translation" || value === "google-translation") return value;
  if (!value?.startsWith("ai:")) return null;
  const candidate = value as TranslationEngineId;
  return parseAiEngineId(candidate) ? candidate : null;
}

export function readTranslationSelection(
  storage: Pick<Storage, "getItem" | "setItem">,
  appleAvailable: boolean,
  windowsAvailable = false,
): TranslationEngineId | null {
  const saved = validEngineId(storage.getItem(TRANSLATION_ENGINE_KEY));
  if (saved === "apple-translation" && appleAvailable) return saved;
  if (saved === "windows-translation" && windowsAvailable) return saved;
  if (saved && saved !== "apple-translation" && saved !== "windows-translation") return saved;

  const legacyProvider = storage.getItem(LEGACY_PROVIDER_KEY) as AiProviderId | null;
  const legacyModel = storage.getItem(LEGACY_MODEL_KEY)?.trim();
  if (
    legacyProvider
    && legacyProvider !== "google-translation"
    && AI_PROVIDERS.some((candidate) => candidate.id === legacyProvider)
    && legacyModel
  ) {
    const migrated = aiEngineId(legacyProvider, legacyModel);
    storage.setItem(TRANSLATION_ENGINE_KEY, migrated);
    return migrated;
  }

  return defaultTranslationSelection(appleAvailable, windowsAvailable);
}
