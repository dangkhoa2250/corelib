import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck } from "../../../domain/learning";
import type { StatisticsPeriod } from "../../../domain/statistics";
import { getDeckStatisticsDetail } from "../../../lib/statistics";
import { getMemoraStatistics } from "../../../lib/statistics";
import { StatisticsMasterDetail } from "../components/StatisticsMasterDetail";
import { DeckStatisticsPage } from "./DeckStatisticsPage";
import { MemoraStatisticsPage } from "./MemoraStatisticsPage";

export interface MemoraStatisticsWorkspaceProps {
  listDecks(): Promise<Deck[]>;
  selectedDeckId: string | null;
  onSelectDeck(id: string | null): void;
  period: StatisticsPeriod;
  getMemoraStats?: typeof getMemoraStatistics;
  getDeckStats?: typeof getDeckStatisticsDetail;
}

export function MemoraStatisticsWorkspace({
  listDecks,
  selectedDeckId,
  onSelectDeck,
  period,
  getMemoraStats,
  getDeckStats,
}: MemoraStatisticsWorkspaceProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [listState, setListState] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const deckRequestId = useRef(0);

  const loadDecks = useCallback(async () => {
    const requestId = ++deckRequestId.current;
    setListState("loading");
    try {
      const result = await listDecks();
      if (requestId !== deckRequestId.current) return;
      setDecks(result);
      setListState("loaded");
    } catch {
      if (requestId === deckRequestId.current) {
        setListState("error");
      }
    }
  }, [listDecks]);

  useEffect(() => {
    void loadDecks();
    return () => {
      deckRequestId.current += 1;
    };
  }, [loadDecks]);

  const items = decks.map((deck) => ({
    id: deck.id,
    label: deck.name,
    description: deck.description ?? undefined,
    meta: deck.archived ? "Archived" : undefined,
    searchText: `${deck.name} ${deck.description ?? ""}`,
    visual: deck.color ? (
      <span
        aria-hidden="true"
        className="statistics-entity-row__deck-swatch"
        style={{ backgroundColor: deck.color }}
      />
    ) : undefined,
  }));

  const selectedDeck =
    selectedDeckId !== null
      ? decks.find((d) => d.id === selectedDeckId) ?? undefined
      : undefined;

  return (
    <StatisticsMasterDetail
      allLabel="All Memora"
      ariaLabel="Memora statistics scopes"
      searchLabel="Search decks"
      noResultsLabel="No decks found"
      items={items}
      selectedId={selectedDeckId}
      onSelect={onSelectDeck}
      listState={listState}
      onRetry={() => void loadDecks()}
    >
      {selectedDeckId !== null ? (
        <DeckStatisticsPage
          deckId={selectedDeckId}
          deck={selectedDeck}
          period={period}
          getDeckStats={getDeckStats}
        />
      ) : (
        <MemoraStatisticsPage
          period={period}
          getMemoraStats={getMemoraStats}
        />
      )}
    </StatisticsMasterDetail>
  );
}
