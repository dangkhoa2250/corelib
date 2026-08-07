import type {
  CoreContributionDefinition,
  PluginDefinition,
  PluginRegistry,
  RegisteredPlugin,
} from "./registry";
import { createPluginRegistry } from "./registry";
import {
  type PluginLifecycleAccountState,
  type PluginLifecyclePersistedState,
  type PluginLifecycleStateStore,
} from "./lifecycleState";

export { createMemoryPluginLifecycleStateStore } from "./lifecycleState";

export interface InstalledPluginDefinition {
  readonly definition: PluginDefinition;
  readonly defaultEnabled: boolean;
}

export interface PluginLifecycleSnapshot {
  readonly accountId: string;
  readonly revision: number;
  readonly knownPluginIds: readonly string[];
  readonly enabledPluginIds: readonly string[];
  readonly pinnedSurfaceIds: readonly string[];
  readonly visiblePinnedSurfaceIds: readonly string[];
  readonly installedPlugins: readonly PluginLifecyclePluginStatus[];
  readonly registry: PluginRegistry;
  isEnabled(pluginId: string): boolean;
  isIntegrationAvailable(pluginId: string, dependencyPluginId: string): boolean;
}

export interface PluginLifecyclePluginStatus {
  readonly manifest: RegisteredPlugin;
  readonly status: "enabled" | "disabled" | "new";
}

export interface PluginLifecycleOperationContext {
  readonly activePluginId?: string;
  readonly unsavedWorkPluginIds?: readonly string[];
  readonly activeWorkPluginIds?: readonly string[];
}

export type PluginLifecycleChange =
  | { readonly kind: "enable-plugin"; readonly pluginId: string }
  | {
      readonly kind: "disable-plugin";
      readonly pluginId: string;
      readonly context?: PluginLifecycleOperationContext;
      readonly confirmationGranted?: boolean;
    }
  | { readonly kind: "pin-surface"; readonly surfaceId: string }
  | { readonly kind: "unpin-surface"; readonly surfaceId: string }
  | {
      readonly kind: "reorder-surface";
      readonly surfaceId: string;
      readonly beforeSurfaceId: string | null;
    };

export type PluginLifecycleConfirmationReasonCode =
  | "cascade"
  | "active-plugin"
  | "unsaved-work"
  | "active-work";

export interface PluginLifecycleConfirmationReason {
  readonly code: PluginLifecycleConfirmationReasonCode;
  readonly pluginIds: readonly string[];
}

export interface PluginLifecyclePlan {
  readonly accountId: string;
  readonly baseRevision: number;
  readonly change: PluginLifecycleChange;
  readonly affectedPluginIds: readonly string[];
  readonly confirmationReasons: readonly PluginLifecycleConfirmationReason[];
  readonly proposedState: PluginLifecycleAccountState;
}

export type PluginLifecycleIssueCode =
  | "not_loaded"
  | "unknown_plugin"
  | "unknown_surface"
  | "core_contribution"
  | "surface_not_pinned"
  | "confirmation_required"
  | "invalid_plan"
  | "stale_plan";

export interface PluginLifecycleIssue {
  readonly code: PluginLifecycleIssueCode;
  readonly message: string;
  readonly pluginId?: string;
  readonly surfaceId?: string;
}

export class PluginLifecycleError extends Error {
  readonly issues: readonly PluginLifecycleIssue[];

  constructor(issues: readonly PluginLifecycleIssue[]) {
    super(`Plugin lifecycle operation failed with ${issues.length} issue(s).`);
    this.name = "PluginLifecycleError";
    this.issues = Object.freeze([...issues]);
  }
}

export interface PluginLifecycle {
  load(accountId: string): Promise<PluginLifecycleSnapshot>;
  plan(change: PluginLifecycleChange): PluginLifecyclePlan;
  apply(plan: PluginLifecyclePlan): Promise<PluginLifecycleSnapshot>;
}

export interface CreatePluginLifecycleOptions {
  readonly pluginApiVersion: string;
  readonly coreContributions: readonly CoreContributionDefinition[];
  readonly installedPlugins: readonly InstalledPluginDefinition[];
  readonly store: PluginLifecycleStateStore;
}

function pluginIdOf(definition: PluginDefinition): string {
  return (definition.manifest as { id: string }).id;
}

function freezeAccountState(state: PluginLifecycleAccountState): PluginLifecycleAccountState {
  return Object.freeze({
    revision: state.revision,
    knownPluginIds: Object.freeze([...state.knownPluginIds]),
    enabledPluginIds: Object.freeze([...state.enabledPluginIds]),
    navigation: Object.freeze({
      pinnedSurfaceIds: Object.freeze([...state.navigation.pinnedSurfaceIds]),
    }),
  });
}

function freezeChange(change: PluginLifecycleChange): PluginLifecycleChange {
  if (change.kind !== "disable-plugin" || !change.context) {
    return Object.freeze({ ...change });
  }
  return Object.freeze({
    ...change,
    context: Object.freeze({
      ...change.context,
      unsavedWorkPluginIds: change.context.unsavedWorkPluginIds
        ? Object.freeze([...change.context.unsavedWorkPluginIds])
        : undefined,
      activeWorkPluginIds: change.context.activeWorkPluginIds
        ? Object.freeze([...change.context.activeWorkPluginIds])
        : undefined,
    }),
  });
}

function replaceAccount(
  state: PluginLifecyclePersistedState,
  accountId: string,
  account: PluginLifecycleAccountState,
): PluginLifecyclePersistedState {
  return {
    ...state,
    accounts: {
      ...state.accounts,
      [accountId]: account,
    },
  };
}

export function createPluginLifecycle(options: CreatePluginLifecycleOptions): PluginLifecycle {
  const installedRegistry = createPluginRegistry({
    pluginApiVersion: options.pluginApiVersion,
    coreContributions: options.coreContributions,
    plugins: options.installedPlugins.map(({ definition }) => definition),
  });
  const installedPluginIds = options.installedPlugins.map(({ definition }) =>
    pluginIdOf(definition),
  );
  const manifestsById = new Map(
    installedRegistry.listPlugins().map((manifest) => [manifest.id, manifest]),
  );
  const installedSurfacesById = new Map(
    installedRegistry.listSurfaces().map((surface) => [surface.id, surface]),
  );
  const definitionsById = new Map(
    options.installedPlugins.map(({ definition }) => [pluginIdOf(definition), definition]),
  );
  const defaultsById = new Map(
    options.installedPlugins.map(({ definition, defaultEnabled }) => [
      pluginIdOf(definition),
      defaultEnabled,
    ]),
  );
  const requiredDependentsById = new Map<string, string[]>();
  installedRegistry.listPlugins().forEach((manifest) => {
    manifest.dependencies
      .filter((dependency) => !dependency.optional)
      .forEach((dependency) => {
        const dependents = requiredDependentsById.get(dependency.pluginId) ?? [];
        dependents.push(manifest.id);
        dependents.sort((left, right) => left.localeCompare(right));
        requiredDependentsById.set(dependency.pluginId, dependents);
      });
  });

  let currentSnapshot: PluginLifecycleSnapshot | null = null;
  let currentState: PluginLifecyclePersistedState | null = null;
  let currentAccount: PluginLifecycleAccountState | null = null;
  let currentNewPluginIds = new Set<string>();
  const issuedPlans = new WeakSet<object>();

  const snapshotFrom = (
    accountId: string,
    account: PluginLifecycleAccountState,
  ): PluginLifecycleSnapshot => {
    const enabledPluginIds = installedPluginIds.filter((pluginId) =>
      account.enabledPluginIds.includes(pluginId),
    );
    const registry = createPluginRegistry({
      pluginApiVersion: options.pluginApiVersion,
      coreContributions: options.coreContributions,
      plugins: enabledPluginIds.map((pluginId) => definitionsById.get(pluginId)!),
    });
    const enabledPluginIdSet = new Set(enabledPluginIds);
    const visiblePinnedSurfaceIds = account.navigation.pinnedSurfaceIds.filter((surfaceId) => {
      const owner = registry.ownerOf(surfaceId);
      return owner?.kind === "plugin" || owner?.kind === "core-service";
    });
    const installedPlugins = installedPluginIds.map((pluginId) =>
      Object.freeze({
        manifest: manifestsById.get(pluginId)!,
        status: currentNewPluginIds.has(pluginId)
          ? ("new" as const)
          : enabledPluginIdSet.has(pluginId)
            ? ("enabled" as const)
            : ("disabled" as const),
      }),
    );
    return Object.freeze({
      accountId,
      revision: account.revision,
      knownPluginIds: Object.freeze([...account.knownPluginIds]),
      enabledPluginIds: Object.freeze(enabledPluginIds),
      pinnedSurfaceIds: Object.freeze([...account.navigation.pinnedSurfaceIds]),
      visiblePinnedSurfaceIds: Object.freeze(visiblePinnedSurfaceIds),
      installedPlugins: Object.freeze(installedPlugins),
      registry,
      isEnabled: (pluginId: string) => enabledPluginIdSet.has(pluginId),
      isIntegrationAvailable: (pluginId: string, dependencyPluginId: string) =>
        enabledPluginIdSet.has(pluginId) &&
        enabledPluginIdSet.has(dependencyPluginId) &&
        (manifestsById.get(pluginId)?.dependencies.some(
          (dependency) => dependency.pluginId === dependencyPluginId,
        ) ?? false),
    });
  };

  const requireLoaded = () => {
    if (!currentSnapshot || !currentState || !currentAccount) {
      throw new PluginLifecycleError([
        { code: "not_loaded", message: "PluginLifecycle must be loaded first." },
      ]);
    }
    return {
      snapshot: currentSnapshot,
      state: currentState,
      account: currentAccount,
    };
  };

  return {
    async load(accountId) {
      let state = await options.store.load();
      let account = state.accounts[accountId];
      let newlyKnownPluginIds: readonly string[] = [];
      if (!account) {
        const enabledPluginIds = installedPluginIds.filter(
          (pluginId) => defaultsById.get(pluginId) === true,
        );
        const enabled = new Set(enabledPluginIds);
        const pinnedSurfaceIds = installedRegistry
          .listSurfaces()
          .filter(
            (surface) =>
              surface.owner.kind === "plugin" &&
              enabled.has(surface.owner.id) &&
              surface.navigation?.defaultPinned === true,
          )
          .map(({ id }) => id);
        account = freezeAccountState({
          revision: 0,
          knownPluginIds: installedPluginIds,
          enabledPluginIds,
          navigation: { pinnedSurfaceIds },
        });
        state = replaceAccount(state, accountId, account);
        await options.store.save(state);
      } else {
        newlyKnownPluginIds = installedPluginIds.filter(
          (pluginId) => !account.knownPluginIds.includes(pluginId),
        );
        if (newlyKnownPluginIds.length > 0) {
          account = freezeAccountState({
            ...account,
            revision: account.revision + 1,
            knownPluginIds: [...account.knownPluginIds, ...newlyKnownPluginIds],
          });
          state = replaceAccount(state, accountId, account);
          await options.store.save(state);
        }
      }
      currentState = state;
      currentAccount = account;
      currentNewPluginIds = new Set(newlyKnownPluginIds);
      currentSnapshot = snapshotFrom(accountId, account);
      return currentSnapshot;
    },
    plan(change) {
      const { snapshot, account } = requireLoaded();
      const enabledPluginIds = new Set(account.enabledPluginIds);
      const pinnedSurfaceIds = [...account.navigation.pinnedSurfaceIds];
      const affectedPluginIds: string[] = [];
      if (change.kind === "enable-plugin" || change.kind === "disable-plugin") {
        if (!installedPluginIds.includes(change.pluginId)) {
          throw new PluginLifecycleError([
            {
              code: "unknown_plugin",
              message: `Unknown Plugin: ${change.pluginId}`,
              pluginId: change.pluginId,
            },
          ]);
        }
      }
      if (change.kind === "enable-plugin") {
        const enableWithRequiredDependencies = (pluginId: string) => {
          const manifest = manifestsById.get(pluginId)!;
          manifest.dependencies
            .filter((dependency) => !dependency.optional)
            .sort((left, right) => left.pluginId.localeCompare(right.pluginId))
            .forEach((dependency) => enableWithRequiredDependencies(dependency.pluginId));
          if (!enabledPluginIds.has(pluginId)) {
            enabledPluginIds.add(pluginId);
            affectedPluginIds.push(pluginId);
          }
        };
        enableWithRequiredDependencies(change.pluginId);
      } else if (change.kind === "disable-plugin") {
        const disableWithRequiredDependents = (pluginId: string) => {
          (requiredDependentsById.get(pluginId) ?? []).forEach((dependentId) => {
            if (enabledPluginIds.has(dependentId)) {
              disableWithRequiredDependents(dependentId);
            }
          });
          if (enabledPluginIds.delete(pluginId)) {
            affectedPluginIds.push(pluginId);
          }
        };
        disableWithRequiredDependents(change.pluginId);
      } else {
        const requirePluginSurface = (surfaceId: string) => {
          const surface = installedSurfacesById.get(surfaceId);
          if (!surface) {
            throw new PluginLifecycleError([
              {
                code: "unknown_surface",
                message: `Unknown Surface: ${surfaceId}`,
                surfaceId,
              },
            ]);
          }
          if (surface.owner.kind === "core-service") {
            throw new PluginLifecycleError([
              {
                code: "core_contribution",
                message: `Core Surface navigation cannot be changed: ${surfaceId}`,
                surfaceId,
              },
            ]);
          }
          return surface;
        };
        requirePluginSurface(change.surfaceId);
        const currentIndex = pinnedSurfaceIds.indexOf(change.surfaceId);
        if (change.kind === "pin-surface") {
          if (currentIndex < 0) pinnedSurfaceIds.push(change.surfaceId);
        } else if (change.kind === "unpin-surface") {
          if (currentIndex >= 0) pinnedSurfaceIds.splice(currentIndex, 1);
        } else {
          if (currentIndex < 0) {
            throw new PluginLifecycleError([
              {
                code: "surface_not_pinned",
                message: `Surface is not pinned: ${change.surfaceId}`,
                surfaceId: change.surfaceId,
              },
            ]);
          }
          if (change.beforeSurfaceId !== null) {
            requirePluginSurface(change.beforeSurfaceId);
            if (!pinnedSurfaceIds.includes(change.beforeSurfaceId)) {
              throw new PluginLifecycleError([
                {
                  code: "surface_not_pinned",
                  message: `Target Surface is not pinned: ${change.beforeSurfaceId}`,
                  surfaceId: change.beforeSurfaceId,
                },
              ]);
            }
          }
          if (change.beforeSurfaceId !== change.surfaceId) {
            pinnedSurfaceIds.splice(currentIndex, 1);
            const targetIndex =
              change.beforeSurfaceId === null
                ? pinnedSurfaceIds.length
                : pinnedSurfaceIds.indexOf(change.beforeSurfaceId);
            pinnedSurfaceIds.splice(targetIndex, 0, change.surfaceId);
          }
        }
      }
      const proposedEnabledPluginIds = installedPluginIds.filter((pluginId) =>
        enabledPluginIds.has(pluginId),
      );
      const pluginStateChanged =
        proposedEnabledPluginIds.length !== account.enabledPluginIds.length ||
        proposedEnabledPluginIds.some(
          (pluginId, index) => pluginId !== account.enabledPluginIds[index],
        );
      const navigationChanged =
        pinnedSurfaceIds.length !== account.navigation.pinnedSurfaceIds.length ||
        pinnedSurfaceIds.some(
          (surfaceId, index) => surfaceId !== account.navigation.pinnedSurfaceIds[index],
        );
      const changed = pluginStateChanged || navigationChanged;
      const proposedState = freezeAccountState({
        ...account,
        revision: changed ? account.revision + 1 : account.revision,
        enabledPluginIds: proposedEnabledPluginIds,
        navigation: { pinnedSurfaceIds },
      });
      const confirmationReasons: PluginLifecycleConfirmationReason[] = [];
      if (change.kind === "disable-plugin" && affectedPluginIds.length > 1) {
        confirmationReasons.push({
          code: "cascade",
          pluginIds: affectedPluginIds.filter((pluginId) => pluginId !== change.pluginId),
        });
      }
      if (change.kind === "disable-plugin" && change.context) {
        if (
          change.context.activePluginId &&
          affectedPluginIds.includes(change.context.activePluginId)
        ) {
          confirmationReasons.push({
            code: "active-plugin",
            pluginIds: [change.context.activePluginId],
          });
        }
        const unsavedWorkPluginIds = (change.context.unsavedWorkPluginIds ?? []).filter(
          (pluginId) => affectedPluginIds.includes(pluginId),
        );
        if (unsavedWorkPluginIds.length > 0) {
          confirmationReasons.push({ code: "unsaved-work", pluginIds: unsavedWorkPluginIds });
        }
        const activeWorkPluginIds = (change.context.activeWorkPluginIds ?? []).filter(
          (pluginId) => affectedPluginIds.includes(pluginId),
        );
        if (activeWorkPluginIds.length > 0) {
          confirmationReasons.push({ code: "active-work", pluginIds: activeWorkPluginIds });
        }
      }
      const plan: PluginLifecyclePlan = Object.freeze({
        accountId: snapshot.accountId,
        baseRevision: snapshot.revision,
        change: freezeChange(change),
        affectedPluginIds: Object.freeze(changed ? affectedPluginIds : []),
        confirmationReasons: Object.freeze(
          confirmationReasons.map((reason) =>
            Object.freeze({ ...reason, pluginIds: Object.freeze([...reason.pluginIds]) }),
          ),
        ),
        proposedState,
      });
      issuedPlans.add(plan);
      return plan;
    },
    async apply(plan) {
      const { snapshot, state } = requireLoaded();
      if (!issuedPlans.has(plan)) {
        throw new PluginLifecycleError([
          { code: "invalid_plan", message: "The lifecycle plan was not issued by this Module." },
        ]);
      }
      if (plan.accountId !== snapshot.accountId || plan.baseRevision !== snapshot.revision) {
        throw new PluginLifecycleError([
          { code: "stale_plan", message: "The lifecycle plan is stale." },
        ]);
      }
      if (
        plan.confirmationReasons.length > 0 &&
        !(
          plan.change.kind === "disable-plugin" && plan.change.confirmationGranted === true
        )
      ) {
        throw new PluginLifecycleError([
          {
            code: "confirmation_required",
            message: "This lifecycle change requires explicit confirmation.",
          },
        ]);
      }
      if (plan.proposedState.revision !== plan.baseRevision) {
        const nextState = replaceAccount(state, snapshot.accountId, plan.proposedState);
        await options.store.save(nextState);
        currentState = nextState;
      }
      currentAccount = plan.proposedState;
      currentSnapshot = snapshotFrom(snapshot.accountId, plan.proposedState);
      return currentSnapshot;
    },
  };
}
