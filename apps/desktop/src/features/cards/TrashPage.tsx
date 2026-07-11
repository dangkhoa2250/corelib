import { useEffect, useRef, useState, useCallback } from "react";
import type { Deck, CardBrowserRow, TrashSort } from "../../domain/learning";
import { listTrashedCards, restoreCards, deleteCardsPermanently, emptyTrash } from "../../lib/learning";

export interface TrashPageProps {
  decks: Deck[];
  refreshTrigger?: number;
  onRefreshNeeded?: () => void;
}

const PAGE_SIZE = 50;

export function TrashPage({ decks, refreshTrigger = 0, onRefreshNeeded }: TrashPageProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<TrashSort>("deleted_desc");

  const [rows, setRows] = useState<CardBrowserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoreDeckId, setRestoreDeckId] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  const queryTokenRef = useRef(0);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  // Load initial page
  const loadData = useCallback(async () => {
    const token = ++queryTokenRef.current;
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const page = await listTrashedCards(debouncedQuery, sort, null, PAGE_SIZE);
      if (token !== queryTokenRef.current) return;
      setRows(page.rows);
      setTotal(page.total);
      setNextCursor(page.nextCursor);
    } catch (e) {
      if (token !== queryTokenRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === queryTokenRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedQuery, sort, refreshTrigger]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load more
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const token = queryTokenRef.current;
    setLoadingMore(true);
    try {
      const page = await listTrashedCards(debouncedQuery, sort, nextCursor, PAGE_SIZE);
      if (token !== queryTokenRef.current) return;
      setRows(prev => [...prev, ...page.rows]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      if (token !== queryTokenRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === queryTokenRef.current) {
        setLoadingMore(false);
      }
    }
  }, [debouncedQuery, sort, nextCursor, loadingMore]);

  // Intersection Observer
  const observerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window.IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && nextCursor && !loadingMore && !loading) {
        void loadMore();
      }
    }, { threshold: 0.1 });
    const current = observerRef.current;
    if (current) {
      observer.observe(current);
    }
    return () => {
      if (current) observer.unobserve(current);
      observer.disconnect();
    };
  }, [nextCursor, loadingMore, loading, loadMore]);

  // Selection
  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
  };

  // Bulk actions
  const handleRestoreSelected = async (toSpecificDeck: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkError(null);
    try {
      const destId = toSpecificDeck && restoreDeckId ? restoreDeckId : null;
      await restoreCards(Array.from(selectedIds), destId);
      setSelectedIds(new Set());
      onRefreshNeeded?.();
      await loadData();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteSelectedPermanently = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to permanently delete these ${selectedIds.size} cards? This action cannot be undone.`)) {
      return;
    }
    setBulkError(null);
    try {
      await deleteCardsPermanently(Array.from(selectedIds));
      setSelectedIds(new Set());
      onRefreshNeeded?.();
      await loadData();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleEmptyTrash = async () => {
    if (total === 0) return;
    if (!window.confirm(`Are you sure you want to empty the Trash? All ${total} cards inside Trash will be permanently deleted. This action cannot be undone.`)) {
      return;
    }
    setError(null);
    try {
      await emptyTrash();
      setSelectedIds(new Set());
      onRefreshNeeded?.();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const formatDate = (rfc3339: string | null) => {
    if (!rfc3339) return "-";
    try {
      const d = new Date(rfc3339);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return rfc3339;
    }
  };

  return (
    <div className="card-browser trash-page">
      <div className="card-browser__header">
        <div className="card-browser__title-group">
          <h1 className="card-browser__title">Trash</h1>
          <span className="card-browser__count">({total} cards)</span>
        </div>
        {total > 0 && (
          <button
            className="card-browser__empty-trash-btn"
            type="button"
            onClick={handleEmptyTrash}
          >
            Empty Trash
          </button>
        )}
      </div>

      <div className="card-browser__toolbar">
        {/* Search */}
        <div className="card-browser__search-box">
          <input
            className="card-browser__search-input"
            type="text"
            placeholder="Search front, back, or tags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Sort */}
        <div className="card-browser__filter-group">
          <label className="card-browser__label">Sort:</label>
          <select
            className="card-browser__select"
            value={sort}
            onChange={(e) => setSort(e.target.value as TrashSort)}
          >
            <option value="deleted_desc">Deleted Date (Newest)</option>
            <option value="front_asc">Front (A-Z)</option>
          </select>
        </div>

        {/* Clear Filters */}
        <button
          className="card-browser__clear-btn"
          type="button"
          onClick={() => {
            setQuery("");
            setSort("deleted_desc");
          }}
        >
          Clear
        </button>
      </div>

      {error && <div className="card-browser__error" role="alert">{error}</div>}

      {/* Bulk Action Banner */}
      {selectedIds.size > 0 && (
        <div className="card-browser__bulk-banner card-browser__bulk-banner--trash">
          <span className="card-browser__bulk-count">
            {selectedIds.size} cards selected
          </span>
          <div className="card-browser__bulk-actions">
            <button
              className="card-browser__bulk-btn"
              type="button"
              onClick={() => handleRestoreSelected(false)}
            >
              Restore to Original Deck
            </button>
            
            <div className="card-browser__restore-dest-group">
              <select
                className="card-browser__select"
                value={restoreDeckId}
                onChange={(e) => setRestoreDeckId(e.target.value)}
              >
                <option value="">Restore to specific deck...</option>
                {decks.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <button
                className="card-browser__bulk-btn"
                type="button"
                onClick={() => handleRestoreSelected(true)}
                disabled={!restoreDeckId}
              >
                Restore
              </button>
            </div>

            <button
              className="card-browser__bulk-btn card-browser__bulk-btn--danger"
              type="button"
              onClick={handleDeleteSelectedPermanently}
            >
              Delete Permanently
            </button>
          </div>
          {bulkError && <div className="card-browser__bulk-error">{bulkError}</div>}
        </div>
      )}

      {/* Table */}
      <div className="card-browser__table-container">
        <table className="card-browser__table">
          <thead>
            <tr>
              <th className="card-browser__th-select">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedIds.size === rows.length}
                  onChange={handleToggleSelectAll}
                />
              </th>
              <th>Front</th>
              <th>Back</th>
              <th>Original Deck</th>
              <th>Deleted Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isSelected = selectedIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  className={`card-browser__row ${isSelected ? 'is-selected' : ''}`}
                >
                  <td className="card-browser__td-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleRow(row.id)}
                    />
                  </td>
                  <td className="card-browser__td-text card-browser__td-front">
                    <div className="card-browser__cell-text">{row.front}</div>
                    {row.tags.length > 0 && (
                      <div className="card-browser__cell-tags">
                        {row.tags.map(t => <span key={t} className="card-browser__cell-tag">#{t}</span>)}
                      </div>
                    )}
                  </td>
                  <td className="card-browser__td-text card-browser__td-back">
                    <div className="card-browser__cell-text">{row.back}</div>
                  </td>
                  <td>
                    <span className="card-browser__deck-badge card-browser__deck-badge--trashed">
                      {row.deletedFromDeckName || row.deckName || "Unknown"}
                    </span>
                  </td>
                  <td>
                    <span className="card-browser__date-cell">{formatDate(row.deletedAt)}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="card-browser__empty">
                  Trash is empty.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Intersection Observer scroll target */}
        {nextCursor && (
          <div ref={observerRef} className="card-browser__scroll-trigger">
            {loadingMore ? "Loading more cards..." : <button type="button" onClick={loadMore}>Load More</button>}
          </div>
        )}
      </div>
    </div>
  );
}
