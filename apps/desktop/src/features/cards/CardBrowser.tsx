import { useEffect, useRef, useState, useCallback } from "react";
import type { Deck, CardBrowserRow, CardLifecycleState, CardSort } from "../../domain/learning";
import { queryDeckCards, moveCards, setCardsSuspended, trashCards, listActiveTags, createCard, updateCard } from "../../lib/learning";
import { CardSidePanel } from "./CardSidePanel";

export interface CardBrowserProps {
  decks: Deck[];
  initialDeckId?: string | null;
  onDoubleClilckRow?: (row: CardBrowserRow) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  refreshTrigger?: number;
  onBack?: () => void;
  onDirtyStateChange?: (dirty: boolean) => void;
  queryDeckCards?: typeof queryDeckCards;
  moveCards?: typeof moveCards;
  setCardsSuspended?: typeof setCardsSuspended;
  trashCards?: typeof trashCards;
  listActiveTags?: typeof listActiveTags;
  createCard?: typeof createCard;
  updateCard?: typeof updateCard;
}

const PAGE_SIZE = 50;

export function CardBrowser({
  decks,
  initialDeckId = null,
  onDoubleClilckRow,
  selectedIds,
  setSelectedIds,
  refreshTrigger = 0,
  onBack,
  onDirtyStateChange,
  queryDeckCards: customQuery = queryDeckCards,
  moveCards: customMove = moveCards,
  setCardsSuspended: customSuspend = setCardsSuspended,
  trashCards: customTrash = trashCards,
  listActiveTags: customListActiveTags = listActiveTags,
  createCard: customCreate = createCard,
  updateCard: customUpdate = updateCard,
}: CardBrowserProps) {
  const [deckId, setDeckId] = useState<string>(initialDeckId ?? "all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [states, setStates] = useState<CardLifecycleState[]>([]);
  const [sort, setSort] = useState<CardSort>("updated_desc");

  // Tag pills selection
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Side-panel card edit and bulk actions
  const [editingCard, setEditingCard] = useState<CardBrowserRow | null>(null);
  const [bulkDeckId, setBulkDeckId] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isEditorDirty, setIsEditorDirty] = useState(false);

  // Keeps query tokens for race condition / stale response protection
  const queryTokenRef = useRef(0);

  // Sync route deckId changes to state
  useEffect(() => {
    if (isEditorDirty) {
      if (!window.confirm("You have unsaved changes. Discard changes?")) return;
    }
    setIsEditorDirty(false);
    onDirtyStateChange?.(false);
    setDeckId(initialDeckId ?? "all");
  }, [initialDeckId, onDirtyStateChange]); // Checked on initialDeckId changes

  // Clear selection on deck change only (explicit-selection semantics)
  useEffect(() => {
    setSelectedIds(new Set());
  }, [deckId, setSelectedIds]);

  const handleDirtyStateChange = useCallback((dirty: boolean) => {
    setIsEditorDirty(dirty);
    onDirtyStateChange?.(dirty);
  }, [onDirtyStateChange]);

  const handleBulkMove = async () => {
    if (!bulkDeckId || selectedIds.size === 0) return;
    setBulkError(null);
    try {
      await customMove(Array.from(selectedIds), bulkDeckId);
      setSelectedIds(new Set());
      await loadData();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleBulkSuspend = async (suspended: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkError(null);
    try {
      await customSuspend(Array.from(selectedIds), suspended);
      setSelectedIds(new Set());
      await loadData();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleBulkTrash = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to move these ${selectedIds.size} cards to Trash?`)) {
      return;
    }
    setBulkError(null);
    try {
      await customTrash(Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadData();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e));
    }
  };

  // Table rows and pagination
  const [rows, setRows] = useState<CardBrowserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  // Load active tags inside selected deck scope
  useEffect(() => {
    let active = true;
    const fetchTags = async () => {
      try {
        const tags = await customListActiveTags(deckId === "all" ? "" : deckId);
        if (active) {
          setAvailableTags(tags ?? []);
        }
      } catch (_) {}
    };
    void fetchTags();
    return () => {
      active = false;
    };
  }, [deckId, customListActiveTags]);

  // Load initial/filtered page with stale result protection
  const loadData = useCallback(async () => {
    const token = ++queryTokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = await customQuery({
        deckId: deckId === "all" ? "" : deckId,
        query: debouncedQuery,
        states,
        tags: selectedTags,
        sort,
        cursor: null,
        limit: PAGE_SIZE,
      });
      if (token !== queryTokenRef.current) return;
      setRows(page?.rows ?? []);
      setTotal(page?.total ?? 0);
      setNextCursor(page?.nextCursor ?? null);
    } catch (e) {
      if (token !== queryTokenRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === queryTokenRef.current) {
        setLoading(false);
      }
    }
  }, [deckId, debouncedQuery, states, selectedTags, sort, refreshTrigger, customQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load more / Infinite scroll with stale result protection
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const token = queryTokenRef.current;
    setLoadingMore(true);
    try {
      const page = await customQuery({
        deckId: deckId === "all" ? "" : deckId,
        query: debouncedQuery,
        states,
        tags: selectedTags,
        sort,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      if (token !== queryTokenRef.current) return;
      setRows(prev => [...prev, ...(page?.rows ?? [])]);
      setNextCursor(page?.nextCursor ?? null);
    } catch (e) {
      if (token !== queryTokenRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === queryTokenRef.current) {
        setLoadingMore(false);
      }
    }
  }, [deckId, debouncedQuery, states, selectedTags, sort, nextCursor, loadingMore, customQuery]);

  // Intersection Observer for infinite scroll
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

  // Selection handlers
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

  const toggleStatusFilter = (status: CardLifecycleState) => {
    setStates(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  const handleClearFilters = () => {
    setQuery("");
    setStates([]);
    setSelectedTags([]);
    setSort("updated_desc");
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

  const handleDeckChangeGuard = (newDeckId: string) => {
    if (isEditorDirty) {
      if (!window.confirm("Discard unsaved changes?")) return;
    }
    setIsEditorDirty(false);
    onDirtyStateChange?.(false);
    setDeckId(newDeckId);
  };

  const handleRowDoubleClick = (row: CardBrowserRow) => {
    if (isEditorDirty) {
      if (!window.confirm("Discard unsaved changes?")) return;
    }
    setIsEditorDirty(false);
    onDirtyStateChange?.(false);
    onDoubleClilckRow?.(row);
    setEditingCard(row);
  };

  const handleAddCard = () => {
    if (isEditorDirty) {
      if (!window.confirm("Discard unsaved changes?")) return;
    }
    setIsEditorDirty(false);
    onDirtyStateChange?.(false);
    setEditingCard({
      id: "",
      deckId: deckId === "all" ? (decks[0]?.id ?? "") : deckId,
      deckName: "",
      front: "",
      back: "",
      state: "new",
      dueAt: new Date().toISOString(),
      reps: 0,
      lapses: 0,
      stability: null,
      difficulty: null,
      lastReviewAt: null,
      source: null,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      deletedFromDeckName: null,
    });
  };

  return (
    <div className="card-browser">
      <div className="card-browser__header">
        <div className="card-browser__title-group">
          {onBack && (
            <button className="card-browser__back" onClick={onBack} type="button">
              ← Back
            </button>
          )}
          <h1 className="card-browser__title">Card Browser</h1>
          <span className="card-browser__count">({total} cards)</span>
        </div>
        <button className="card-browser__bulk-btn" onClick={handleAddCard} type="button">
          Add Card
        </button>
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

        {/* Deck Filter */}
        <div className="card-browser__filter-group">
          <label className="card-browser__label">Deck:</label>
          <select
            className="card-browser__select"
            value={deckId}
            onChange={(e) => handleDeckChangeGuard(e.target.value)}
          >
            <option value="all">All Decks</option>
            {decks.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div className="card-browser__filter-group">
          <label className="card-browser__label">Sort:</label>
          <select
            className="card-browser__select"
            value={sort}
            onChange={(e) => setSort(e.target.value as CardSort)}
          >
            <option value="updated_desc">Updated (Newest)</option>
            <option value="created_desc">Created (Newest)</option>
            <option value="due_asc">Due (Soonest)</option>
            <option value="front_asc">Front (A-Z)</option>
          </select>
        </div>

        {/* Clear Filters */}
        <button
          className="card-browser__clear-btn"
          type="button"
          onClick={handleClearFilters}
        >
          Clear
        </button>
      </div>

      {/* Status multi-select list */}
      <div className="card-browser__status-bar">
        <span className="card-browser__status-label">Status:</span>
        {(["new", "learning", "review", "relearning", "suspended"] as CardLifecycleState[]).map(status => {
          const isActive = states.includes(status);
          return (
            <button
              key={status}
              type="button"
              className={`card-browser__status-pill card-browser__status-pill--${status} ${isActive ? 'is-active' : ''}`}
              onClick={() => toggleStatusFilter(status)}
            >
              {status}
            </button>
          );
        })}
      </div>

      {/* Available tags list */}
      {availableTags.length > 0 && (
        <div className="card-browser__tags-bar">
          <span className="card-browser__tags-label">Tags:</span>
          <div className="card-browser__tags-list">
            {availableTags.map(tag => {
              const isActive = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`card-browser__tag-pill ${isActive ? 'is-active' : ''}`}
                  onClick={() => toggleTagFilter(tag)}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <div className="card-browser__error" role="alert">{error}</div>}

      {/* Bulk Action Banner */}
      {selectedIds.size > 0 && (
        <div className="card-browser__bulk-banner">
          <span className="card-browser__bulk-count">
            {selectedIds.size} cards selected
          </span>
          <div className="card-browser__bulk-actions">
            <select
              className="card-browser__select"
              value={bulkDeckId}
              onChange={(e) => setBulkDeckId(e.target.value)}
            >
              <option value="">Move to deck...</option>
              {decks.filter(d => d.id !== deckId).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              className="card-browser__bulk-btn"
              type="button"
              onClick={handleBulkMove}
              disabled={!bulkDeckId}
            >
              Move
            </button>
            <button
              className="card-browser__bulk-btn"
              type="button"
              onClick={() => handleBulkSuspend(true)}
            >
              Suspend
            </button>
            <button
              className="card-browser__bulk-btn"
              type="button"
              onClick={() => handleBulkSuspend(false)}
            >
              Unsuspend
            </button>
            <button
              className="card-browser__bulk-btn card-browser__bulk-btn--danger"
              type="button"
              onClick={handleBulkTrash}
            >
              Trash
            </button>
          </div>
          {bulkError && <div className="card-browser__bulk-error">{bulkError}</div>}
        </div>
      )}

      {/* Main Table */}
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
              <th>Deck</th>
              <th>State</th>
              <th>Due Date</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isSelected = selectedIds.has(row.id);
              const isSuspended = row.state === "suspended";
              return (
                <tr
                  key={row.id}
                  className={`card-browser__row ${isSelected ? 'is-selected' : ''} ${isSuspended ? 'is-suspended' : ''}`}
                  onDoubleClick={() => handleRowDoubleClick(row)}
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
                    <span className="card-browser__deck-badge">{row.deckName}</span>
                  </td>
                  <td>
                    <span className={`card-browser__state-badge card-browser__state-badge--${row.state}`}>
                      {row.state}
                    </span>
                  </td>
                  <td>
                    <span className="card-browser__date-cell">{formatDate(row.dueAt)}</span>
                  </td>
                  <td>
                    <span className="card-browser__date-cell">{formatDate(row.updatedAt)}</span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="card-browser__empty">
                  No cards found matching current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Intersection Observer target for scroll trigger */}
        {nextCursor && (
          <div ref={observerRef} className="card-browser__scroll-trigger">
            {loadingMore ? "Loading more cards..." : <button type="button" onClick={loadMore}>Load More</button>}
          </div>
        )}
      </div>

      {/* Card Edit Side Panel */}
      <CardSidePanel
        card={editingCard}
        decks={decks}
        onClose={() => setEditingCard(null)}
        onSaveSuccess={() => {
          setEditingCard(null);
          void loadData();
        }}
        onDirtyStateChange={handleDirtyStateChange}
        createCard={customCreate}
        updateCard={customUpdate}
        moveCards={customMove}
      />
    </div>
  );
}
