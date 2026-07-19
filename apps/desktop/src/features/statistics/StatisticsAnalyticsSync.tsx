import { useEffect, useRef, useCallback } from "react";
import type {
  DailySnapshotQuery,
  DailyStatisticsSnapshot,
} from "../../domain/statistics";
import { getDailyStatisticsSnapshots } from "../../lib/statistics";
import type { AccountApi } from "../../domain/account";

const STORAGE_KEY = "library.statistics.analytics-sync.v1";

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

function readState(): SyncState | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeState(state: SyncState): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

interface StatisticsAnalyticsSyncProps {
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
  enabled,
  accountApi,
  getSnapshots = getDailyStatisticsSnapshots,
}: StatisticsAnalyticsSyncProps) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doSync = useCallback(async () => {
    if (!enabled) return;

    let state = readState();
    if (!state) {
      state = {
        consentStartedAt: new Date().toISOString(),
        lastSyncAt: null,
      };
      writeState(state);
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
        await accountApi.upsertDailyStatistics(
          snapshot as DailyStatisticsSnapshot & { schemaVersion: 1 },
        );
      }
      state.lastSyncAt = new Date().toISOString();
      writeState(state);
    } catch {
      // Will retry on next interval
    }
  }, [enabled, accountApi, getSnapshots]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      clearState();
      return;
    }

    doSync();

    timerRef.current = setInterval(doSync, 60000);

    const handleOnline = () => doSync();
    window.addEventListener("online", handleOnline);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener("online", handleOnline);
    };
  }, [enabled, doSync]);

  return null;
}
