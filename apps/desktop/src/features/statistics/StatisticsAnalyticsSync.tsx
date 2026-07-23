import { useEffect, useRef, useCallback } from "react";
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAccountRef = useRef<{ accountId: string | null; enabled: boolean }>({
    accountId,
    enabled,
  });
  activeAccountRef.current = { accountId, enabled };

  const isActiveAccount = useCallback(
    () =>
      activeAccountRef.current.accountId === accountId &&
      activeAccountRef.current.enabled &&
      accountId !== null,
    [accountId],
  );

  const doSync = useCallback(async () => {
    if (!enabled || !accountId || !isActiveAccount()) return;

    let state = readState(accountId);
    if (!state) {
      state = {
        consentStartedAt: new Date().toISOString(),
        lastSyncAt: null,
      };
      writeState(accountId, state);
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
        if (!isActiveAccount()) return;
        await accountApi.upsertDailyStatistics(
          accountId,
          snapshot as DailyStatisticsSnapshot & { schemaVersion: 1 },
        );
      }
      if (!isActiveAccount()) return;
      state.lastSyncAt = new Date().toISOString();
      writeState(accountId, state);
    } catch {
      // Will retry on next interval
    }
  }, [accountId, enabled, accountApi, getSnapshots, isActiveAccount]);

  useEffect(() => {
    clearLegacyState();
    return () => {
      if (activeAccountRef.current.accountId === accountId) {
        activeAccountRef.current = { accountId: null, enabled: false };
      }
      if (accountId) clearState(accountId);
    };
  }, [accountId]);

  useEffect(() => {
    if (!enabled || !accountId) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (accountId) clearState(accountId);
      return;
    }

    doSync();

    timerRef.current = setInterval(doSync, 60000);

    const handleOnline = () => doSync();
    window.addEventListener("online", handleOnline);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      window.removeEventListener("online", handleOnline);
    };
  }, [accountId, enabled, doSync]);

  return null;
}
