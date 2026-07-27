import { useCallback, useEffect, useState } from "react";
import type { LibraryDocument } from "../../domain/document";
import type { Deck } from "../../domain/learning";
import type { StatisticsPeriod } from "../../domain/statistics";
import { currentPeriod } from "./period";
import type { StatisticsRouteTarget } from "../../app/routes";
import { StatisticsShell } from "./components/StatisticsShell";
import { StatisticsOverviewPage } from "./pages/StatisticsOverviewPage";
import { ReadingStatisticsWorkspace } from "./pages/ReadingStatisticsWorkspace";
import { MemoraStatisticsWorkspace } from "./pages/MemoraStatisticsWorkspace";
import { RegisteredAppStatisticsPage } from "./pages/RegisteredAppStatisticsPage";
import { DEFAULT_STATISTICS_APPS, type StatisticsAppDefinition } from "./registry";
import { MetricSection } from "./components/MetricSection";

const NO_DOCUMENTS: LibraryDocument[] = [];
const EMPTY_DECK_LOADER = async (): Promise<Deck[]> => [];

interface StatisticsPageProps {
  target?: StatisticsRouteTarget;
  origin?: "library" | "memora";
  onBack?(): void;
  apps?: StatisticsAppDefinition[];
  documents?: LibraryDocument[];
  documentsLoading?: boolean;
  listDecks?: () => Promise<Deck[]>;
}

type StatisticsView =
  | { kind: "overview" }
  | { kind: "app"; appKey: string }
  | { kind: "document"; documentId: string }
  | { kind: "deck"; deckId: string };

export function StatisticsPage({
  target,
  origin,
  onBack,
  apps = DEFAULT_STATISTICS_APPS,
  documents = NO_DOCUMENTS,
  documentsLoading = false,
  listDecks = EMPTY_DECK_LOADER,
}: StatisticsPageProps) {
  const [period, setPeriod] = useState<StatisticsPeriod>(() => currentPeriod("year"));
  const [view, setView] = useState<StatisticsView>({ kind: "overview" });

  useEffect(() => {
    if (target?.kind === "app") {
      setView({ kind: "app", appKey: target.appKey });
    } else if (target?.kind === "document") {
      setView({ kind: "document", documentId: target.documentId });
    } else if (target?.kind === "deck") {
      setView({ kind: "deck", deckId: target.deckId });
    } else {
      setView({ kind: "overview" });
    }
  }, [target]);

  const activeAppKey =
    view.kind === "document"
      ? "reading"
      : view.kind === "deck"
        ? "memora"
        : view.kind === "app"
          ? view.appKey
          : null;

  const handleBack = useCallback(() => {
    if (origin) {
      onBack?.();
      return;
    }
    if (view.kind !== "overview") {
      setView({ kind: "overview" });
      return;
    }
    onBack?.();
  }, [origin, onBack, view.kind]);

  const selectedApp =
    view.kind === "app"
      ? apps.find((app) => app.key === view.appKey)
      : undefined;

  const title =
    view.kind === "overview"
      ? "Statistics"
      : activeAppKey === "reading"
        ? "Reading statistics"
        : activeAppKey === "memora"
          ? "Memora statistics"
          : selectedApp?.title ?? "App statistics";

  const breadcrumb =
    view.kind === "overview"
      ? undefined
      : `Statistics / ${title}`;

  const shellBack = view.kind !== "overview" || origin ? handleBack : undefined;

  return (
    <StatisticsShell
      title={title}
      breadcrumb={breadcrumb}
      onBack={shellBack}
      period={period}
      onPeriodChange={setPeriod}
    >
      {view.kind === "overview" && (
        <StatisticsOverviewPage
          period={period}
          onPeriodChange={setPeriod}
          apps={apps}
          onOpenApp={(appKey) => setView({ kind: "app", appKey })}
        />
      )}
      {activeAppKey === "reading" && (
        <ReadingStatisticsWorkspace
          documents={documents}
          documentsLoading={documentsLoading}
          selectedDocumentId={
            view.kind === "document" ? view.documentId : null
          }
          onSelectDocument={(documentId) =>
            setView(
              documentId
                ? { kind: "document", documentId }
                : { kind: "app", appKey: "reading" },
            )
          }
          period={period}
        />
      )}
      {activeAppKey === "memora" && (
        <MemoraStatisticsWorkspace
          listDecks={listDecks}
          selectedDeckId={view.kind === "deck" ? view.deckId : null}
          onSelectDeck={(deckId) =>
            setView(
              deckId
                ? { kind: "deck", deckId }
                : { kind: "app", appKey: "memora" },
            )
          }
          period={period}
        />
      )}
      {view.kind === "app" && activeAppKey !== "reading" && activeAppKey !== "memora" && selectedApp && (
        <RegisteredAppStatisticsPage app={selectedApp} period={period} />
      )}
      {view.kind === "app" && activeAppKey !== "reading" && activeAppKey !== "memora" && !selectedApp && (
        <MetricSection title="App statistics" state="empty" />
      )}
    </StatisticsShell>
  );
}
