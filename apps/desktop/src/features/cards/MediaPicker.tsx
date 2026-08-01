import { useEffect, useState } from "react";

import type { PixabayImage } from "../../domain/media";

/**
 * Pixabay image picker for the flashcard composer.
 *
 * Renders inside the composer's own scroll container: the grid is never its
 * own scroll surface (no nested `overflow`), so long result sets scroll with
 * the parent dialog/panel per the WKWebView scroll-surface rules.
 */
export interface MediaPickerProps {
  /** Plain text from the front face, used as the initial auto-search query. */
  frontText: string;
  /** Whether a Pixabay API key is configured. */
  hasKey: boolean;
  /** Searches Pixabay; the backend returns one page of hits. */
  onSearch: (query: string, page: number) => Promise<PixabayImage[]>;
  /** Stages a chosen image and returns its stored media id and alt text. */
  onStage: (result: PixabayImage) => Promise<{ mediaId: string; alt: string }>;
  /** Dismisses the picker. */
  onClose?: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function MediaPicker({
  frontText,
  hasKey,
  onSearch,
  onStage,
  onClose,
}: MediaPickerProps) {
  const [query, setQuery] = useState(frontText);
  const [images, setImages] = useState<PixabayImage[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [stagingId, setStagingId] = useState<number | null>(null);
  const [stageErrors, setStageErrors] = useState<Record<number, string>>({});

  const runSearch = async (nextQuery: string, nextPage: number) => {
    setLoading(true);
    setSearchError(null);
    try {
      const next = await onSearch(nextQuery, nextPage);
      setImages((current) => (nextPage === 1 ? next : [...current, ...next]));
      setPage(nextPage);
    } catch (error) {
      setSearchError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasKey) return;
    void runSearch(frontText, 1);
    // Auto-search happens once per picker open; typing in the search box is
    // the explicit re-search path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey]);

  const handleStage = async (result: PixabayImage) => {
    setStagingId(result.id);
    setStageErrors((current) => {
      const next = { ...current };
      delete next[result.id];
      return next;
    });
    try {
      await onStage(result);
    } catch (error) {
      setStageErrors((current) => ({ ...current, [result.id]: errorMessage(error) }));
    } finally {
      setStagingId(null);
    }
  };

  if (!hasKey) {
    return (
      <div style={{ display: "grid", gap: "8px", padding: "12px 14px", borderRadius: "12px", background: "var(--interactive-hover)" }}>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
          Pixabay adds stock photos to your cards.
        </p>
        <button
          aria-label="Add a Pixabay API key in Settings › Media"
          onClick={() => onClose?.()}
          style={{
            justifySelf: "start",
            border: 0,
            borderRadius: "999px",
            padding: "5px 10px",
            color: "var(--link)",
            background: "transparent",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
          }}
          type="button"
        >
          Settings › Media
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          aria-label="Search Pixabay"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runSearch(query, 1);
            }
          }}
          placeholder="Search Pixabay…"
          style={{ flex: 1, minWidth: 0, borderRadius: "8px", border: "1px solid var(--border-strong)", padding: "6px 10px", fontSize: "13px" }}
          type="search"
          value={query}
        />
        <button
          disabled={loading}
          onClick={() => void runSearch(query, 1)}
          style={{
            border: 0,
            borderRadius: "8px",
            padding: "6px 12px",
            color: "var(--button-primary-text)",
            background: "var(--button-primary-bg)",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
          type="button"
        >
          Search
        </button>
      </div>

      {loading && images.length === 0 ? (
        <p role="status" style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
          Loading Pixabay images…
        </p>
      ) : null}

      {searchError && images.length === 0 ? (
        <div role="alert" style={{ display: "grid", gap: "6px", justifyItems: "start" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--warning)" }}>{searchError}</p>
          <button
            onClick={() => void runSearch(query, 1)}
            style={{
              border: "1px solid var(--border-strong)",
              borderRadius: "999px",
              padding: "4px 10px",
              color: "var(--button-secondary-text)",
              background: "var(--button-secondary-bg)",
              cursor: "pointer",
              fontSize: "12px",
            }}
            type="button"
          >
            Retry search
          </button>
        </div>
      ) : null}

      {!loading && !searchError && images.length === 0 ? (
        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
          No images found for “{query}”.
        </p>
      ) : null}

      {images.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "10px",
          }}
        >
          {images.map((result) => (
            <div
              data-media-result
              key={result.id}
              style={{
                display: "grid",
                gap: "6px",
                padding: "8px",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
                background: "var(--panel-bg)",
              }}
            >
              <button
                disabled={stagingId === result.id}
                onClick={() => void handleStage(result)}
                style={{
                  border: 0,
                  padding: 0,
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                type="button"
              >
                <img
                  alt=""
                  src={result.previewUrl}
                  style={{ width: "100%", height: "auto", aspectRatio: "3 / 2", objectFit: "cover", borderRadius: "8px", display: "block" }}
                />
                <span
                  style={{
                    display: "block",
                    marginTop: "6px",
                    fontSize: "11px",
                    lineHeight: 1.4,
                    color: "var(--text-secondary)",
                  }}
                >
                  Photo by {result.user} on Pixabay
                </span>
              </button>
              {stagingId === result.id ? (
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Adding…</span>
              ) : null}
              {stageErrors[result.id] ? (
                <div style={{ display: "grid", gap: "6px", justifyItems: "start" }}>
                  <p role="alert" style={{ margin: 0, fontSize: "12px", color: "var(--warning)" }}>
                    {stageErrors[result.id]}
                  </p>
                  <button
                    onClick={() => void handleStage(result)}
                    style={{
                      border: "1px solid var(--border-strong)",
                      borderRadius: "999px",
                      padding: "3px 8px",
                      color: "var(--button-secondary-text)",
                      background: "var(--button-secondary-bg)",
                      cursor: "pointer",
                      fontSize: "11px",
                    }}
                    type="button"
                  >
                    Retry download
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {images.length > 0 && !loading ? (
        <button
          onClick={() => void runSearch(query, page + 1)}
          style={{
            justifySelf: "start",
            border: "1px solid var(--border-strong)",
            borderRadius: "999px",
            padding: "5px 12px",
            color: "var(--button-secondary-text)",
            background: "var(--button-secondary-bg)",
            cursor: "pointer",
            fontSize: "12px",
          }}
          type="button"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
