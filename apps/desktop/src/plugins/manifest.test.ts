import { describe, expect, it } from "vitest";

import { validatePluginManifest } from "./manifest";

const validManifest = {
  manifestVersion: 1,
  id: "corelib.example",
  version: "1.0.0",
  name: "Example",
  description: "An example Corelib plugin.",
  publisher: "Corelib",
  compatibility: {
    pluginApi: "^1.0.0",
  },
  dependencies: [],
  permissions: [],
  contributions: {
    surfaces: [],
    commands: [],
    searchProviders: [],
    resources: [],
    events: [],
  },
} as const;

describe("validatePluginManifest", () => {
  it("accepts a structurally and semantically valid manifest", () => {
    expect(validatePluginManifest(validManifest)).toEqual({
      ok: true,
      manifest: validManifest,
    });
  });

  it("reports an unsupported manifest version without throwing", () => {
    const candidate = { ...validManifest, manifestVersion: 2 };

    expect(validatePluginManifest(candidate)).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "unsupported_manifest_version",
          path: "/manifestVersion",
        }),
      ],
    });
  });

  it("reports invalid plugin and dependency semantic versions", () => {
    const candidate = {
      ...validManifest,
      version: "latest",
      dependencies: [
        { pluginId: "corelib.library", version: "newest", optional: false },
      ],
    };

    const result = validatePluginManifest(candidate);

    expect(result).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({ code: "invalid_plugin_version", path: "/version" }),
        expect.objectContaining({
          code: "invalid_dependency_range",
          path: "/dependencies/0/version",
        }),
      ],
    });
  });

  it("reports an invalid plugin API compatibility range", () => {
    const candidate = {
      ...validManifest,
      compatibility: { pluginApi: "current" },
    };

    expect(validatePluginManifest(candidate)).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({
          code: "invalid_plugin_api_range",
          path: "/compatibility/pluginApi",
        }),
      ],
    });
  });

  it("rejects undeclared command audiences and effects", () => {
    const candidate = {
      ...validManifest,
      contributions: {
        ...validManifest.contributions,
        commands: [
          {
            id: "action.example",
            title: "Example action",
            aliases: [],
            breadcrumb: ["Example"],
            group: "Actions",
            audiences: ["everyone"],
            effect: "unknown",
            bindingId: "binding.example",
          },
        ],
      },
    };

    const result = validatePluginManifest(candidate);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "invalid_manifest" }),
        ]),
      );
    }
  });
});
