import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { DocumentStatistics, StatisticsPeriod } from "../../../domain/statistics";
import type { LibraryDocument } from "../../../domain/document";
import { DocumentStatisticsPage } from "./DocumentStatisticsPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const period: StatisticsPeriod = {
  unit: "month",
  anchorLocalDay: "2026-07-01",
};

const documentA: LibraryDocument = {
  id: "doc-a",
  title: "Document A",
  author: "Jane Doe",
  source: "local_managed",
  coverUrl: null,
  indexed: true,
  status: "ready",
  lastReadPage: 50,
  numPages: 100,
};

const documentB: LibraryDocument = {
  id: "doc-b",
  title: "Document B",
  author: "John Smith",
  source: "local_managed",
  coverUrl: null,
  indexed: true,
  status: "ready",
  lastReadPage: null,
  numPages: null,
};

const documentStats: DocumentStatistics = {
  documentId: "doc-a",
  activeMs: 0,
  sessionCount: 0,
  averageSessionMs: null,
  pageVisits: 0,
  uniquePages: 0,
  revisits: 0,
  coverage: 0,
  realReviews: 0,
  recallRate: null,
  againCount: 0,
  lapses: 0,
  buckets: [],
  timeBuckets: [
    {
      localDay: "2026-07-01",
      bucketStartHour: 8,
      appKey: "reading",
      activeMs: 1_800_000,
      isFuture: false,
    },
  ],
};

test("loads document data with the document title heading, coverage, reviews, and embedded heatmap", async () => {
  const getDocStats = vi.fn().mockResolvedValue(documentStats);
  render(
    <DocumentStatisticsPage
      document={documentA}
      period={period}
      getDocStats={getDocStats}
    />,
  );

  expect(await screen.findByRole("heading", { name: "Reading" }))
    .toBeInTheDocument();
  expect(screen.getByText("Coverage")).toBeInTheDocument();
  expect(screen.getByText("Reviews")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Statistics app" })).toBeNull();
  expect(getDocStats).toHaveBeenCalledWith("doc-a", period);
});

test("ignores a document response after the selected document changes", async () => {
  const first = deferred<DocumentStatistics>();
  const second = deferred<DocumentStatistics>();
  const getDocStats = vi.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { rerender } = render(
    <DocumentStatisticsPage
      document={documentA}
      period={period}
      getDocStats={getDocStats}
    />,
  );
  rerender(
    <DocumentStatisticsPage
      document={documentB}
      period={period}
      getDocStats={getDocStats}
    />,
  );
  second.resolve({
    ...documentStats,
    documentId: "doc-b",
    activeMs: 120_000,
  });
  const summary = await screen.findByRole("list", { name: "Reading summary" });
  expect(within(summary).getByText("2m")).toBeInTheDocument();

  first.resolve({
    ...documentStats,
    documentId: "doc-a",
    activeMs: 60_000,
  });
  await waitFor(() => {
    expect(within(summary).queryByText("1m")).toBeNull();
    expect(within(summary).getByText("2m")).toBeInTheDocument();
  });
});

test("refetches the selected document when the period changes", async () => {
  const july = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
  const august = { unit: "month" as const, anchorLocalDay: "2026-08-01" };
  const getDocStats = vi.fn().mockResolvedValue(documentStats);
  const { rerender } = render(
    <DocumentStatisticsPage
      document={documentA}
      period={july}
      getDocStats={getDocStats}
    />,
  );
  await waitFor(() =>
    expect(getDocStats).toHaveBeenCalledWith("doc-a", july),
  );

  rerender(
    <DocumentStatisticsPage
      document={documentA}
      period={august}
      getDocStats={getDocStats}
    />,
  );
  await waitFor(() =>
    expect(getDocStats).toHaveBeenLastCalledWith("doc-a", august),
  );
  expect(getDocStats).toHaveBeenCalledTimes(2);
});
