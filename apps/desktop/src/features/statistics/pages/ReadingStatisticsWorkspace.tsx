import { convertFileSrc } from "@tauri-apps/api/core";
import type { LibraryDocument } from "../../../domain/document";
import { documentStatusLabel } from "../../../domain/document";
import type { StatisticsPeriod } from "../../../domain/statistics";
import { getDocumentStatistics } from "../../../lib/statistics";
import { getReadingStatistics } from "../../../lib/statistics";
import { StatisticsMasterDetail } from "../components/StatisticsMasterDetail";
import { DocumentStatisticsPage } from "./DocumentStatisticsPage";
import { ReadingStatisticsPage } from "./ReadingStatisticsPage";

function documentProgressLabel(document: LibraryDocument): string | undefined {
  if (
    document.lastReadPage !== null &&
    document.numPages !== null &&
    document.numPages > 0
  ) {
    return `${Math.min(
      100,
      Math.round((document.lastReadPage / document.numPages) * 100),
    )}% read`;
  }
  return documentStatusLabel(document) || undefined;
}

export interface ReadingStatisticsWorkspaceProps {
  documents: LibraryDocument[];
  documentsLoading: boolean;
  selectedDocumentId: string | null;
  onSelectDocument(id: string | null): void;
  period: StatisticsPeriod;
  getReadingStats?: typeof getReadingStatistics;
  getDocumentStats?: typeof getDocumentStatistics;
}

export function ReadingStatisticsWorkspace({
  documents,
  documentsLoading,
  selectedDocumentId,
  onSelectDocument,
  period,
  getReadingStats,
  getDocumentStats,
}: ReadingStatisticsWorkspaceProps) {
  const items = documents.map((document) => ({
    id: document.id,
    label: document.title,
    description: document.author ?? undefined,
    meta: documentProgressLabel(document),
    searchText: `${document.title} ${document.author ?? ""}`,
    visual: document.coverUrl ? (
      <img alt="" src={convertFileSrc(document.coverUrl)} />
    ) : (
      <span className="statistics-entity-row__book-fallback" />
    ),
  }));

  const selectedDocument =
    selectedDocumentId !== null
      ? documents.find((doc) => doc.id === selectedDocumentId) ?? null
      : null;

  const showUnavailable =
    selectedDocumentId !== null && selectedDocument === null && !documentsLoading;

  return (
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={selectedDocumentId}
      onSelect={onSelectDocument}
      listState={documentsLoading ? "loading" : "loaded"}
    >
      {showUnavailable ? (
        <div className="statistics-page">
          <div className="statistics-unavailable" role="status">
            <p>This book is no longer available.</p>
          </div>
        </div>
      ) : selectedDocument !== null ? (
        <DocumentStatisticsPage
          document={selectedDocument}
          period={period}
          getDocStats={getDocumentStats}
        />
      ) : (
        <ReadingStatisticsPage
          period={period}
          getReadingStats={getReadingStats}
        />
      )}
    </StatisticsMasterDetail>
  );
}
