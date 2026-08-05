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
  defaultTranslationSelection,
  parseAiEngineId,
  readTranslationSelection,
  TRANSLATION_ENGINE_KEY,
  type TranslationEngineId,
} from "../../domain/translation";
import { IconEye, IconEyeOff } from "../../app/icons";
import { IconArrowLeft, IconMemora, IconSearch, IconAppearance, IconCloud } from "../../app/icons";
import { useTheme } from "../../contexts/ThemeContext";
import { Combobox } from "../../components/Combobox";
import { ModelBrandIcon } from "../../components/ModelBrandIcon";
import { ProviderBrandIcon } from "../../components/ProviderBrandIcon";
import { useContext } from "react";
import { AccountContext } from "../account/AccountGate";
import { AccountSettingsSection } from "../account/AccountSettingsSection";
import type { SettingsSection } from "../../app/routes";
import { MemoraSettingsSection } from "./MemoraSettingsSection";
import type { MemoraSettings } from "../../domain/learning";
import { desktopPlatform } from "../../lib/platform";
import { windowsOnDeviceTranslationAvailable } from "../../lib/windowsTranslation";

interface SettingsNavItem {
  section: SettingsSection;
  keywords: string[];
}

const SETTINGS_NAV_KEYWORDS: Record<SettingsSection, string[]> = {
  account: ["account"],
  appearance: ["appearance", "theme", "dark", "light"],
  drive: ["drive", "google", "cloud"],
  model: ["model", "provider", "translate", "ai"],
  memora: ["memora", "learning", "fsrs", "cards", "retention"],
};

function matchesSearch(item: SettingsNavItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.keywords.some((keyword) => keyword.includes(q) || q.includes(keyword));
}

const DEFAULT_PROVIDER_KEY = "library.ai.default-provider";
const TARGET_LANGUAGE_KEY = "library.ai.target-language";
const defaultAppleTranslationAvailable = async () => desktopPlatform() === "macos";
const defaultWindowsTranslationAvailable = async () => windowsOnDeviceTranslationAvailable();

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
  getMemoraSettings: () => Promise<MemoraSettings>;
  updateMemoraSettings: (settings: MemoraSettings) => Promise<MemoraSettings>;
  appleTranslationAvailable?: () => Promise<boolean>;
  windowsTranslationAvailable?: () => boolean | Promise<boolean>;
  onDefaultChange?: (engineId: TranslationEngineId | null) => void;
  onBack?: () => void;
  saveDriveCredentials?: (clientId: string, clientSecret: string) => Promise<void>;
  loadDriveCredentials?: () => Promise<{ clientId: string; clientSecret: string } | null>;
  clearDriveCredentials?: () => Promise<void>;
  initialSection?: SettingsSection;
}

function readProvider(): AiProviderId {
  const value = getPreference(DEFAULT_PROVIDER_KEY);
  return AI_PROVIDERS.some((provider) => provider.id === value)
    ? value as AiProviderId
    : "google-ai-studio";
}

export function readTranslationPreference(): { engineId: TranslationEngineId | null; targetLanguage: string } {
  const candidate = storage();
  const platform = desktopPlatform();
  const appleCandidate = platform === "macos" || platform === "unknown";
  const windowsCandidate = platform === "windows" && windowsOnDeviceTranslationAvailable();
  return {
    engineId: candidate
      ? readTranslationSelection(candidate, appleCandidate, windowsCandidate)
      : appleCandidate
        ? "apple-translation"
        : windowsCandidate
          ? "windows-translation"
          : null,
    targetLanguage: getPreference(TARGET_LANGUAGE_KEY) ?? "Vietnamese",
  };
}

export function SettingsPage({ hasApiKey, saveApiKey, clearApiKey, listModels, getMemoraSettings, updateMemoraSettings, appleTranslationAvailable = defaultAppleTranslationAvailable, windowsTranslationAvailable = defaultWindowsTranslationAvailable, onDefaultChange, onBack, saveDriveCredentials, loadDriveCredentials, clearDriveCredentials, initialSection = "model" }: SettingsPageProps) {
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
  const [appleAvailable, setAppleAvailable] = useState(() => {
    const platform = desktopPlatform();
    return platform === "macos" || platform === "unknown";
  });
  const [windowsAvailable, setWindowsAvailable] = useState(() => (
    desktopPlatform() === "windows" && windowsOnDeviceTranslationAvailable()
  ));
  const [targetLanguage, setTargetLanguage] = useState(initialPreference.targetLanguage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modelSearch, setModelSearch] = useState(
    initialPreference.engineId === "apple-translation"
      ? "Apple Translation"
      : initialPreference.engineId === "windows-translation"
        ? "Windows Translation"
      : initialPreference.engineId === "google-translation"
        ? "Google Cloud Translation"
        : "",
  );
  const [deferredModelSearch, setDeferredModelSearch] = useState("");
  const [modelSelectionMade, setModelSelectionMade] = useState(
    initialPreference.engineId === "apple-translation"
      || initialPreference.engineId === "windows-translation"
      || initialPreference.engineId === "google-translation",
  );
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(-1);
  const currentProvider = useMemo(() => providerDefinition(provider), [provider]);

  // Google Drive Credentials State
  const [driveClientId, setDriveClientId] = useState("");
  const [driveClientSecret, setDriveClientSecret] = useState("");
  const [showDriveClientSecret, setShowDriveClientSecret] = useState(false);
  const [hasSavedDriveCredentials, setHasSavedDriveCredentials] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSuccess, setDriveSuccess] = useState(false);

  const [section, setSection] = useState<SettingsSection>(initialSection);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const showAccountSettings = section === "account";
  const showAppearanceSettings = section === "appearance";
  const showDriveSettings = section === "drive";
  const showModelSettings = section === "model";
  const showMemoraSettings = section === "memora";

  const accountContext = useContext(AccountContext);

  const isNavVisible = (target: SettingsSection): boolean =>
    matchesSearch({ section: target, keywords: SETTINGS_NAV_KEYWORDS[target] }, searchQuery);

  useEffect(() => {
    if (!loadDriveCredentials) return;
    loadDriveCredentials()
      .then((credentials) => {
        if (credentials) {
          setDriveClientId(credentials.clientId);
          setDriveClientSecret(credentials.clientSecret);
          setHasSavedDriveCredentials(true);
        }
      })
      .catch(() => {});
  }, [loadDriveCredentials]);

  const handleSaveDriveCredentials = async () => {
    if (!saveDriveCredentials) return;
    setLoading(true);
    setDriveError(null);
    setDriveSuccess(false);
    try {
      await saveDriveCredentials(driveClientId.trim(), driveClientSecret.trim());
      setHasSavedDriveCredentials(true);
      setDriveSuccess(true);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClearDriveCredentials = async () => {
    if (!clearDriveCredentials) return;
    setLoading(true);
    setDriveError(null);
    setDriveSuccess(false);
    try {
      await clearDriveCredentials();
      setDriveClientId("");
      setDriveClientSecret("");
      setHasSavedDriveCredentials(false);
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const connectedProviders = AI_PROVIDERS.filter((item) => connected[item.id]);
  const searchableModels = [
    ...builtinTranslationEngines(appleAvailable, connected["google-translation"], windowsAvailable)
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
  const selectedModel = searchableModels.find((model) => model.engineId === selectedEngineId);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDeferredModelSearch(modelSearch), 250);
    return () => window.clearTimeout(timeoutId);
  }, [modelSearch]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      appleTranslationAvailable().catch(() => false),
      Promise.resolve(windowsTranslationAvailable()).catch(() => false),
    ]).then(([appleSupported, windowsSupported]) => {
      if (cancelled) return;
      setAppleAvailable(appleSupported);
      setWindowsAvailable(windowsSupported);

      const selected = selectedEngineIdRef.current;
      const selectedIsUnavailable = selected === "apple-translation" && !appleSupported
        || selected === "windows-translation" && !windowsSupported;
      if (!selectedIsUnavailable && selected) return;

      const fallback = defaultTranslationSelection(appleSupported, windowsSupported);
      selectedEngineIdRef.current = fallback;
      setSelectedEngineId(fallback);
      setModelSearch(fallback === "apple-translation"
        ? "Apple Translation"
        : fallback === "windows-translation"
          ? "Windows Translation"
          : "");
      setModelSelectionMade(Boolean(fallback));
      if (fallback) setPreference(TRANSLATION_ENGINE_KEY, fallback);
      else removePreference(TRANSLATION_ENGINE_KEY);
      onDefaultChange?.(fallback);
    });
    return () => { cancelled = true; };
  }, [appleTranslationAvailable, windowsTranslationAvailable]);

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
        {accountContext && isNavVisible("account") && (
          <button
            className={`settings-page__nav-item ${showAccountSettings ? "is-active" : ""}`}
            onClick={() => setSection("account")}
            type="button"
          >
            <span className="settings-page__nav-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            Account
          </button>
        )}
        {isNavVisible("appearance") && (
          <button
            className={`settings-page__nav-item ${showAppearanceSettings ? "is-active" : ""}`}
            onClick={() => setSection("appearance")}
            type="button"
          >
            <span className="settings-page__nav-icon"><IconAppearance /></span>
            Appearance
          </button>
        )}
        {isNavVisible("drive") && (
          <button
            className={`settings-page__nav-item ${showDriveSettings ? "is-active" : ""}`}
            onClick={() => setSection("drive")}
            type="button"
          >
            <span className="settings-page__nav-icon"><IconCloud /></span>
            Google Drive
          </button>
        )}
        <p className="settings-page__nav-label">Models</p>
        {isNavVisible("model") && (
          <button
            className={`settings-page__nav-item ${showModelSettings ? "is-active" : ""}`}
            onClick={() => setSection("model")}
            type="button"
          >
            <span className="settings-page__nav-icon"><IconMemora /></span>
            Model
          </button>
        )}
        <p className="settings-page__nav-label">Apps</p>
        {isNavVisible("memora") && (
          <button
            className={`settings-page__nav-item ${showMemoraSettings ? "is-active" : ""}`}
            onClick={() => setSection("memora")}
            type="button"
          >
            <span className="settings-page__nav-icon"><IconMemora /></span>
            Memora
          </button>
        )}
      </aside>

      <section className="settings-page__main">
        {showMemoraSettings ? null : (
          <header className="settings-page__header">
            <p className="settings-page__eyebrow">
              {showAccountSettings ? "Account" : showAppearanceSettings ? "General" : showDriveSettings ? "General" : "Models"}
            </p>
            <h1>
              {showAccountSettings ? "Account" : showAppearanceSettings ? "Appearance" : showDriveSettings ? "Google Drive" : "Model"}
            </h1>
            <p>
              {showAccountSettings
                ? "Manage your account settings."
                : showAppearanceSettings
                  ? "Customize how Memora looks."
                  : showDriveSettings
                    ? "Configure Google Drive OAuth client credentials."
                    : "Choose the providers and model used by Memora."}
            </p>
          </header>
        )}

        {showMemoraSettings ? (
          <MemoraSettingsSection load={getMemoraSettings} save={updateMemoraSettings} />
        ) : showAccountSettings && accountContext ? (
          <AccountSettingsSection
            session={accountContext.session!}
            onUpdateAnalytics={accountContext.updateAnalytics}
            onSignOut={() => {
              void accountContext.signOut();
              if (onBack) onBack();
            }}
          />
        ) : showAppearanceSettings ? (
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
        ) : showDriveSettings ? (
        <>
        <section className="settings-page__section" aria-labelledby="drive-heading">
          <div className="settings-page__section-heading">
            <div>
              <h2 id="drive-heading">Google Drive</h2>
              <p>Configure Google Drive OAuth client credentials for importing documents.</p>
            </div>
          </div>

          <label className="settings-page__field">
            <span>Client ID</span>
            <input
              aria-label="Google Drive Client ID"
              autoComplete="off"
              onChange={(event) => {
                setDriveClientId(event.target.value);
                setDriveSuccess(false);
              }}
              placeholder="Enter Google Drive Client ID"
              style={{ color: "var(--text-primary)" }}
              type="text"
              value={driveClientId}
            />
          </label>

          <label className="settings-page__field">
            <span>Client Secret</span>
            <span className="settings-page__secret-input">
              <input
                aria-label="Google Drive Client Secret"
                autoComplete="off"
                onChange={(event) => {
                  setDriveClientSecret(event.target.value);
                  setDriveSuccess(false);
                }}
                placeholder={hasSavedDriveCredentials ? "••••••••••••••••" : "Enter Google Drive Client Secret"}
                style={{ color: "var(--text-primary)" }}
                type={showDriveClientSecret ? "text" : "password"}
                value={driveClientSecret}
              />
              {driveClientSecret ? (
                <button
                  aria-label={showDriveClientSecret ? "Hide Client Secret" : "Show Client Secret"}
                  className="settings-page__secret-toggle"
                  onClick={() => setShowDriveClientSecret((visible) => !visible)}
                  type="button"
                >
                  {showDriveClientSecret ? <IconEyeOff /> : <IconEye />}
                </button>
              ) : null}
            </span>
          </label>

          <div className="settings-page__actions">
            <button
              disabled={loading || (!driveClientId.trim() && !driveClientSecret.trim())}
              onClick={() => void handleSaveDriveCredentials()}
              type="button"
            >
              {loading ? "Saving…" : "Save Credentials"}
            </button>
            {hasSavedDriveCredentials ? (
              <button
                className="settings-page__secondary-button"
                disabled={loading}
                onClick={() => void handleClearDriveCredentials()}
                type="button"
              >
                Clear Credentials
              </button>
            ) : null}
          </div>
          
          {driveError ? <p className="settings-page__error" role="alert">{driveError}</p> : null}
          {driveSuccess ? <p role="alert" style={{ color: "var(--success)", fontSize: "13px", marginTop: "8px", fontWeight: "bold" }}>Saved successfully!</p> : null}
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
                <div className="settings-page__provider-details">
                  <ProviderBrandIcon providerId={item.id} />
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.description}</span>
                  </div>
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
            options={AI_PROVIDERS.map((item) => ({ value: item.id, label: item.name, icon: <ProviderBrandIcon providerId={item.id} /> }))}
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

        {modelSelectionMade && selectedModel ? (
          <div aria-label="Selected model" className="settings-page__selected-model">
            <ModelBrandIcon modelId={selectedModel.id} />
            <span>{selectedModel.name}</span>
          </div>
        ) : null}

        {modelSearch.trim() && modelSearch === deferredModelSearch && !modelSelectionMade && filteredModels.length > 0 ? (
          <div aria-label="Model results" className="settings-page__model-results">
            {filteredModels.map((model) => (
              <button
                aria-pressed={selectedEngineId === model.engineId}
                className={`settings-page__model-result settings-page__model-result--compact ${selectedEngineId === model.engineId ? "is-selected" : ""} ${filteredModels[highlightedModelIndex] === model ? "is-highlighted" : ""}`}
                key={model.engineId}
                onClick={() => selectModel(model)}
                type="button"
              >
                <span className="settings-page__model-name">
                  <ModelBrandIcon modelId={model.id} />
                  <span>{model.name}</span>
                </span>
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
