import { invoke } from "@tauri-apps/api/core";
import type { Invoke } from "./desktop";
import type {
  StatisticsOverview,
  ReadingStatistics,
  DocumentStatistics,
  MemoraStatistics,
  DeckStatisticsDetail,
  StatisticsPeriod,
  StartActivitySessionInput,
  ActivityCheckpointInput,
  FinishActivitySessionInput,
  DailySnapshotQuery,
  DailyStatisticsSnapshot,
} from "../domain/statistics";

export function getStatisticsOverview(
  period: StatisticsPeriod,
  call: Invoke = invoke as Invoke,
): Promise<StatisticsOverview> {
  return call<StatisticsOverview>("get_statistics_overview", { input: { period } });
}

export function getReadingStatistics(
  period: StatisticsPeriod,
  call: Invoke = invoke as Invoke,
): Promise<ReadingStatistics> {
  return call<ReadingStatistics>("get_reading_statistics", { input: { period } });
}

export function getDocumentStatistics(
  documentId: string,
  period: StatisticsPeriod,
  call: Invoke = invoke as Invoke,
): Promise<DocumentStatistics> {
  return call<DocumentStatistics>("get_document_statistics", {
    input: { documentId, period },
  });
}

export function getMemoraStatistics(
  period: StatisticsPeriod,
  call: Invoke = invoke as Invoke,
): Promise<MemoraStatistics> {
  return call<MemoraStatistics>("get_memora_statistics", { input: { period } });
}

export function getDeckStatisticsDetail(
  deckId: string,
  period: StatisticsPeriod,
  call: Invoke = invoke as Invoke,
): Promise<DeckStatisticsDetail> {
  return call<DeckStatisticsDetail>("get_deck_statistics_detail", {
    input: { deckId, period },
  });
}

export function startActivitySession(
  input: StartActivitySessionInput,
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call<void>("start_activity_session", { input });
}

export function checkpointActivitySession(
  input: ActivityCheckpointInput,
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call<void>("checkpoint_activity_session", { input });
}

export function finishActivitySession(
  input: FinishActivitySessionInput,
  call: Invoke = invoke as Invoke,
): Promise<void> {
  return call<void>("finish_activity_session", { input });
}

export function getDailyStatisticsSnapshots(
  query: DailySnapshotQuery,
  call: Invoke = invoke as Invoke,
): Promise<DailyStatisticsSnapshot[]> {
  return call<DailyStatisticsSnapshot[]>("get_daily_statistics_snapshots", {
    input: { query },
  });
}
