export type AiProviderId = "google-ai-studio" | "google-translation" | "nvidia" | "openrouter" | "cerebras";

export interface AiProviderDefinition {
  id: AiProviderId;
  name: string;
  description: string;
}

export interface AiModel {
  id: string;
  name: string;
}

export interface AiProviderState {
  provider: AiProviderId;
  hasApiKey: boolean;
  models: AiModel[];
  selectedModel: string;
}

export interface AiPreferences {
  defaultProvider: AiProviderId | null;
  targetLanguage: string;
}

export interface TranslationResult {
  translation: string;
}

export const AI_PROVIDERS: AiProviderDefinition[] = [
  {
    id: "google-ai-studio",
    name: "Google AI Studio",
    description: "Gemini API with automatic model discovery.",
  },
  {
    id: "google-translation",
    name: "Google Cloud Translation",
    description: "Google Cloud Translation NMT API.",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    description: "NVIDIA-hosted OpenAI-compatible inference endpoints.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "One key for many hosted models and free endpoints.",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    description: "Fast inference with a free developer tier.",
  },
];

export function providerDefinition(provider: AiProviderId): AiProviderDefinition {
  return AI_PROVIDERS.find((item) => item.id === provider) ?? AI_PROVIDERS[0];
}

export function modelLabel(model: AiModel): string {
  return model.name === model.id ? model.id : `${model.name} (${model.id})`;
}

export function maskedApiKey(hasApiKey: boolean): string {
  return hasApiKey ? "••••••••••••••••" : "";
}
