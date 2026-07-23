import { useEffect, useRef, useCallback, useLayoutEffect } from "react";
import type {
  DailySnapshotQuery,
  DailyStatisticsSnapshot,
} from "../../domain/statistics";
import { getDailyStatisticsSnapshots } from "../../lib/statistics";
import type { AccountApi } from "../../domain/account";

const LEGACY_STORAGE_KEY = "library.statistics.analytics-sync.v1";
const STORAGE_KEY_PREFIX = "library.statistics.analytics-sync.v2.";

interface SyncState {
  consentStartedAt: string;
  lastSyncAt: string | null;
}

function getStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function storageKey(accountId: string): string {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(accountId)}`;
}

function readState(accountId: string): SyncState | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(storageKey(accountId));
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    if (
      typeof state?.consentStartedAt !== "string" ||
      (state.lastSyncAt !== null && typeof state.lastSyncAt !== "string")
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function writeState(accountId: string, state: SyncState): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(storageKey(accountId), JSON.stringify(state));
}

function clearState(accountId: string): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(storageKey(accountId));
}

function clearLegacyState(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(LEGACY_STORAGE_KEY);
}

interface StatisticsAnalyticsSyncProps {
  accountId: string | null;
  enabled: boolean;
  accountApi: AccountApi;
  getSnapshots?: typeof getDailyStatisticsSnapshots;
}

function getLocalDay(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .split("T")[0];
}

export function StatisticsAnalyticsSync({
  accountId,
  enabled,
  accountApi,
  getSnapshots = getDailyStatisticsSnapshots,
}: StatisticsAnalyticsSyncProps) {
  const generationRef = useRef(0);
  const activeSyncRef = useRef({
    accountId: null as string | null,
    enabled: false,
    generation: 0,
  });
  const stateAccountRef = useRef<string | null>(null);

  const isCurrentGeneration = useCallback(
    (syncAccountId: string, generation: number) => {
      const activeSync = activeSyncRef.current;
      return (
        activeSync.accountId === syncAccountId &&
        activeSync.enabled &&
        activeSync.generation === generation
      );
    },
    [],
  );

  const doSync = useCallback(
    async (syncAccountId: string, generation: number) => {
      if (!isCurrentGeneration(syncAccountId, generation)) return;

      let state = readState(syncAccountId);
      if (!state) {
        state = {
          consentStartedAt: new Date().toISOString(),
          lastSyncAt: null,
        };
        writeState(syncAccountId, state);
      }

      const fromLocalDay = getLocalDay(
        new Date(state.lastSyncAt ?? state.consentStartedAt),
      );

      const query: DailySnapshotQuery = {
        consentStartedAt: state.consentStartedAt,
        fromLocalDay,
      };

      try {
        const snapshots = await getSnapshots(query);
        for (const snapshot of snapshots) {
          if (!isCurrentGeneration(syncAccountId, generation)) return;
          await accountApi.upsertDailyStatistics(
            syncAccountId,
            snapshot as DailyStatisticsSnapshot & { schemaVersion: 1 },
          );
        }
        if (!isCurrentGeneration(syncAccountId, generation)) return;
        state.lastSyncAt = new Date().toISOString();
        writeState(syncAccountId, state);
      } catch {
        // Will retry on next interval
      }
    },
    [accountApi, getSnapshots, isCurrentGeneration],
  );

  useLayoutEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    activeSyncRef.current = { accountId, enabled, generation };

    return () => {
      if (activeSyncRef.current.generation !== generation) return;
      generationRef.current += 1;
      activeSyncRef.current = {
        accountId: null,
        enabled: false,
        generation: generationRef.current,
      };
    };
  }, [accountId, enabled, doSync]);

  useEffect(() => {
    const previousAccountId = stateAccountRef.current;
    if (previousAccountId && previousAccountId !== accountId) {
      clearState(previousAccountId);
    }
    if (accountId && !enabled) clearState(accountId);
    clearLegacyState();
    stateAccountRef.current = accountId;

    if (!enabled || !accountId) return;

    const generation = activeSyncRef.current.generation;

    const syncCurrentGeneration = () => {
      void doSync(accountId, generation);
    };
    syncCurrentGeneration();

    const timer = window.setInterval(syncCurrentGeneration, 60000);
    window.addEventListener("online", syncCurrentGeneration);

    return () => {
      clearInterval(timer);
      window.removeEventListener("online", syncCurrentGeneration);
    };
  }, [accountId, enabled, doSync]);

  return null;
}
