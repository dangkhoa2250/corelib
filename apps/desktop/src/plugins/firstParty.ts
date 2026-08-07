import { DRIVE_PLUGIN } from "../features/drive/plugin";
import { LIBRARY_PLUGIN } from "../features/library/plugin";
import { MEMORA_PLUGIN } from "../features/memora/plugin";
import { MODELS_PLUGIN } from "../features/settings/modelPlugin";
import { STATISTICS_PLUGIN } from "../features/statistics/plugin";
import { CORELIB_PLUGIN_API_VERSION } from "./manifest";
import { CORE_CONTRIBUTIONS } from "./coreContributions";
import { createPluginRegistry } from "./registry";

export const FIRST_PARTY_PLUGINS = [
  DRIVE_PLUGIN,
  LIBRARY_PLUGIN,
  MEMORA_PLUGIN,
  MODELS_PLUGIN,
  STATISTICS_PLUGIN,
] as const;

export const DEFAULT_PLUGIN_REGISTRY = createPluginRegistry({
  pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
  coreContributions: CORE_CONTRIBUTIONS,
  plugins: FIRST_PARTY_PLUGINS,
});
