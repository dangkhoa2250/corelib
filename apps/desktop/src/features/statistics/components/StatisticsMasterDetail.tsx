import { useMemo, useState, type ReactNode } from "react";
import { Combobox, type ComboboxOption } from "../../../components/Combobox";
import { ScrollArea } from "../../../components/ScrollArea";

export interface StatisticsScopeItem {
  id: string;
  label: string;
  description?: string;
  meta?: string;
  searchText: string;
  visual?: ReactNode;
}

interface StatisticsMasterDetailProps {
  allLabel: string;
  ariaLabel: string;
  searchLabel: string;
  noResultsLabel: string;
  items: StatisticsScopeItem[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  listState?: "loading" | "loaded" | "error";
  onRetry?(): void;
  children: ReactNode;
}

export function StatisticsMasterDetail({
  allLabel,
  ariaLabel,
  searchLabel,
  noResultsLabel,
  items,
  selectedId,
  onSelect,
  listState = "loaded",
  onRetry,
  children,
}: StatisticsMasterDetailProps) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      item.searchText.toLocaleLowerCase().includes(needle),
    );
  }, [items, query]);

  const collapsedOptions: ComboboxOption<string>[] = useMemo(
    () => [
      { value: "__all__", label: allLabel },
      ...items.map((item) => ({ value: item.id, label: item.label })),
    ],
    [items, allLabel],
  );

  const collapsedValue = selectedId ?? "__all__";

  return (
    <div className="statistics-master-detail">
      {/* Desktop entity pane */}
      <nav
        className="statistics-entity-pane"
        aria-label={ariaLabel}
      >
        <div className="statistics-entity-pane__header">
          <input
            type="search"
            className="statistics-entity-pane__search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {listState === "loading" ? (
          <div className="statistics-entity-pane__status" role="status" aria-label="Loading scopes">
            Loading...
          </div>
        ) : listState === "error" ? (
          <div className="statistics-entity-pane__error">
            <p>Unable to load scopes.</p>
            {onRetry ? (
              <button onClick={onRetry}>Retry scopes</button>
            ) : null}
          </div>
        ) : (
          <ScrollArea data-testid="statistics-entity-scroll-area">
            <div
              className="statistics-entity-pane__scroll-content"
              data-testid="statistics-entity-scroll-content"
            >
              <button
                className="statistics-entity-pane__all-button"
                aria-current={selectedId === null ? "page" : undefined}
                onClick={() => onSelect(null)}
              >
                {allLabel}
              </button>
              <ul className="statistics-entity-pane__list">
                {filteredItems.map((item) => (
                  <li className="statistics-entity-pane__list-item" key={item.id}>
                    <button
                      className="statistics-entity-pane__row"
                      aria-current={selectedId === item.id ? "page" : undefined}
                      onClick={() => onSelect(item.id)}
                    >
                      {item.visual ? (
                        <span
                          aria-hidden="true"
                          className="statistics-entity-pane__visual"
                        >
                          {item.visual}
                        </span>
                      ) : null}
                      <span className="statistics-entity-pane__label">{item.label}</span>
                      {item.description ? (
                        <span className="statistics-entity-pane__description">
                          {item.description}
                        </span>
                      ) : null}
                      {item.meta ? (
                        <span className="statistics-entity-pane__meta">{item.meta}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              {filteredItems.length === 0 ? (
                <p className="statistics-entity-pane__no-results">{noResultsLabel}</p>
              ) : null}
            </div>
          </ScrollArea>
        )}
      </nav>

      {/* Collapsed searchable picker for narrow viewports */}
      <div className="statistics-master-detail__collapsed">
        <Combobox
          value={collapsedValue}
          onChange={(value) => onSelect(value === "__all__" ? null : value)}
          options={collapsedOptions}
          ariaLabel={ariaLabel}
          placeholder={allLabel}
        />
      </div>

      {/* Right panel */}
      <div className="statistics-master-detail__detail">
        {children}
      </div>
    </div>
  );
}
