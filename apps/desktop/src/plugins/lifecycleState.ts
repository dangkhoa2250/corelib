export const PLUGIN_LIFECYCLE_STATE_SCHEMA_VERSION = 1 as const;

export interface PluginLifecycleAccountState {
  readonly revision: number;
  readonly knownPluginIds: readonly string[];
  readonly enabledPluginIds: readonly string[];
  readonly navigation: {
    readonly pinnedSurfaceIds: readonly string[];
  };
}

export interface PluginLifecyclePersistedState {
  readonly schemaVersion: typeof PLUGIN_LIFECYCLE_STATE_SCHEMA_VERSION;
  readonly accounts: Readonly<Record<string, PluginLifecycleAccountState>>;
}

export interface PluginLifecycleStateStore {
  load(): Promise<PluginLifecyclePersistedState>;
  save(state: PluginLifecyclePersistedState): Promise<void>;
}

export function createEmptyPluginLifecycleState(): PluginLifecyclePersistedState {
  return {
    schemaVersion: PLUGIN_LIFECYCLE_STATE_SCHEMA_VERSION,
    accounts: {},
  };
}

function cloneState(state: PluginLifecyclePersistedState): PluginLifecyclePersistedState {
  return {
    schemaVersion: state.schemaVersion,
    accounts: Object.fromEntries(
      Object.entries(state.accounts).map(([accountId, account]) => [
        accountId,
        {
          revision: account.revision,
          knownPluginIds: [...account.knownPluginIds],
          enabledPluginIds: [...account.enabledPluginIds],
          navigation: { pinnedSurfaceIds: [...account.navigation.pinnedSurfaceIds] },
        },
      ]),
    ),
  };
}

export function createMemoryPluginLifecycleStateStore(
  initialState: PluginLifecyclePersistedState = createEmptyPluginLifecycleState(),
): PluginLifecycleStateStore {
  let state = cloneState(initialState);
  return {
    async load() {
      return cloneState(state);
    },
    async save(nextState) {
      state = cloneState(nextState);
    },
  };
}
