import { describe, expect, it, vi } from "vitest";

import { createTauriPluginLifecycleStateStore } from "./pluginLifecycle";
import type { Invoke } from "./desktop";
import { createEmptyPluginLifecycleState } from "../plugins/lifecycleState";

describe("createTauriPluginLifecycleStateStore", () => {
  it("loads and saves through the two narrow Tauri commands", async () => {
    const state = createEmptyPluginLifecycleState();
    const call = vi.fn(async (command: string) => {
      if (command === "load_plugin_lifecycle_state") {
        return { state, notices: [] };
      }
      return undefined;
    });
    const store = createTauriPluginLifecycleStateStore(call as unknown as Invoke);

    await expect(store.load()).resolves.toEqual({ state, notices: [] });
    await store.save(state);

    expect(call).toHaveBeenNthCalledWith(1, "load_plugin_lifecycle_state");
    expect(call).toHaveBeenNthCalledWith(2, "save_plugin_lifecycle_state", { value: state });
  });

  it("rejects an invalid response before it reaches PluginLifecycle", async () => {
    const store = createTauriPluginLifecycleStateStore(
      vi.fn(async () => ({ schemaVersion: 1, accounts: {} })) as unknown as Invoke,
    );

    await expect(store.load()).rejects.toThrow("invalid_plugin_lifecycle_state");
  });
});
