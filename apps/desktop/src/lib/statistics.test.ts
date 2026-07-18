import { expect, test, vi } from "vitest";
import { checkpointActivitySession, getStatisticsOverview } from "./statistics";

test("uses the typed Tauri statistics contract", async () => {
  const call = vi.fn().mockResolvedValue({
    activeMs: 0,
    readingActiveMs: 0,
    memoraActiveMs: 0,
    currentStreak: 0,
    activeDays: 0,
    buckets: [],
  });
  await getStatisticsOverview("30d", call);
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
    range: "30d",
  });
  expect(call).toHaveBeenNthCalledWith(2, "checkpoint_activity_session", {
    input: expect.objectContaining({ sessionId: "s1", activeMs: 15000 }),
  });
});
