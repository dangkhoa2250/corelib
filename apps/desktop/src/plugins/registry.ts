import { satisfies, valid } from "semver";

import {
  type PluginManifest,
  type PluginManifestValidationIssueCode,
  validatePluginManifest,
} from "./manifest";

export type SurfaceDeclaration = PluginManifest["contributions"]["surfaces"][number];
export type CommandDeclaration = PluginManifest["contributions"]["commands"][number];
export type SearchProviderDeclaration =
  PluginManifest["contributions"]["searchProviders"][number];
export type ResourceDeclaration = PluginManifest["contributions"]["resources"][number];
export type EventDeclaration = PluginManifest["contributions"]["events"][number];

export type ContributionOwner =
  | { readonly kind: "core-service"; readonly id: string }
  | { readonly kind: "plugin"; readonly id: string };

export interface PluginDefinition {
  readonly manifest: unknown;
  readonly declaredBindings: readonly string[];
}

export interface CoreContributionDefinition {
  readonly ownerId: string;
  readonly contributions: PluginManifest["contributions"];
  readonly declaredBindings: readonly string[];
}

export interface RegistryInput {
  readonly pluginApiVersion: string;
  readonly coreContributions: readonly CoreContributionDefinition[];
  readonly plugins: readonly PluginDefinition[];
}

export type RegisteredPlugin = Readonly<PluginManifest>;
export type RegisteredSurface = Readonly<SurfaceDeclaration & { owner: ContributionOwner }>;
export type RegisteredCommand = Readonly<CommandDeclaration & { owner: ContributionOwner }>;
export type RegisteredSearchProvider = Readonly<
  SearchProviderDeclaration & { owner: ContributionOwner }
>;

export type PluginRegistryIssueCode =
  | PluginManifestValidationIssueCode
  | "invalid_plugin_api_version"
  | "duplicate_plugin_id"
  | "incompatible_plugin_api"
  | "missing_dependency"
  | "incompatible_dependency"
  | "dependency_cycle"
  | "duplicate_contribution_id"
  | "missing_binding"
  | "undeclared_binding";

export interface PluginRegistryIssue {
  readonly code: PluginRegistryIssueCode;
  readonly path: string;
  readonly message: string;
  readonly pluginId?: string;
  readonly contributionId?: string;
}

export class PluginRegistryValidationError extends Error {
  readonly issues: readonly PluginRegistryIssue[];

  constructor(issues: readonly PluginRegistryIssue[]) {
    super(`Plugin registry validation failed with ${issues.length} issue(s).`);
    this.name = "PluginRegistryValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

export interface PluginRegistry {
  listPlugins(): readonly RegisteredPlugin[];
  listSurfaces(): readonly RegisteredSurface[];
  listCommands(): readonly RegisteredCommand[];
  listSearchProviders(): readonly RegisteredSearchProvider[];
  ownerOf(id: string): ContributionOwner | null;
}

type ContributionCollection = PluginManifest["contributions"];

interface ValidPluginDefinition {
  manifest: PluginManifest;
  declaredBindings: readonly string[];
  inputIndex: number;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((child) => deepFreeze(child));
  }
  return value;
}

function contributionEntries(contributions: ContributionCollection) {
  return [
    ...contributions.surfaces.map((value, index) => ({ category: "surfaces", index, value } as const)),
    ...contributions.commands.map((value, index) => ({ category: "commands", index, value } as const)),
    ...contributions.searchProviders.map(
      (value, index) => ({ category: "searchProviders", index, value } as const),
    ),
    ...contributions.resources.map((value, index) => ({ category: "resources", index, value } as const)),
    ...contributions.events.map((value, index) => ({ category: "events", index, value } as const)),
  ];
}

function executableEntries(contributions: ContributionCollection) {
  return [
    ...contributions.surfaces.map((value, index) => ({ category: "surfaces", index, value } as const)),
    ...contributions.commands.map((value, index) => ({ category: "commands", index, value } as const)),
    ...contributions.searchProviders.map(
      (value, index) => ({ category: "searchProviders", index, value } as const),
    ),
  ];
}

function validateBindings(
  contributions: ContributionCollection,
  declaredBindings: readonly string[],
  basePath: string,
  owner: ContributionOwner,
  issues: PluginRegistryIssue[],
) {
  const executable = executableEntries(contributions);
  const usedBindings = new Set(executable.map(({ value }) => value.bindingId));

  executable.forEach(({ category, index, value }) => {
    if (!declaredBindings.includes(value.bindingId)) {
      issues.push({
        code: "missing_binding",
        path: `${basePath}/contributions/${category}/${index}/bindingId`,
        message: `No binding was declared for ${value.id}.`,
        pluginId: owner.kind === "plugin" ? owner.id : undefined,
        contributionId: value.id,
      });
    }
  });

  declaredBindings.forEach((bindingId, index) => {
    if (!usedBindings.has(bindingId)) {
      issues.push({
        code: "undeclared_binding",
        path: `${basePath}/declaredBindings/${index}`,
        message: `Binding ${bindingId} is not used by a contribution from its owner.`,
        pluginId: owner.kind === "plugin" ? owner.id : undefined,
      });
    }
  });
}

export function createPluginRegistry(input: RegistryInput): PluginRegistry {
  const issues: PluginRegistryIssue[] = [];
  const validPlugins: ValidPluginDefinition[] = [];

  if (!valid(input.pluginApiVersion)) {
    issues.push({
      code: "invalid_plugin_api_version",
      path: "/pluginApiVersion",
      message: `Host Plugin API version is not valid semver: ${input.pluginApiVersion}`,
    });
  }

  input.plugins.forEach((definition, index) => {
    const result = validatePluginManifest(definition.manifest);
    if (!result.ok) {
      result.issues.forEach((issue) => {
        issues.push({
          ...issue,
          path: `/plugins/${index}/manifest${issue.path === "/" ? "" : issue.path}`,
        });
      });
      return;
    }
    validPlugins.push({
      manifest: result.manifest,
      declaredBindings: definition.declaredBindings,
      inputIndex: index,
    });
  });

  const pluginsById = new Map<string, ValidPluginDefinition>();
  validPlugins.forEach((definition) => {
    const pluginId = definition.manifest.id;
    if (pluginsById.has(pluginId)) {
      issues.push({
        code: "duplicate_plugin_id",
        path: `/plugins/${definition.inputIndex}/manifest/id`,
        message: `Plugin ID is already registered: ${pluginId}`,
        pluginId,
      });
    } else {
      pluginsById.set(pluginId, definition);
    }
    if (
      valid(input.pluginApiVersion) &&
      !satisfies(input.pluginApiVersion, definition.manifest.compatibility.pluginApi)
    ) {
      issues.push({
        code: "incompatible_plugin_api",
        path: `/plugins/${definition.inputIndex}/manifest/compatibility/pluginApi`,
        message: `${pluginId} does not support Plugin API ${input.pluginApiVersion}.`,
        pluginId,
      });
    }
  });

  validPlugins.forEach((definition) => {
    const { manifest } = definition;
    manifest.dependencies.forEach((dependency, dependencyIndex) => {
      const installed = pluginsById.get(dependency.pluginId);
      if (!installed) {
        if (!dependency.optional) {
          issues.push({
            code: "missing_dependency",
            path: `/plugins/${definition.inputIndex}/manifest/dependencies/${dependencyIndex}`,
            message: `${manifest.id} requires ${dependency.pluginId}.`,
            pluginId: manifest.id,
          });
        }
        return;
      }
      if (!satisfies(installed.manifest.version, dependency.version)) {
        issues.push({
          code: "incompatible_dependency",
          path: `/plugins/${definition.inputIndex}/manifest/dependencies/${dependencyIndex}/version`,
          message: `${installed.manifest.id} ${installed.manifest.version} does not satisfy ${dependency.version}.`,
          pluginId: manifest.id,
        });
      }
    });
  });

  const visitState = new Map<string, "visiting" | "visited">();
  const stack: string[] = [];
  const reportedCycles = new Set<string>();
  const visit = (pluginId: string) => {
    visitState.set(pluginId, "visiting");
    stack.push(pluginId);
    const definition = pluginsById.get(pluginId);
    const dependencies = definition?.manifest.dependencies
      .filter((dependency) => pluginsById.has(dependency.pluginId))
      .map((dependency) => dependency.pluginId)
      .sort() ?? [];
    dependencies.forEach((dependencyId) => {
      if (visitState.get(dependencyId) === "visiting") {
        const cycleStart = stack.indexOf(dependencyId);
        const cycle = [...stack.slice(cycleStart), dependencyId];
        const cycleKey = [...new Set(cycle)].sort().join("|");
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          issues.push({
            code: "dependency_cycle",
            path: `/plugins/${definition?.inputIndex ?? 0}/manifest/dependencies`,
            message: `Plugin dependency cycle: ${cycle.join(" -> ")}`,
            pluginId,
          });
        }
      } else if (!visitState.has(dependencyId)) {
        visit(dependencyId);
      }
    });
    stack.pop();
    visitState.set(pluginId, "visited");
  };
  [...pluginsById.keys()].sort().forEach((pluginId) => {
    if (!visitState.has(pluginId)) visit(pluginId);
  });

  const owners = new Map<string, ContributionOwner>();
  const surfaces: RegisteredSurface[] = [];
  const commands: RegisteredCommand[] = [];
  const searchProviders: RegisteredSearchProvider[] = [];

  const registerContributions = (
    contributions: ContributionCollection,
    owner: ContributionOwner,
    basePath: string,
  ) => {
    contributionEntries(contributions).forEach(({ category, index, value }) => {
      if (owners.has(value.id)) {
        issues.push({
          code: "duplicate_contribution_id",
          path: `${basePath}/contributions/${category}/${index}/id`,
          message: `Contribution ID is already registered: ${value.id}`,
          pluginId: owner.kind === "plugin" ? owner.id : undefined,
          contributionId: value.id,
        });
        return;
      }
      owners.set(value.id, owner);
    });
    contributions.surfaces.forEach((surface) => surfaces.push({ ...surface, owner }));
    contributions.commands.forEach((command) => commands.push({ ...command, owner }));
    contributions.searchProviders.forEach((provider) =>
      searchProviders.push({ ...provider, owner }),
    );
  };

  input.coreContributions.forEach((definition, index) => {
    const owner: ContributionOwner = { kind: "core-service", id: definition.ownerId };
    const basePath = `/coreContributions/${index}`;
    registerContributions(definition.contributions, owner, basePath);
    validateBindings(
      definition.contributions,
      definition.declaredBindings,
      basePath,
      owner,
      issues,
    );
  });

  validPlugins.forEach((definition) => {
    const owner: ContributionOwner = { kind: "plugin", id: definition.manifest.id };
    const basePath = `/plugins/${definition.inputIndex}/manifest`;
    registerContributions(definition.manifest.contributions, owner, basePath);
    validateBindings(
      definition.manifest.contributions,
      definition.declaredBindings,
      `/plugins/${definition.inputIndex}`,
      owner,
      issues,
    );
  });

  if (issues.length > 0) {
    throw new PluginRegistryValidationError(issues);
  }

  const plugins = validPlugins
    .map(({ manifest }) => deepFreeze(manifest))
    .sort((left, right) => left.id.localeCompare(right.id));
  surfaces.sort((left, right) => {
    const leftOrder = left.navigation?.order ?? Number.POSITIVE_INFINITY;
    const rightOrder = right.navigation?.order ?? Number.POSITIVE_INFINITY;
    return leftOrder - rightOrder || left.id.localeCompare(right.id);
  });
  commands.sort((left, right) => left.id.localeCompare(right.id));
  searchProviders.sort((left, right) => left.id.localeCompare(right.id));

  const frozenPlugins = deepFreeze(plugins);
  const frozenSurfaces = deepFreeze(surfaces);
  const frozenCommands = deepFreeze(commands);
  const frozenSearchProviders = deepFreeze(searchProviders);
  owners.forEach((owner) => deepFreeze(owner));

  return Object.freeze({
    listPlugins: () => frozenPlugins,
    listSurfaces: () => frozenSurfaces,
    listCommands: () => frozenCommands,
    listSearchProviders: () => frozenSearchProviders,
    ownerOf: (id: string) => owners.get(id) ?? null,
  });
}
