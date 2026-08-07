import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AccountContext } from "../features/account/AccountGate";
import { CORE_CONTRIBUTIONS } from "../plugins/coreContributions";
import { FIRST_PARTY_PLUGINS } from "../plugins/firstParty";
import { createPluginLifecycle } from "../plugins/lifecycle";
import { createMemoryPluginLifecycleStateStore } from "../plugins/lifecycleState";
import { CORELIB_PLUGIN_API_VERSION } from "../plugins/manifest";
import { PluginLifecycleProvider, usePluginLifecycle } from "./PluginLifecycleProvider";

function accountValue(accountId: string) {
  return {
    session: {
      profile: {
        id: accountId,
        displayName: accountId,
        email: `${accountId}@example.test`,
        status: "approved" as const,
        role: "member" as const,
        analyticsEnabled: false,
      },
      entitlements: { featureKeys: [], refreshedAt: "2026-08-07T00:00:00Z" },
    },
    signOut: vi.fn(async () => undefined),
    updateAnalytics: vi.fn(async () => undefined),
  };
}

function Probe() {
  const { snapshot } = usePluginLifecycle();
  return <p>{snapshot.accountId}</p>;
}

function Harness({ accountId, children }: { accountId: string; children: ReactNode }) {
  return (
    <AccountContext.Provider value={accountValue(accountId)}>
      {children}
    </AccountContext.Provider>
  );
}

describe("PluginLifecycleProvider", () => {
  it("loads only for the approved account and resets on account change", async () => {
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store: createMemoryPluginLifecycleStateStore(),
    });
    const load = vi.spyOn(lifecycle, "load");
    const view = render(
      <Harness accountId="account-a">
        <PluginLifecycleProvider lifecycle={lifecycle}>
          <Probe />
        </PluginLifecycleProvider>
      </Harness>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading plugins");
    expect(await screen.findByText("account-a")).toBeInTheDocument();

    view.rerender(
      <Harness accountId="account-b">
        <PluginLifecycleProvider lifecycle={lifecycle}>
          <Probe />
        </PluginLifecycleProvider>
      </Harness>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading plugins");
    expect(await screen.findByText("account-b")).toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenNthCalledWith(1, "account-a");
    expect(load).toHaveBeenNthCalledWith(2, "account-b");
  });
});
