export const PLUGIN_LIFECYCLE_STATE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://corelib.local/schemas/plugin-lifecycle-state-v1.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "accounts"],
  properties: {
    schemaVersion: { const: 1 },
    accounts: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["revision", "knownPluginIds", "enabledPluginIds", "navigation"],
        properties: {
          revision: { type: "integer", minimum: 0 },
          knownPluginIds: { type: "array", items: { type: "string", minLength: 1 } },
          enabledPluginIds: { type: "array", items: { type: "string", minLength: 1 } },
          navigation: {
            type: "object",
            additionalProperties: false,
            required: ["pinnedSurfaceIds"],
            properties: {
              pinnedSurfaceIds: {
                type: "array",
                items: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    },
  },
} as const;
