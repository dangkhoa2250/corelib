import { describe, expect, it } from "vitest";

import type { PluginManifest } from "./manifest";
import {
  createPluginRegistry,
  type PluginDefinition,
  PluginRegistryValidationError,
} from "./registry";

function manifest(
  id: string,
  contributions: PluginManifest["contributions"],
  dependencies: PluginManifest["dependencies"] = [],
): PluginManifest {
  return {
    manifestVersion: 1,
    id,
    version: "1.0.0",
    name: id,
    description: `${id} plugin`,
    publisher: "Corelib",
    compatibility: { pluginApi: "^1.0.0" },
    dependencies,
    permissions: [],
    contributions,
  };
}

const emptyContributions = (): PluginManifest["contributions"] => ({
  surfaces: [],
  commands: [],
  searchProviders: [],
  resources: [],
  events: [],
});

function definition(
  id: string,
  contributions = emptyContributions(),
  dependencies: PluginManifest["dependencies"] = [],
): PluginDefinition {
  const declaredBindings = [
    ...contributions.surfaces,
    ...contributions.commands,
    ...contributions.searchProviders,
  ].map((contribution) => contribution.bindingId);
  return { manifest: manifest(id, contributions, dependencies), declaredBindings };
}

function registryIssues(input: Parameters<typeof createPluginRegistry>[0]) {
  try {
    createPluginRegistry(input);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(PluginRegistryValidationError);
    return (error as PluginRegistryValidationError).issues;
  }
}

function issueCodes(input: Parameters<typeof createPluginRegistry>[0]) {
  return registryIssues(input).map((issue) => issue.code);
}

describe("createPluginRegistry", () => {
  it("returns a deterministic immutable snapshot through its public interface", () => {
    const library = definition("corelib.library", {
      ...emptyContributions(),
      surfaces: [
        {
          id: "route.library",
          title: "Library",
          aliases: ["documents"],
          breadcrumb: ["Library"],
          group: "Navigation",
          kind: "page",
          quickOpen: true,
          navigation: { defaultPinned: true, order: 10 },
          icon: "books",
          bindingId: "route.library",
        },
      ],
    });
    const memora = definition("corelib.memora");

    const registry = createPluginRegistry({
      pluginApiVersion: "1.0.0",
      coreContributions: [],
      plugins: [memora, library],
    });

    expect(registry.listPlugins().map((plugin) => plugin.id)).toEqual([
      "corelib.library",
      "corelib.memora",
    ]);
    expect(registry.ownerOf("route.library")).toEqual({
      kind: "plugin",
      id: "corelib.library",
    });
    expect(Object.isFrozen(registry.listPlugins())).toBe(true);
    expect(Object.isFrozen(registry.listSurfaces()[0])).toBe(true);
  });

  it("aggregates duplicate IDs, API incompatibility, and dependency failures", () => {
    const duplicateBase = definition(
      "corelib.library",
      emptyContributions(),
      [
        { pluginId: "corelib.missing", version: "^1.0.0", optional: false },
        { pluginId: "corelib.base", version: "^2.0.0", optional: false },
      ],
    );
    const duplicate: PluginDefinition = {
      ...duplicateBase,
      manifest: {
        ...(duplicateBase.manifest as PluginManifest),
        compatibility: { pluginApi: "^2.0.0" },
      },
    };

    expect(
      issueCodes({
        pluginApiVersion: "1.0.0",
        coreContributions: [],
        plugins: [definition("corelib.library"), duplicate, definition("corelib.base")],
      }),
    ).toEqual([
      "duplicate_plugin_id",
      "incompatible_plugin_api",
      "missing_dependency",
      "incompatible_dependency",
    ]);
  });

  it("allows an absent optional dependency", () => {
    const optional = definition("corelib.optional", emptyContributions(), [
      { pluginId: "corelib.missing", version: "^1.0.0", optional: true },
    ]);

    expect(
      issueCodes({
        pluginApiVersion: "1.0.0",
        coreContributions: [],
        plugins: [optional],
      }),
    ).toEqual([]);
  });

  it("reports direct and indirect dependency cycles", () => {
    const direct = definition("corelib.direct", emptyContributions(), [
      { pluginId: "corelib.direct", version: "^1.0.0", optional: false },
    ]);
    const first = definition("corelib.first", emptyContributions(), [
      { pluginId: "corelib.second", version: "^1.0.0", optional: false },
    ]);
    const second = definition("corelib.second", emptyContributions(), [
      { pluginId: "corelib.first", version: "^1.0.0", optional: false },
    ]);

    expect(
      issueCodes({
        pluginApiVersion: "1.0.0",
        coreContributions: [],
        plugins: [direct, first, second],
      }),
    ).toEqual(["dependency_cycle", "dependency_cycle"]);
  });

  it("reports duplicate contribution ownership across Core and plugins", () => {
    const contributions = {
      ...emptyContributions(),
      searchProviders: [
        { id: "search.documents", group: "Documents", bindingId: "search.documents" },
      ],
    } satisfies PluginManifest["contributions"];

    expect(
      issueCodes({
        pluginApiVersion: "1.0.0",
        coreContributions: [
          {
            ownerId: "search",
            contributions,
            declaredBindings: ["search.documents"],
          },
        ],
        plugins: [definition("corelib.library", contributions)],
      }),
    ).toEqual(["duplicate_contribution_id"]);
  });

  it("reports missing and owner-undeclared executable bindings", () => {
    const contributions = {
      ...emptyContributions(),
      commands: [
        {
          id: "action.example",
          title: "Example",
          aliases: [],
          breadcrumb: ["Example"],
          group: "Actions",
          audiences: ["human"],
          effect: "write",
          bindingId: "action.example",
        },
      ],
    } satisfies PluginManifest["contributions"];
    const plugin: PluginDefinition = {
      ...definition("corelib.example", contributions),
      declaredBindings: ["action.someone-elses"],
    };

    expect(
      registryIssues({
        pluginApiVersion: "1.0.0",
        coreContributions: [],
        plugins: [plugin],
      }),
    ).toEqual([
      expect.objectContaining({
        code: "missing_binding",
        path: "/plugins/0/contributions/commands/0/bindingId",
        contributionId: "action.example",
      }),
      expect.objectContaining({
        code: "undeclared_binding",
        path: "/plugins/0/declaredBindings/0",
      }),
    ]);
  });
});
