import { useCallback, useEffect, useState } from "react";
import type { StatisticsRange } from "../../domain/statistics";
import type { StatisticsRouteTarget } from "../../app/routes";
import { StatisticsShell } from "./components/StatisticsShell";
import { StatisticsOverviewPage } from "./pages/StatisticsOverviewPage";
import { DocumentStatisticsPage } from "./pages/DocumentStatisticsPage";
import { DeckStatisticsPage } from "./pages/DeckStatisticsPage";
import { RegisteredAppStatisticsPage } from "./pages/RegisteredAppStatisticsPage";
import { DEFAULT_STATISTICS_APPS, type StatisticsAppDefinition } from "./registry";
import { MetricSection } from "./components/MetricSection";

interface StatisticsPageProps {
  target?: StatisticsRouteTarget;
  origin?: "library" | "memora";
  onBack?(): void;
  apps?: StatisticsAppDefinition[];
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
}: StatisticsPageProps) {
  const [range, setRange] = useState<StatisticsRange>("30d");
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

  const handleBack = useCallback(() => {
    if (view.kind !== "overview") {
      setView({ kind: "overview" });
    } else {
      onBack?.();
    }
  }, [view.kind, onBack]);

  const selectedApp = view.kind === "app" ? apps.find((app) => app.key === view.appKey) : undefined;
  const title = view.kind === "overview"
    ? "Statistics"
    : view.kind === "app"
      ? selectedApp?.title ?? "App statistics"
      : view.kind === "document"
        ? "Document statistics"
        : "Deck statistics";
  const breadcrumb = view.kind === "overview"
    ? undefined
    : view.kind === "app"
      ? `Statistics / ${title}`
      : view.kind === "document"
        ? "Statistics / Reading / Document"
        : "Statistics / Memora / Deck";
  const shellBack = view.kind !== "overview" || origin ? handleBack : undefined;

  return (
    <StatisticsShell
      title={title}
      breadcrumb={breadcrumb}
      onBack={shellBack}
      range={range}
      onRangeChange={setRange}
    >
      {view.kind === "overview" && (
        <StatisticsOverviewPage
          range={range}
          onRangeChange={setRange}
          apps={apps}
          onOpenApp={(appKey) => setView({ kind: "app", appKey })}
        />
      )}
      {view.kind === "app" && selectedApp && (
        <RegisteredAppStatisticsPage app={selectedApp} range={range} />
      )}
      {view.kind === "app" && !selectedApp && <MetricSection title="App statistics" state="empty" />}
      {view.kind === "document" && (
        <DocumentStatisticsPage
          documentId={view.documentId}
          range={range}
          onRangeChange={setRange}
          onBack={() => setView({ kind: "overview" })}
        />
      )}
      {view.kind === "deck" && (
        <DeckStatisticsPage
          deckId={view.deckId}
          range={range}
          onRangeChange={setRange}
          onBack={() => setView({ kind: "overview" })}
        />
      )}
    </StatisticsShell>
  );
}
