import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { AccountContext } from "../account/AccountGate";
import { PluginLifecycleProvider } from "../../app/PluginLifecycleProvider";
import { CORE_CONTRIBUTIONS } from "../../plugins/coreContributions";
import { FIRST_PARTY_PLUGIN_CATALOG } from "../../plugins/firstParty";
import { createPluginLifecycle } from "../../plugins/lifecycle";
import {
  createEmptyPluginLifecycleState,
  createMemoryPluginLifecycleStateStore,
} from "../../plugins/lifecycleState";
import { CORELIB_PLUGIN_API_VERSION } from "../../plugins/manifest";
import { HomePage } from "./HomePage";

it("manages bundled Plugins in a track-free inset ScrollArea", async () => {
  const lifecycle = createPluginLifecycle({
    pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
    coreContributions: CORE_CONTRIBUTIONS,
    installedPlugins: FIRST_PARTY_PLUGIN_CATALOG,
    store: createMemoryPluginLifecycleStateStore(createEmptyPluginLifecycleState(), [
      { code: "corrupt_state_recovered", message: "Safe defaults were restored." },
    ]),
  });
  const account = {
    session: {
      profile: {
        id: "account-a",
        displayName: "A",
        email: "a@example.test",
        status: "approved" as const,
        role: "member" as const,
        analyticsEnabled: false,
      },
      entitlements: { featureKeys: [], refreshedAt: "2026-08-07T00:00:00Z" },
    },
    signOut: vi.fn(async () => undefined),
    updateAnalytics: vi.fn(async () => undefined),
  };
  const onLaunch = vi.fn();
  render(
    <AccountContext.Provider value={account}>
      <PluginLifecycleProvider lifecycle={lifecycle}>
        <HomePage onLaunch={onLaunch} />
      </PluginLifecycleProvider>
    </AccountContext.Provider>,
  );

  expect(await screen.findByRole("heading", { name: "Corelib Home" })).toBeInTheDocument();
  const content = screen.getByTestId("home-scroll-content");
  expect(content.parentElement).toHaveAttribute("data-scroll-area-root");
  expect(getComputedStyle(content).paddingRight).toBe("20px");
  expect(screen.getAllByRole("article")).toHaveLength(5);
  expect(screen.getByRole("alert")).toHaveTextContent("Safe defaults were restored.");
  expect(screen.queryByText(/Uninstall|Erase data/i)).not.toBeInTheDocument();

  const libraryCard = screen.getByRole("heading", { name: "Library" }).closest("article");
  expect(within(libraryCard!).getByRole("button", { name: "Unpin" })).toBeInTheDocument();
  await userEvent.click(within(libraryCard!).getByRole("button", { name: "Unpin" }));
  await waitFor(() =>
    expect(within(libraryCard!).getByRole("button", { name: "Pin" })).toBeInTheDocument(),
  );
  await userEvent.click(within(libraryCard!).getByRole("button", { name: "Pin" }));
  await waitFor(() =>
    expect(within(libraryCard!).getByRole("button", { name: "Unpin" })).toBeInTheDocument(),
  );
  await userEvent.click(within(libraryCard!).getByRole("button", { name: "Open" }));
  expect(onLaunch).toHaveBeenCalledWith("route.library");

  const modelsCard = screen
    .getByRole("heading", { name: "Models and Translation" })
    .closest("article");
  expect(modelsCard).not.toBeNull();
  expect(within(modelsCard!).getByText("Enabled")).toBeInTheDocument();

  await userEvent.click(within(modelsCard!).getByRole("button", { name: "Disable" }));

  await waitFor(() => expect(within(modelsCard!).getByText("Disabled")).toBeInTheDocument());
  expect(within(modelsCard!).getByRole("button", { name: "Enable" })).toBeInTheDocument();

  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const driveCard = screen.getByRole("heading", { name: "Google Drive" }).closest("article");
  await userEvent.click(within(libraryCard!).getByRole("button", { name: "Disable" }));
  await waitFor(() => expect(within(libraryCard!).getByText("Disabled")).toBeInTheDocument());
  expect(within(driveCard!).getByText("Disabled")).toBeInTheDocument();
  expect(confirm).toHaveBeenCalledOnce();

  await userEvent.click(within(driveCard!).getByRole("button", { name: "Enable" }));
  await waitFor(() => expect(within(driveCard!).getByText("Enabled")).toBeInTheDocument());
  expect(within(libraryCard!).getByText("Enabled")).toBeInTheDocument();
});
