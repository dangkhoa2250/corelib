import { invoke } from "@tauri-apps/api/core";

import type { Invoke } from "./desktop";
import {
  parsePluginLifecycleStateLoadResult,
  type PluginLifecycleStateStore,
} from "../plugins/lifecycleState";

export function createTauriPluginLifecycleStateStore(
  call: Invoke = invoke as Invoke,
): PluginLifecycleStateStore {
  return {
    async load() {
      const candidate = await call<unknown>("load_plugin_lifecycle_state");
      return parsePluginLifecycleStateLoadResult(candidate);
    },
    async save(state) {
      await call<void>("save_plugin_lifecycle_state", { value: state });
    },
  };
}
