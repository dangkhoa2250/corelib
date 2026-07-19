import { expect, test, vi } from "vitest";
import {
  checkpointActivitySession,
  getDailyStatisticsSnapshots,
  getDeckStatisticsDetail,
  getDocumentStatistics,
  getMemoraStatistics,
  getReadingStatistics,
  getStatisticsOverview,
} from "./statistics";

test("uses the typed Tauri statistics contract", async () => {
  const call = vi.fn().mockResolvedValue({
    activeMs: 0,
    readingActiveMs: 0,
    memoraActiveMs: 0,
    currentStreak: 0,
    activeDays: 0,
    previousActiveMs: 0,
    previousActiveDays: 0,
    buckets: [],
    activeDayBuckets: [],
    timeBuckets: [],
  });
  const period = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
  await getStatisticsOverview(period, call);
  await getReadingStatistics(period, call);
  await getDocumentStatistics("doc-1", period, call);
  await getMemoraStatistics(period, call);
  await getDeckStatisticsDetail("deck-1", period, call);
  await checkpointActivitySession(
    {
      sessionId: "s1",
      occurredAt: "2026-07-18T00:00:00Z",
      activeMs: 15000,
      documentId: "d1",
      page: 2,
      pageVisitIncrement: 1,
    },
    call,
  );
  expect(call).toHaveBeenNthCalledWith(1, "get_statistics_overview", {
    input: { period },
  });
  expect(call).toHaveBeenNthCalledWith(2, "get_reading_statistics", {
    input: { period },
  });
  expect(call).toHaveBeenNthCalledWith(3, "get_document_statistics", {
    input: { documentId: "doc-1", period },
  });
  expect(call).toHaveBeenNthCalledWith(4, "get_memora_statistics", {
    input: { period },
  });
  expect(call).toHaveBeenNthCalledWith(5, "get_deck_statistics_detail", {
    input: { deckId: "deck-1", period },
  });
  expect(call).toHaveBeenNthCalledWith(6, "checkpoint_activity_session", {
    input: expect.objectContaining({ sessionId: "s1", activeMs: 15000 }),
  });
});

test("getDailyStatisticsSnapshots calls the Tauri command with the query", async () => {
  const call = vi.fn().mockResolvedValue([
    {
      schemaVersion: 1,
      localDay: "2026-07-18",
      appKey: "reading",
      activeMs: 60000,
      activeDay: true,
      sessionCount: 1,
      pageVisitCount: 3,
      uniquePageCount: 2,
    },
  ]);
  const result = await getDailyStatisticsSnapshots(
    { consentStartedAt: "2026-07-01T00:00:00Z", fromLocalDay: "2026-07-18" },
    call,
  );
  expect(call).toHaveBeenCalledWith("get_daily_statistics_snapshots", {
    input: {
      query: { consentStartedAt: "2026-07-01T00:00:00Z", fromLocalDay: "2026-07-18" },
    },
  });
  expect(result).toHaveLength(1);
  expect(result[0].appKey).toBe("reading");
});
