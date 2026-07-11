import { useEffect, useMemo, useState } from "react";

import {
  AI_PROVIDERS,
  modelLabel,
  providerDefinition,
  type AiModel,
  type AiProviderId,
} from "../../domain/ai";
import { IconEye, IconEyeOff } from "../../app/icons";

const DEFAULT_PROVIDER_KEY = "library.ai.default-provider";
const TARGET_LANGUAGE_KEY = "library.ai.target-language";

function storage(): Storage | null {
  const candidate = typeof window !== "undefined" ? window.localStorage : null;
  return candidate && typeof candidate.getItem === "function" ? candidate : null;
}

function getPreference(key: string): string | null {
  return storage()?.getItem(key) ?? null;
}

function setPreference(key: string, value: string): void {
  storage()?.setItem(key, value);
}

function removePreference(key: string): void {
  storage()?.removeItem(key);
}

export interface SettingsPageProps {
  hasApiKey: (provider: AiProviderId) => Promise<boolean>;
  saveApiKey: (provider: AiProviderId, apiKey: string) => Promise<void>;
  clearApiKey: (provider: AiProviderId) => Promise<void>;
  listModels: (provider: AiProviderId) => Promise<AiModel[]>;
  onDefaultChange?: (provider: AiProviderId | null, model: string) => void;
}

function readProvider(): AiProviderId {
  const value = getPreference(DEFAULT_PROVIDER_KEY);
  return AI_PROVIDERS.some((provider) => provider.id === value)
    ? value as AiProviderId
    : "google-ai-studio";
}

function readDefaultProvider(): AiProviderId | null {
  const value = getPreference(DEFAULT_PROVIDER_KEY);
  return AI_PROVIDERS.some((provider) => provider.id === value) ? value as AiProviderId : null;
}

export function readAiPreference(): { provider: AiProviderId | null; model: string; targetLanguage: string } {
  return {
    provider: readDefaultProvider(),
    model: getPreference(`${DEFAULT_PROVIDER_KEY}.model`) ?? "",
    targetLanguage: getPreference(TARGET_LANGUAGE_KEY) ?? "Vietnamese",
  };
}

export function SettingsPage({ hasApiKey, saveApiKey, clearApiKey, listModels, onDefaultChange }: SettingsPageProps) {
  const [provider, setProvider] = useState<AiProviderId>(readProvider);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [connected, setConnected] = useState<Record<AiProviderId, boolean>>({
    "google-ai-studio": false,
    nvidia: false,
    openrouter: false,
    cerebras: false,
  });
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState(readAiPreference().model);
  const [defaultProvider, setDefaultProvider] = useState<AiProviderId | null>(readAiPreference().provider);
  const [targetLanguage, setTargetLanguage] = useState(readAiPreference().targetLanguage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentProvider = useMemo(() => providerDefinition(provider), [provider]);

  useEffect(() => {
    let cancelled = false;
    void hasApiKey(provider).then((value) => {
      if (!cancelled) setConnected((current) => ({ ...current, [provider]: value }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [hasApiKey, provider]);

  const loadModels = async (providerToLoad = provider) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listModels(providerToLoad);
      setModels(result);
      const savedModel = providerToLoad === defaultProvider ? readAiPreference().model : "";
      const nextModel = result.some((model) => model.id === savedModel) ? savedModel : result[0]?.id ?? "";
      setSelectedModel(nextModel);
      if (providerToLoad === defaultProvider && nextModel) {
        setPreference(`${DEFAULT_PROVIDER_KEY}.model`, nextModel);
      }
    } catch (loadError) {
      setModels([]);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      if (apiKey.trim()) {
        await saveApiKey(provider, apiKey.trim());
        setApiKey("");
      }
      setConnected((current) => ({ ...current, [provider]: true }));
      await loadModels(provider);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : String(connectError));
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    setError(null);
    try {
      await clearApiKey(provider);
      setConnected((current) => ({ ...current, [provider]: false }));
      setModels([]);
      setSelectedModel("");
      if (defaultProvider === provider) {
        setDefaultProvider(null);
        removePreference(DEFAULT_PROVIDER_KEY);
        removePreference(`${DEFAULT_PROVIDER_KEY}.model`);
        onDefaultChange?.(null, "");
      }
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setLoading(false);
    }
  };

  const handleDefaultChange = (checked: boolean) => {
    const nextProvider = checked ? provider : null;
    setDefaultProvider(nextProvider);
    if (nextProvider) {
      setPreference(DEFAULT_PROVIDER_KEY, nextProvider);
      setPreference(`${DEFAULT_PROVIDER_KEY}.model`, selectedModel);
    } else {
      removePreference(DEFAULT_PROVIDER_KEY);
      removePreference(`${DEFAULT_PROVIDER_KEY}.model`);
    }
    onDefaultChange?.(nextProvider, checked ? selectedModel : "");
  };

  return (
    <main className="settings-page">
      <header className="settings-page__header">
        <div>
          <p className="settings-page__eyebrow">Preferences</p>
          <h1>Settings</h1>
          <p>Connect an AI provider to translate selected text into flashcards.</p>
        </div>
      </header>

      <section className="settings-page__section" aria-labelledby="ai-provider-heading">
        <div className="settings-page__section-heading">
          <div>
            <h2 id="ai-provider-heading">AI provider</h2>
            <p>Only the API key is required. Provider endpoints are configured automatically.</p>
          </div>
          {defaultProvider ? <span className="settings-page__default-badge">Default: {providerDefinition(defaultProvider).name}</span> : null}
        </div>

        <label className="settings-page__field">
          <span>Provider</span>
          <select aria-label="AI provider" value={provider} onChange={(event) => {
            setProvider(event.target.value as AiProviderId);
            setModels([]);
            setError(null);
          }}>
            {AI_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <p className="settings-page__description">{currentProvider.description}</p>

        <label className="settings-page__field">
          <span>API key</span>
          <span className="settings-page__secret-input">
            <input
              aria-label="API key"
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={connected[provider] ? "Saved securely — enter a new key to replace it" : "Paste API key"}
              style={{ color: "#1d1d1f" }}
              type={showApiKey ? "text" : "password"}
              value={apiKey}
            />
            <button
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
              className="settings-page__secret-toggle"
              onClick={() => setShowApiKey((visible) => !visible)}
              type="button"
            >
              {showApiKey ? <IconEyeOff /> : <IconEye />}
            </button>
          </span>
        </label>

        <div className="settings-page__actions">
          <button disabled={loading || (!connected[provider] && !apiKey.trim())} onClick={() => void handleConnect()} type="button">
            {loading ? "Connecting…" : connected[provider] ? "Refresh models" : "Connect"}
          </button>
          {connected[provider] ? <button className="settings-page__secondary-button" disabled={loading} onClick={() => void handleClear()} type="button">Remove key</button> : null}
        </div>

        <label className="settings-page__field">
          <span>Model</span>
          <select aria-label="AI model" disabled={loading || models.length === 0} value={selectedModel} onChange={(event) => {
            const nextModel = event.target.value;
            setSelectedModel(nextModel);
            if (defaultProvider === provider) {
              setPreference(`${DEFAULT_PROVIDER_KEY}.model`, nextModel);
              onDefaultChange?.(provider, nextModel);
            }
          }}>
            <option value="">{models.length ? "Choose a model" : "Connect to load models"}</option>
            {models.map((model) => <option key={model.id} value={model.id}>{modelLabel(model)}</option>)}
          </select>
        </label>

        <label className="settings-page__checkbox">
          <input checked={defaultProvider === provider && Boolean(selectedModel)} disabled={!selectedModel} onChange={(event) => handleDefaultChange(event.target.checked)} type="checkbox" />
          <span>Use this provider and model for translation</span>
        </label>

        <label className="settings-page__field">
          <span>Translate to</span>
          <input aria-label="Target language" onChange={(event) => {
            setTargetLanguage(event.target.value);
            setPreference(TARGET_LANGUAGE_KEY, event.target.value);
          }} type="text" value={targetLanguage} />
        </label>

        {error ? <p className="settings-page__error" role="alert">{error}</p> : null}
        <p className="settings-page__privacy">API keys are stored in the device keychain and are never saved in cards.</p>
      </section>
    </main>
  );
}
