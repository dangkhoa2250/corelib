const identifier = {
  type: "string",
  pattern: "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$",
} as const;

const contributionIdentifier = {
  type: "string",
  pattern: "^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$",
} as const;

const commandPresentation = {
  type: "object",
  properties: {
    id: contributionIdentifier,
    title: { type: "string", minLength: 1 },
    aliases: {
      type: "array",
      items: { type: "string", minLength: 1 },
      uniqueItems: true,
    },
    breadcrumb: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    group: { type: "string", minLength: 1 },
  },
  required: ["id", "title", "aliases", "breadcrumb", "group"],
} as const;

export const PLUGIN_MANIFEST_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    manifestVersion: { const: 1 },
    id: identifier,
    version: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    publisher: { type: "string", minLength: 1 },
    compatibility: {
      type: "object",
      additionalProperties: false,
      properties: {
        pluginApi: { type: "string", minLength: 1 },
      },
      required: ["pluginApi"],
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          pluginId: identifier,
          version: { type: "string", minLength: 1 },
          optional: { type: "boolean" },
        },
        required: ["pluginId", "version", "optional"],
      },
    },
    permissions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: contributionIdentifier,
          required: { type: "boolean" },
          scopes: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
        },
        required: ["id", "required"],
      },
    },
    contributions: {
      type: "object",
      additionalProperties: false,
      properties: {
        surfaces: {
          type: "array",
          items: {
            ...commandPresentation,
            additionalProperties: false,
            properties: {
              ...commandPresentation.properties,
              kind: { enum: ["page", "settings"] },
              quickOpen: { type: "boolean" },
              icon: { type: "string", minLength: 1 },
              navigation: {
                type: "object",
                additionalProperties: false,
                properties: {
                  defaultPinned: { type: "boolean" },
                  order: { type: "number" },
                },
                required: ["defaultPinned", "order"],
              },
              bindingId: contributionIdentifier,
            },
            required: [
              ...commandPresentation.required,
              "kind",
              "quickOpen",
              "bindingId",
            ],
          },
        },
        commands: {
          type: "array",
          items: {
            ...commandPresentation,
            additionalProperties: false,
            properties: {
              ...commandPresentation.properties,
              audiences: {
                type: "array",
                items: { enum: ["human", "plugin", "agent", "automation"] },
                minItems: 1,
                uniqueItems: true,
              },
              effect: { enum: ["read", "write", "destructive", "external"] },
              bindingId: contributionIdentifier,
              availabilityId: contributionIdentifier,
              input: {
                type: "object",
                additionalProperties: false,
                properties: {
                  schemaVersion: { type: "integer", minimum: 1 },
                  schema: { type: "object" },
                },
                required: ["schemaVersion", "schema"],
              },
              output: {
                type: "object",
                additionalProperties: false,
                properties: {
                  schemaVersion: { type: "integer", minimum: 1 },
                  schema: { type: "object" },
                },
                required: ["schemaVersion", "schema"],
              },
              confirmation: { enum: ["never", "when-required"] },
            },
            required: [
              ...commandPresentation.required,
              "audiences",
              "effect",
              "bindingId",
            ],
          },
        },
        searchProviders: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: contributionIdentifier,
              group: { type: "string", minLength: 1 },
              bindingId: contributionIdentifier,
            },
            required: ["id", "group", "bindingId"],
          },
        },
        resources: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: contributionIdentifier,
              schemaVersion: { type: "integer", minimum: 1 },
              schema: { type: "object" },
            },
            required: ["id", "schemaVersion", "schema"],
          },
        },
        events: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: contributionIdentifier,
              schemaVersion: { type: "integer", minimum: 1 },
              schema: { type: "object" },
            },
            required: ["id", "schemaVersion", "schema"],
          },
        },
      },
      required: ["surfaces", "commands", "searchProviders", "resources", "events"],
    },
  },
  required: [
    "manifestVersion",
    "id",
    "version",
    "name",
    "description",
    "publisher",
    "compatibility",
    "dependencies",
    "permissions",
    "contributions",
  ],
} as const;
