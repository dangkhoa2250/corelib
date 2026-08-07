import { invoke } from "@tauri-apps/api/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import type { AccountApi } from "../domain/account";
import { CORE_CONTRIBUTIONS } from "../plugins/coreContributions";
import { FIRST_PARTY_PLUGIN_CATALOG } from "../plugins/firstParty";
import { createPluginLifecycle } from "../plugins/lifecycle";
import { createMemoryPluginLifecycleStateStore } from "../plugins/lifecycleState";
import { CORELIB_PLUGIN_API_VERSION } from "../plugins/manifest";
import { App } from "./App";

it("does not activate or expose integrations for disabled Plugins", async () => {
  const pluginIds = FIRST_PARTY_PLUGIN_CATALOG.map(
    ({ definition }) => (definition.manifest as { id: string }).id,
  );
  const lifecycle = createPluginLifecycle({
    pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
    coreContributions: CORE_CONTRIBUTIONS,
    installedPlugins: FIRST_PARTY_PLUGIN_CATALOG,
    store: createMemoryPluginLifecycleStateStore({
      schemaVersion: 1,
      accounts: {
        "u-test": {
          revision: 1,
          knownPluginIds: pluginIds,
          enabledPluginIds: [],
          navigation: {
            pinnedSurfaceIds: [
              "route.library",
              "route.memora",
              "route.statistics",
              "route.trash",
            ],
          },
        },
      },
    }),
  });
  const listDocuments = vi.fn(async () => []);
  const listDecks = vi.fn(async () => []);
  const windowsTranslationAvailable = vi.fn(() => true);
  const pendingSession = new Promise<never>(() => undefined);
  const accountApi = {
    currentSession: vi.fn(() => pendingSession),
    register: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    setAnalyticsEnabled: vi.fn(),
    sendAnalytics: vi.fn(),
    upsertDailyStatistics: vi.fn(),
  } as unknown as AccountApi;
  vi.mocked(invoke).mockClear();

  render(
    <App
      accountApi={accountApi}
      aiApi={{
        hasApiKey: vi.fn(async () => false),
        saveApiKey: vi.fn(),
        clearApiKey: vi.fn(),
        listModels: vi.fn(async () => []),
        appleTranslationAvailable: vi.fn(async () => false),
        windowsTranslationAvailable,
        translate: vi.fn(),
      }}
      learningApi={{ listDecks, createCard: vi.fn() }}
      libraryApi={{
        list: listDocuments,
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      pluginLifecycle={lifecycle}
    />,
  );

  expect(await screen.findByRole("heading", { name: "Corelib Home" })).toBeInTheDocument();
  expect(listDocuments).not.toHaveBeenCalled();
  expect(listDecks).not.toHaveBeenCalled();
  expect(windowsTranslationAvailable).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalledWith("get_daily_statistics_snapshots", expect.anything());

  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(await screen.findByLabelText("Search settings")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Google Drive" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Model" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Memora" })).not.toBeInTheDocument();
});
