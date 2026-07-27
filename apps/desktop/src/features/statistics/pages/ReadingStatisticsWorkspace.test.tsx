import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { LibraryDocument } from "../../../domain/document";
import type {
  DocumentStatistics,
  ReadingStatistics,
  StatisticsPeriod,
} from "../../../domain/statistics";
import { ReadingStatisticsWorkspace } from "./ReadingStatisticsWorkspace";

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

const readingStats: ReadingStatistics = {
  activeMs: 3_600_000,
  sessionCount: 5,
  averageSessionMs: 720_000,
  pageVisits: 42,
  uniquePages: 20,
  revisits: 22,
  buckets: [{ localDay: "2026-07-01", activeMs: 3_600_000 }],
  timeBuckets: [
    {
      localDay: "2026-07-01",
      bucketStartHour: 8,
      appKey: "reading",
      activeMs: 3_600_000,
      isFuture: false,
    },
  ],
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
  timeBuckets: [],
};

const getReadingStats = vi.fn().mockResolvedValue(readingStats);
const getDocumentStats = vi.fn().mockResolvedValue(documentStats);

test("switches between All Reading and a selected document in place", async () => {
  const user = userEvent.setup();
  const onSelectDocument = vi.fn();
  const { rerender } = render(
    <ReadingStatisticsWorkspace
      documents={[documentA, documentB]}
      documentsLoading={false}
      selectedDocumentId={null}
      onSelectDocument={onSelectDocument}
      period={period}
      getReadingStats={getReadingStats}
      getDocumentStats={getDocumentStats}
    />,
  );

  expect(await screen.findByRole("heading", { name: "All Reading" }))
    .toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Search books" }))
    .toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Document A/ }));
  expect(onSelectDocument).toHaveBeenCalledWith("doc-a");

  rerender(
    <ReadingStatisticsWorkspace
      documents={[documentA, documentB]}
      documentsLoading={false}
      selectedDocumentId="doc-a"
      onSelectDocument={onSelectDocument}
      period={period}
      getReadingStats={getReadingStats}
      getDocumentStats={getDocumentStats}
    />,
  );
  expect(await screen.findByRole("heading", { name: "Document A" }))
    .toBeInTheDocument();
  expect(
    screen.getByRole("navigation", { name: "Reading statistics scopes" }),
  ).toBeInTheDocument();
});

test("shows an unavailable state for a missing deep-linked document", () => {
  render(
    <ReadingStatisticsWorkspace
      documents={[documentA]}
      documentsLoading={false}
      selectedDocumentId="missing"
      onSelectDocument={vi.fn()}
      period={period}
      getReadingStats={getReadingStats}
      getDocumentStats={getDocumentStats}
    />,
  );
  expect(screen.getByRole("status"))
    .toHaveTextContent("This book is no longer available");
  expect(screen.getByRole("button", { name: "All Reading" })).toBeInTheDocument();
});

test("uses approved book copy for an empty Reading filter", async () => {
  const user = userEvent.setup();

  render(
    <ReadingStatisticsWorkspace
      documents={[documentA]}
      documentsLoading={false}
      selectedDocumentId={null}
      onSelectDocument={vi.fn()}
      period={period}
      getReadingStats={getReadingStats}
      getDocumentStats={getDocumentStats}
    />,
  );

  await user.type(
    screen.getByRole("searchbox", { name: "Search books" }),
    "not-present",
  );
  expect(screen.getByText("No books found")).toBeInTheDocument();
});
