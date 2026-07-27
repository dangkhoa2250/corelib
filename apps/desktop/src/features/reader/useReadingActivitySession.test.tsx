import { act, render } from "@testing-library/react";
import { afterEach, expect, test, vi, beforeEach } from "vitest";
import { useActiveTimer, type ActiveTimer } from "../statistics/useActiveTimer";
import {
  useReadingActivitySession,
  type StatisticsActivityApi,
} from "./useReadingActivitySession";

vi.mock("../statistics/useActiveTimer", () => ({
  useActiveTimer: vi.fn(),
}));

function mockTimer(activeMs = 0): ActiveTimer & { _snapshotValue: number } {
  let snapshotValue = activeMs;
  return {
    activeMs,
    markActivity: vi.fn(),
    reset: vi.fn(),
    snapshot: () => snapshotValue,
    get _snapshotValue() { return snapshotValue; },
    set _snapshotValue(v: number) { snapshotValue = v; },
  } as unknown as ActiveTimer & { _snapshotValue: number };
}

const MOCK_SESSION_ID = "session-0000-aaaa";

function TestHarness({
  documentId,
  primaryPage,
  api,
  timer: timerOverride,
}: {
  documentId: string;
  primaryPage: number;
  api: StatisticsActivityApi;
  timer?: ActiveTimer;
}) {
  const timer = timerOverride ?? mockTimer(0);
  (useActiveTimer as ReturnType<typeof vi.fn>).mockReturnValue(timer);
  useReadingActivitySession(documentId, primaryPage, api);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue(MOCK_SESSION_ID) });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function makeApi(): StatisticsActivityApi {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    checkpoint: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
  };
}

test("does not start a session when there is no active time", () => {
  const api = makeApi();
  render(<TestHarness documentId="doc-1" primaryPage={1} api={api} />);
  expect(api.start).not.toHaveBeenCalled();
});

test("starts a session on first activity", () => {
  const api = makeApi();
  const timer = mockTimer(0);
  const { rerender } = render(
    <TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />,
  );

  timer.activeMs = 5000;
  rerender(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);

  expect(api.start).toHaveBeenCalledWith({
    id: MOCK_SESSION_ID,
    appKey: "reading",
    activityKind: "reading",
    contextKind: "document",
    contextId: "doc-1",
    occurredAt: "2026-07-18T12:00:00.000Z",
    localDay: "2026-07-18",
    timezoneOffsetMinutes: expect.any(Number),
  });
});

test("starts a session only once even with continued activity", () => {
  const api = makeApi();
  const timer = mockTimer(0);
  const { rerender } = render(
    <TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />,
  );

  timer.activeMs = 5000;
  rerender(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);
  expect(api.start).toHaveBeenCalledTimes(1);

  timer.activeMs = 10000;
  rerender(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);
  expect(api.start).toHaveBeenCalledTimes(1);
});

test("calls checkpoint on every primaryPage change once started", async () => {
  const api = makeApi();
  const timer = mockTimer(0);
  const { rerender } = render(
    <TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />,
  );

  timer.activeMs = 5000;
  timer._snapshotValue = 5000;
  rerender(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);
  await act(async () => Promise.resolve());
  expect(api.start).toHaveBeenCalledTimes(1);

  // Initialization checkpoint fires with increment=0 (same page)
  expect(api.checkpoint).toHaveBeenCalledWith(
    expect.objectContaining({ page: 1, pageVisitIncrement: 0 }),
  );

  rerender(<TestHarness documentId="doc-1" primaryPage={2} api={api} timer={timer} />);
  await act(async () => Promise.resolve());
  expect(api.checkpoint).toHaveBeenLastCalledWith(
    expect.objectContaining({ sessionId: MOCK_SESSION_ID, page: 2, pageVisitIncrement: 1 }),
  );
});

test("increments visit only for a genuine page transition", async () => {
  const api = makeApi();
  const timer = mockTimer(0);
  const { rerender } = render(
    <TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />,
  );

  timer.activeMs = 5000;
  timer._snapshotValue = 5000;
  rerender(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);
  await act(async () => Promise.resolve());

  // Initialization checkpoint always reports same-page (increment=0)
  expect(api.checkpoint).toHaveBeenCalledTimes(1);
  expect(api.checkpoint).toHaveBeenCalledWith(
    expect.objectContaining({ page: 1, pageVisitIncrement: 0 }),
  );

  // Re-render with same page — no additional checkpoint (deps haven't changed)
  rerender(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);
  expect(api.checkpoint).toHaveBeenCalledTimes(1);

  // Genuine page change
  rerender(<TestHarness documentId="doc-1" primaryPage={3} api={api} timer={timer} />);
  await act(async () => Promise.resolve());
  expect(api.checkpoint).toHaveBeenCalledTimes(3);
  expect(api.checkpoint).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 3, pageVisitIncrement: 1 }),
  );
});

test("checkpoints on interval every 15 seconds", async () => {
  const api = makeApi();
  const timer = mockTimer(0);
  render(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);

  timer.activeMs = 5000;
  timer._snapshotValue = 5000;
  // Re-render to trigger start
  render(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);
  await act(async () => Promise.resolve());

  // Initialization checkpoint fires once
  expect(api.checkpoint).toHaveBeenCalledTimes(1);

  timer._snapshotValue = 20000;
  await act(async () => {
    vi.advanceTimersByTime(15_000);
    await Promise.resolve();
  });

  expect(api.checkpoint).toHaveBeenCalledTimes(2);
  expect(api.checkpoint).toHaveBeenLastCalledWith(
    expect.objectContaining({ sessionId: MOCK_SESSION_ID, activeMs: 15000 }),
  );
});

test("finishes session on unmount", async () => {
  const api = makeApi();
  const timer = mockTimer(0);
  const { unmount, rerender } = render(
    <TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />,
  );

  timer.activeMs = 5000;
  rerender(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);

  unmount();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(api.finish).toHaveBeenCalledWith(MOCK_SESSION_ID, expect.any(String));
});

test("does not block the reader when api methods throw", async () => {
  const api = makeApi();
  api.start = vi.fn().mockRejectedValue(new Error("network error"));
  const timer = mockTimer(0);
  const { unmount } = render(
    <TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />,
  );

  timer.activeMs = 5000;
  render(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);

  // Should not throw
  unmount();
});

test("retries an unacknowledged checkpoint without losing its active-time delta", async () => {
  const api = makeApi();
  const checkpoint = vi
    .fn()
    .mockRejectedValueOnce(new Error("temporary write failure"))
    .mockResolvedValue(undefined);
  api.checkpoint = checkpoint;
  const timer = mockTimer(0);
  const { rerender } = render(
    <TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />,
  );

  timer.activeMs = 5_000;
  timer._snapshotValue = 5_000;
  rerender(<TestHarness documentId="doc-1" primaryPage={1} api={api} timer={timer} />);
  await act(async () => Promise.resolve());

  timer._snapshotValue = 20_000;
  await act(async () => {
    vi.advanceTimersByTime(15_000);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(checkpoint).toHaveBeenLastCalledWith(
    expect.objectContaining({ sessionId: MOCK_SESSION_ID, activeMs: 20_000 }),
  );
});
