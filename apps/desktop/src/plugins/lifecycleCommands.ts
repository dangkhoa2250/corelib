import {
  PluginLifecycleError,
  type PluginLifecycle,
  type PluginLifecycleOperationContext,
  type PluginLifecycleSnapshot,
} from "./lifecycle";
import type { CommandDeclaration } from "./registry";

const stringIdSchema = { type: "string", minLength: 1 } as const;

const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accountId: stringIdSchema,
    revision: { type: "integer", minimum: 0 },
    affectedPluginIds: { type: "array", items: stringIdSchema },
    enabledPluginIds: { type: "array", items: stringIdSchema },
    pinnedSurfaceIds: { type: "array", items: stringIdSchema },
  },
  required: [
    "accountId",
    "revision",
    "affectedPluginIds",
    "enabledPluginIds",
    "pinnedSurfaceIds",
  ],
} as const;

const pluginInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: { pluginId: stringIdSchema },
  required: ["pluginId"],
} as const;

const surfaceInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: { surfaceId: stringIdSchema },
  required: ["surfaceId"],
} as const;

const reorderInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    surfaceId: stringIdSchema,
    beforeSurfaceId: { type: ["string", "null"], minLength: 1 },
  },
  required: ["surfaceId", "beforeSurfaceId"],
} as const;

const declaration = (
  id: string,
  title: string,
  confirmation: "never" | "when-required",
  inputSchema: Readonly<Record<string, unknown>>,
): CommandDeclaration => ({
  id,
  title,
  aliases: [],
  breadcrumb: ["Corelib", "Plugins"],
  group: "Plugin lifecycle",
  audiences: ["agent"],
  effect: "write",
  bindingId: id,
  input: { schemaVersion: 1, schema: inputSchema },
  output: { schemaVersion: 1, schema: outputSchema },
  confirmation,
});

export const PLUGIN_LIFECYCLE_COMMAND_IDS = [
  "core.navigation.pin",
  "core.navigation.reorder",
  "core.navigation.unpin",
  "core.plugins.disable",
  "core.plugins.enable",
] as const;

export type PluginLifecycleCommandId = typeof PLUGIN_LIFECYCLE_COMMAND_IDS[number];

export const PLUGIN_LIFECYCLE_COMMAND_DECLARATIONS = Object.freeze([
  declaration("core.navigation.pin", "Pin navigation surface", "never", surfaceInputSchema),
  declaration("core.navigation.reorder", "Reorder navigation surface", "never", reorderInputSchema),
  declaration("core.navigation.unpin", "Unpin navigation surface", "never", surfaceInputSchema),
  declaration("core.plugins.disable", "Disable Plugin", "when-required", pluginInputSchema),
  declaration("core.plugins.enable", "Enable Plugin", "never", pluginInputSchema),
]);

export interface PluginLifecycleCommandExecutionOptions {
  readonly confirmed?: boolean;
  readonly operationContext?: PluginLifecycleOperationContext;
}

export interface PluginLifecycleCommandResult {
  readonly accountId: string;
  readonly revision: number;
  readonly affectedPluginIds: readonly string[];
  readonly enabledPluginIds: readonly string[];
  readonly pinnedSurfaceIds: readonly string[];
}

export interface PluginLifecycleCommandExecutor {
  list(): typeof PLUGIN_LIFECYCLE_COMMAND_DECLARATIONS;
  execute(
    commandId: PluginLifecycleCommandId,
    input: unknown,
    options?: PluginLifecycleCommandExecutionOptions,
  ): Promise<PluginLifecycleCommandResult>;
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Plugin lifecycle Command input must be an object.");
  }
  return input as Record<string, unknown>;
}

function requiredId(input: Record<string, unknown>, key: "pluginId" | "surfaceId"): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Plugin lifecycle Command requires a non-empty ${key}.`);
  }
  return value;
}

function resultFrom(
  snapshot: PluginLifecycleSnapshot,
  affectedPluginIds: readonly string[],
): PluginLifecycleCommandResult {
  return Object.freeze({
    accountId: snapshot.accountId,
    revision: snapshot.revision,
    affectedPluginIds: Object.freeze([...affectedPluginIds]),
    enabledPluginIds: Object.freeze([...snapshot.enabledPluginIds]),
    pinnedSurfaceIds: Object.freeze([...snapshot.pinnedSurfaceIds]),
  });
}

export function createPluginLifecycleCommandExecutor(
  lifecycle: PluginLifecycle,
): PluginLifecycleCommandExecutor {
  return Object.freeze({
    list: () => PLUGIN_LIFECYCLE_COMMAND_DECLARATIONS,
    execute: async (
      commandId: PluginLifecycleCommandId,
      input: unknown,
      options: PluginLifecycleCommandExecutionOptions = {},
    ) => {
      const values = record(input);
      const change = (() => {
        switch (commandId) {
          case "core.plugins.enable":
            return { kind: "enable-plugin" as const, pluginId: requiredId(values, "pluginId") };
          case "core.plugins.disable":
            return {
              kind: "disable-plugin" as const,
              pluginId: requiredId(values, "pluginId"),
              context: options.operationContext,
              confirmationGranted: options.confirmed === true,
            };
          case "core.navigation.pin":
            return { kind: "pin-surface" as const, surfaceId: requiredId(values, "surfaceId") };
          case "core.navigation.unpin":
            return { kind: "unpin-surface" as const, surfaceId: requiredId(values, "surfaceId") };
          case "core.navigation.reorder": {
            const beforeSurfaceId = values.beforeSurfaceId;
            if (beforeSurfaceId !== null && (typeof beforeSurfaceId !== "string" || beforeSurfaceId.length === 0)) {
              throw new TypeError("Plugin lifecycle Command requires beforeSurfaceId to be a non-empty string or null.");
            }
            return {
              kind: "reorder-surface" as const,
              surfaceId: requiredId(values, "surfaceId"),
              beforeSurfaceId,
            };
          }
          default:
            throw new PluginLifecycleError([{
              code: "invalid_plan",
              message: `Unknown Plugin lifecycle Command: ${String(commandId)}`,
            }]);
        }
      })();
      const plan = lifecycle.plan(change);
      const snapshot = await lifecycle.apply(plan);
      return resultFrom(snapshot, plan.affectedPluginIds);
    },
  });
}
