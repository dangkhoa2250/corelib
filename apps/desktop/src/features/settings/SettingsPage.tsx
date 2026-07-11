import { useEffect, useMemo, useRef, useState } from "react";

import {
  AI_PROVIDERS,
  providerDefinition,
  type AiModel,
  type AiProviderId,
} from "../../domain/ai";
import {
  aiEngineId,
  builtinTranslationEngines,
  parseAiEngineId,
  readTranslationSelection,
  TRANSLATION_ENGINE_KEY,
  type TranslationEngineId,
} from "../../domain/translation";
import { IconEye, IconEyeOff } from "../../app/icons";
import { IconArrowLeft, IconMemora, IconSearch, IconAppearance } from "../../app/icons";
import { useTheme } from "../../contexts/ThemeContext";
import { Combobox } from "../../components/Combobox";

const DEFAULT_PROVIDER_KEY = "library.ai.default-provider";
const TARGET_LANGUAGE_KEY = "library.ai.target-language";
const defaultAppleTranslationAvailable = async () => true;

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
  appleTranslationAvailable?: () => Promise<boolean>;
  onDefaultChange?: (engineId: TranslationEngineId | null) => void;
  onBack?: () => void;
}

function readProvider(): AiProviderId {
  const value = getPreference(DEFAULT_PROVIDER_KEY);
  return AI_PROVIDERS.some((provider) => provider.id === value)
    ? value as AiProviderId
    : "google-ai-studio";
}

export function readTranslationPreference(): { engineId: TranslationEngineId | null; targetLanguage: string } {
  const candidate = storage();
  return {
    engineId: candidate ? readTranslationSelection(candidate, true) : "apple-translation",
    targetLanguage: getPreference(TARGET_LANGUAGE_KEY) ?? "Vietnamese",
  };
}

export function SettingsPage({ hasApiKey, saveApiKey, clearApiKey, listModels, appleTranslationAvailable = defaultAppleTranslationAvailable, onDefaultChange, onBack }: SettingsPageProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [provider, setProvider] = useState<AiProviderId>(readProvider);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showProviderEditor, setShowProviderEditor] = useState(false);
  const [connected, setConnected] = useState<Record<AiProviderId, boolean>>({
    "google-ai-studio": false,
    "google-translation": false,
    nvidia: false,
    openrouter: false,
    cerebras: false,
  });
  const [modelsByProvider, setModelsByProvider] = useState<Partial<Record<AiProviderId, AiModel[]>>>({});
  const initialPreference = readTranslationPreference();
  const [selectedEngineId, setSelectedEngineId] = useState<TranslationEngineId | null>(initialPreference.engineId);
  const selectedEngineIdRef = useRef(selectedEngineId);
  selectedEngineIdRef.current = selectedEngineId;
  const [appleAvailable, setAppleAvailable] = useState(true);
  const [targetLanguage, setTargetLanguage] = useState(initialPreference.targetLanguage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modelSearch, setModelSearch] = useState(
    initialPreference.engineId === "apple-translation"
      ? "Apple Translation"
      : initialPreference.engineId === "google-translation"
        ? "Google Cloud Translation"
        : "",
  );
  const [deferredModelSearch, setDeferredModelSearch] = useState("");
  const [modelSelectionMade, setModelSelectionMade] = useState(
    initialPreference.engineId === "apple-translation" || initialPreference.engineId === "google-translation",
  );
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(-1);
  const currentProvider = useMemo(() => providerDefinition(provider), [provider]);
  const showAppearanceSettings = searchQuery.trim().toLowerCase().includes("appearance");
  const showModelSettings = "model provider translate".includes(searchQuery.trim().toLowerCase());
  const connectedProviders = AI_PROVIDERS.filter((item) => connected[item.id]);
  const searchableModels = [
    ...builtinTranslationEngines(appleAvailable, connected["google-translation"])
      .filter((engine) => engine.available)
      .map((engine) => ({
        engineId: engine.id,
        id: engine.model ?? engine.id,
        name: engine.name,
        provider: engine.provider,
        description: engine.description,
      })),
    ...connectedProviders
      .filter((item) => item.id !== "google-translation")
      .flatMap((item) => (modelsByProvider[item.id] ?? []).map((model) => ({
        ...model,
        engineId: aiEngineId(item.id, model.id),
        provider: item.id as AiProviderId | null,
        description: providerDefinition(item.id).name,
      }))),
  ];
  const filteredModels = searchableModels.filter((model) => `${model.name} ${model.description}`.toLowerCase().includes(deferredModelSearch.trim().toLowerCase()));
  const keyboardModels = searchableModels.filter((model) => `${model.name} ${model.description}`.toLowerCase().includes(modelSearch.trim().toLowerCase()));

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDeferredModelSearch(modelSearch), 250);
    return () => window.clearTimeout(timeoutId);
  }, [modelSearch]);

  useEffect(() => {
    let cancelled = false;
    const disableAppleTranslation = () => {
      setAppleAvailable(false);
      if (selectedEngineIdRef.current !== "apple-translation") return;
      selectedEngineIdRef.current = null;
      setSelectedEngineId(null);
      setModelSearch("");
      removePreference(TRANSLATION_ENGINE_KEY);
      onDefaultChange?.(null);
    };
    void appleTranslationAvailable()
      .then((available) => {
        if (cancelled) return;
        if (available) setAppleAvailable(true);
        else disableAppleTranslation();
      })
      .catch(() => {
        if (!cancelled) disableAppleTranslation();
      });
    return () => { cancelled = true; };
  }, [appleTranslationAvailable]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(AI_PROVIDERS.map(async (item) => [item.id, await hasApiKey(item.id)] as const))
      .then((entries) => {
        if (cancelled) return;
        setConnected(Object.fromEntries(entries) as Record<AiProviderId, boolean>);
        void Promise.all(entries.filter(([, hasKey]) => hasKey).map(([id]) => loadModels(id)));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [hasApiKey]);

  const loadModels = async (providerToLoad = provider) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listModels(providerToLoad);
      setModelsByProvider((current) => ({ ...current, [providerToLoad]: result }));
      const savedEngine = readTranslationPreference().engineId;
      const savedAi = savedEngine ? parseAiEngineId(savedEngine) : null;
      const savedModel = savedAi?.provider === providerToLoad
        ? savedAi.model
        : savedEngine === "google-translation" && providerToLoad === "google-translation"
          ? "nmt"
          : "";
      const savedModelDefinition = result.find((model) => model.id === savedModel);
      if (savedModelDefinition) {
        setModelSearch(savedModelDefinition.name);
        setModelSelectionMade(true);
        setHighlightedModelIndex(-1);
      }
    } catch (loadError) {
      setModelsByProvider((current) => ({ ...current, [providerToLoad]: [] }));
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
      setModelsByProvider((current) => ({ ...current, [provider]: [] }));
      setApiKey("");
      setShowApiKey(false);
      const selectedAi = selectedEngineId ? parseAiEngineId(selectedEngineId) : null;
      if (selectedEngineId === "google-translation" && provider === "google-translation"
        || selectedAi?.provider === provider) {
        setSelectedEngineId(null);
        removePreference(DEFAULT_PROVIDER_KEY);
        removePreference(`${DEFAULT_PROVIDER_KEY}.model`);
        removePreference(TRANSLATION_ENGINE_KEY);
        setModelSearch("");
        onDefaultChange?.(null);
      }
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setLoading(false);
    }
  };

  const handleAddProvider = () => {
    const nextProvider = AI_PROVIDERS.find((item) => !connected[item.id])?.id ?? AI_PROVIDERS[0].id;
    setProvider(nextProvider);
    setApiKey("");
    setShowApiKey(false);
    setError(null);
    setShowProviderEditor(true);
  };

  const handleManageProvider = (providerId: AiProviderId) => {
    setProvider(providerId);
    setApiKey("");
    setShowApiKey(false);
    setError(null);
    setShowProviderEditor(true);
  };

  const selectModel = (model: (typeof filteredModels)[number]) => {
    setSelectedEngineId(model.engineId);
    setPreference(TRANSLATION_ENGINE_KEY, model.engineId);
    const aiSelection = parseAiEngineId(model.engineId);
    if (aiSelection) {
      setPreference(DEFAULT_PROVIDER_KEY, aiSelection.provider);
      setPreference(`${DEFAULT_PROVIDER_KEY}.model`, aiSelection.model);
    } else {
      removePreference(DEFAULT_PROVIDER_KEY);
      removePreference(`${DEFAULT_PROVIDER_KEY}.model`);
    }
    onDefaultChange?.(model.engineId);
    setModelSearch(model.name);
    setModelSelectionMade(true);
    setHighlightedModelIndex(-1);
  };

  return (
    <main className="settings-page">
      <aside className="settings-page__sidebar" aria-label="Settings navigation">
        <button className="settings-page__back" onClick={onBack} type="button">
          <IconArrowLeft />
          <span>Back to app</span>
        </button>
        <label className="settings-page__search">
          <IconSearch />
          <input aria-label="Search settings" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search settings…" value={searchQuery} />
        </label>
        <p className="settings-page__nav-label">General</p>
        <button 
          className={`settings-page__nav-item ${searchQuery.trim().toLowerCase().includes("appearance") ? "is-active" : ""}`}
          onClick={() => setSearchQuery("appearance")}
          type="button"
        >
          <span className="settings-page__nav-icon"><IconAppearance /></span>
          Appearance
        </button>
        <p className="settings-page__nav-label">Models</p>
        <button className="settings-page__nav-item is-active" type="button">
          <span className="settings-page__nav-icon"><IconMemora /></span>
          Model
        </button>
      </aside>

      <section className="settings-page__main">
        <header className="settings-page__header">
          <p className="settings-page__eyebrow">Models</p>
          <h1>Model</h1>
          <p>Choose the providers and model used by Memora.</p>
        </header>

        {showAppearanceSettings ? (
        <>
        <section className="settings-page__section" aria-labelledby="appearance-heading">
          <div className="settings-page__section-heading">
            <div>
              <h2 id="appearance-heading">Appearance</h2>
              <p>Customize how Memora looks.</p>
            </div>
          </div>
          
          <label className="settings-page__field">
            <span>Theme</span>
            <Combobox
              value={theme}
              onChange={(v) => setTheme(v as "light" | "dark" | "system")}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              searchPlaceholder="Search themes..."
              ariaLabel="Theme selection"
            />
          </label>
          
          <p className="settings-page__description">
            {theme === "system" 
              ? `Memora will match your system theme (${resolvedTheme}).`
              : `Memora is in ${theme} mode.`
            }
          </p>
        </section>
        </>
        ) : showModelSettings ? <>
        <section className="settings-page__section" aria-labelledby="providers-heading">
          <div className="settings-page__section-heading">
            <div>
              <h2 id="providers-heading">Providers</h2>
              <p>Add multiple providers and manage their API keys.</p>
            </div>
            <button className="settings-page__add-button" onClick={handleAddProvider} type="button">+ Add provider</button>
          </div>

          <div className="settings-page__provider-list" aria-label="Connected providers">
            {connectedProviders.length > 0 ? connectedProviders.map((item) => (
              <div className={`settings-page__provider-row ${item.id === provider ? "is-selected" : ""}`} key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                </div>
                <div className="settings-page__provider-row-actions">
                  <button onClick={() => handleManageProvider(item.id)} type="button">Manage</button>
                </div>
              </div>
            )) : <p className="settings-page__provider-empty">No providers connected yet.</p>}
          </div>

        {showProviderEditor ? <div aria-label="Provider settings" aria-modal="true" className="settings-page__modal-backdrop" role="dialog">
          <div className="settings-page__modal">
            <div className="settings-page__modal-header">
              <h2>Provider settings</h2>
              <button aria-label="Close provider settings" className="settings-page__modal-close" onClick={() => setShowProviderEditor(false)} type="button">×</button>
            </div>
          <div className="settings-page__provider-editor">
        <label className="settings-page__field">
          <span>Provider</span>
          <Combobox
            value={provider}
            onChange={(v) => {
              setProvider(v as AiProviderId);
              setApiKey("");
              setShowApiKey(false);
              setError(null);
            }}
            options={AI_PROVIDERS.map((item) => ({ value: item.id, label: item.name }))}
            searchPlaceholder="Search providers..."
            ariaLabel="AI provider"
          />
        </label>

        <p className="settings-page__description">{currentProvider.description}</p>

        <label className="settings-page__field">
          <span>API key</span>
          <span className="settings-page__secret-input">
            <input
              aria-label="API key"
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={connected[provider] ? "••••••••••••••••" : "Paste API key"}
              style={{ color: "var(--text-primary)" }}
              type={showApiKey ? "text" : "password"}
              value={apiKey}
            />
            {apiKey ? (
              <button
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                className="settings-page__secret-toggle"
                onClick={() => setShowApiKey((visible) => !visible)}
                type="button"
              >
                {showApiKey ? <IconEyeOff /> : <IconEye />}
              </button>
            ) : null}
          </span>
        </label>

        <div className="settings-page__actions">
          <button disabled={loading || (!connected[provider] && !apiKey.trim())} onClick={() => void handleConnect()} type="button">
            {loading ? "Connecting…" : connected[provider] ? "Refresh models" : "Connect"}
          </button>
          {connected[provider] ? <button className="settings-page__secondary-button" disabled={loading} onClick={() => void handleClear()} type="button">Remove key</button> : null}
        </div>
          </div>
          </div>
        </div> : null}

        </section>

        <section className="settings-page__section" aria-labelledby="translate-model-heading">
          <div className="settings-page__section-heading">
            <div>
              <h2 id="translate-model-heading">Translate model</h2>
              <p>Used when you translate selected text into a card.</p>
            </div>
          </div>

        <label className="settings-page__field">
          <span>Search models</span>
          <input
            aria-label="Search models"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            onChange={(event) => {
              setModelSearch(event.target.value);
              setModelSelectionMade(false);
              setHighlightedModelIndex(-1);
            }}
            onKeyDown={(event) => {
              if (!keyboardModels.length) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlightedModelIndex((current) => Math.min(current + 1, keyboardModels.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlightedModelIndex((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                const highlightedModel = keyboardModels[highlightedModelIndex];
                if (highlightedModel) {
                  event.preventDefault();
                  selectModel(highlightedModel);
                }
              }
            }}
            onFocus={(event) => {
              if (modelSelectionMade) event.currentTarget.select();
            }}
            placeholder="Search by model name…"
            spellCheck={false}
            type="search"
            value={modelSearch}
          />
        </label>

        {modelSearch.trim() && modelSearch === deferredModelSearch && !modelSelectionMade && filteredModels.length > 0 ? (
          <div aria-label="Model results" className="settings-page__model-results">
            {filteredModels.map((model) => (
              <button
                aria-pressed={selectedEngineId === model.engineId}
                className={`settings-page__model-result ${selectedEngineId === model.engineId ? "is-selected" : ""} ${filteredModels[highlightedModelIndex] === model ? "is-highlighted" : ""}`}
                key={model.engineId}
                onClick={() => selectModel(model)}
                type="button"
              >
                <span>{model.name}</span>
                <small>{model.description}</small>
              </button>
            ))}
          </div>
        ) : null}

        <label className="settings-page__field">
          <span>Translate to</span>
          <input aria-label="Target language" onChange={(event) => {
            setTargetLanguage(event.target.value);
            setPreference(TARGET_LANGUAGE_KEY, event.target.value);
            onDefaultChange?.(selectedEngineId);
          }} type="text" value={targetLanguage} />
        </label>

        {error ? <p className="settings-page__error" role="alert">{error}</p> : null}
        <p className="settings-page__privacy">API keys are stored in the app configuration and are never saved in cards.</p>
      </section>
        </> : <p className="settings-page__empty">No settings match “{searchQuery}”.</p>}
      </section>
    </main>
  );
}
