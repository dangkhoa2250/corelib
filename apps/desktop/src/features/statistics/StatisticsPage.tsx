import { useCallback, useEffect, useState } from "react";
import type { StatisticsRange } from "../../domain/statistics";
import type { StatisticsRouteTarget } from "../../app/routes";
import { StatisticsShell } from "./components/StatisticsShell";
import { StatisticsOverviewPage } from "./pages/StatisticsOverviewPage";
import { ReadingStatisticsPage } from "./pages/ReadingStatisticsPage";
import { MemoraStatisticsPage } from "./pages/MemoraStatisticsPage";
import { DocumentStatisticsPage } from "./pages/DocumentStatisticsPage";
import { DeckStatisticsPage } from "./pages/DeckStatisticsPage";

interface StatisticsPageProps {
  target?: StatisticsRouteTarget;
  origin?: "library" | "memora";
  onBack?(): void;
}

type StatisticsView =
  | { kind: "overview" }
  | { kind: "app"; appKey: string }
  | { kind: "document"; documentId: string }
  | { kind: "deck"; deckId: string };

export function StatisticsPage({
  target,
  onBack,
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

  return (
    <StatisticsShell title="Statistics" onBack={handleBack}>
      {view.kind === "overview" && (
        <StatisticsOverviewPage
          range={range}
          onRangeChange={setRange}
        />
      )}
      {view.kind === "app" && view.appKey === "reading" && (
        <ReadingStatisticsPage
          range={range}
          onRangeChange={setRange}
          onBack={() => setView({ kind: "overview" })}
        />
      )}
      {view.kind === "app" && view.appKey === "memora" && (
        <MemoraStatisticsPage
          range={range}
          onRangeChange={setRange}
          onBack={() => setView({ kind: "overview" })}
        />
      )}
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
