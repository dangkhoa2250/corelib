import { AI_PROVIDERS, type AiProviderId } from "./ai";

export type TranslationEngineId =
  | "apple-translation"
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
): TranslationEngineId | null {
  return appleAvailable ? "apple-translation" : null;
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
  if (value === "apple-translation" || value === "google-translation") return value;
  if (!value?.startsWith("ai:")) return null;
  const candidate = value as TranslationEngineId;
  return parseAiEngineId(candidate) ? candidate : null;
}

export function readTranslationSelection(
  storage: Pick<Storage, "getItem" | "setItem">,
  appleAvailable: boolean,
): TranslationEngineId | null {
  const saved = validEngineId(storage.getItem(TRANSLATION_ENGINE_KEY));
  if (saved) return saved;

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

  return defaultTranslationSelection(appleAvailable);
}
