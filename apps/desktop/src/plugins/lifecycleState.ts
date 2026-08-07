import { PLUGIN_LIFECYCLE_STATE_SCHEMA } from "./lifecycleState.schema";

export const PLUGIN_LIFECYCLE_STATE_SCHEMA_VERSION =
  PLUGIN_LIFECYCLE_STATE_SCHEMA.properties.schemaVersion.const;

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

export interface PluginLifecycleStateNotice {
  readonly code: string;
  readonly message: string;
}

export interface PluginLifecycleStateLoadResult {
  readonly state: PluginLifecyclePersistedState;
  readonly notices: readonly PluginLifecycleStateNotice[];
}

export interface PluginLifecycleStateStore {
  load(): Promise<PluginLifecycleStateLoadResult>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

export function parsePluginLifecycleStateLoadResult(
  candidate: unknown,
): PluginLifecycleStateLoadResult {
  if (!isRecord(candidate) || !isRecord(candidate.state) || !Array.isArray(candidate.notices)) {
    throw new Error("invalid_plugin_lifecycle_state");
  }
  const state = candidate.state;
  if (state.schemaVersion !== PLUGIN_LIFECYCLE_STATE_SCHEMA_VERSION || !isRecord(state.accounts)) {
    throw new Error("invalid_plugin_lifecycle_state");
  }
  const accounts: Record<string, PluginLifecycleAccountState> = {};
  for (const [accountId, value] of Object.entries(state.accounts)) {
    if (
      !isRecord(value) ||
      !Number.isInteger(value.revision) ||
      (value.revision as number) < 0 ||
      !isStringArray(value.knownPluginIds) ||
      !isStringArray(value.enabledPluginIds) ||
      !isRecord(value.navigation) ||
      !isStringArray(value.navigation.pinnedSurfaceIds)
    ) {
      throw new Error("invalid_plugin_lifecycle_state");
    }
    accounts[accountId] = {
      revision: value.revision as number,
      knownPluginIds: [...value.knownPluginIds],
      enabledPluginIds: [...value.enabledPluginIds],
      navigation: { pinnedSurfaceIds: [...value.navigation.pinnedSurfaceIds] },
    };
  }
  const notices = candidate.notices.map((notice) => {
    if (!isRecord(notice) || typeof notice.code !== "string" || typeof notice.message !== "string") {
      throw new Error("invalid_plugin_lifecycle_state");
    }
    return { code: notice.code, message: notice.message };
  });
  return { state: { schemaVersion: 1, accounts }, notices };
}

export function createMemoryPluginLifecycleStateStore(
  initialState: PluginLifecyclePersistedState = createEmptyPluginLifecycleState(),
  initialNotices: readonly PluginLifecycleStateNotice[] = [],
): PluginLifecycleStateStore {
  let state = cloneState(initialState);
  return {
    async load() {
      return {
        state: cloneState(state),
        notices: initialNotices.map((notice) => ({ ...notice })),
      };
    },
    async save(nextState) {
      state = cloneState(nextState);
    },
  };
}
