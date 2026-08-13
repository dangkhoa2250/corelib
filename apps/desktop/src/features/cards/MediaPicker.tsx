import { useEffect, useRef, useState } from "react";
import type { ImageSearchResult, MultiImageSearchPage, ProviderWarning } from "../../domain/media";
import { RemoteImagePreview } from "./RemoteImagePreview";

export interface MediaPickerProps {
  frontText: string;
  onSearch: (query: string, page: number) => Promise<MultiImageSearchPage>;
  onStage: (result: ImageSearchResult) => Promise<{ mediaId: string; alt: string }>;
  onClose?: () => void;
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const keyOf = (result: ImageSearchResult) => `${result.source}:${result.id}`;
const providerName = (source: string) => source === "wikimedia" ? "Wikimedia" : source === "duckduckgo" ? "DuckDuckGo" : source === "openverse" ? "Openverse" : source;

export function MediaPicker({ frontText, onSearch, onStage }: MediaPickerProps) {
  const [query, setQuery] = useState(frontText);
  const [images, setImages] = useState<ImageSearchResult[]>([]);
  const [warnings, setWarnings] = useState<ProviderWarning[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [stageErrors, setStageErrors] = useState<Record<string, string>>({});
  const searchSequence = useRef(0);
  const mounted = useRef(true);

  const runSearch = async (nextQuery: string, nextPage: number) => {
    const sequence = ++searchSequence.current;
    setLoading(true);
    setSearchError(null);
    try {
      const result = await onSearch(nextQuery, nextPage);
      if (!mounted.current || sequence !== searchSequence.current) return;
      setImages((current) => {
        const seen = new Set<string>();
        return (nextPage === 1 ? result.results : [...current, ...result.results]).filter((item) => {
          const key = keyOf(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      });
      setWarnings(result.warnings);
      setHasMore(result.hasMore ?? result.results.length > 0);
      setPage(nextPage);
    } catch (error) {
      if (!mounted.current || sequence !== searchSequence.current) return;
      setSearchError(message(error));
    } finally {
      if (mounted.current && sequence === searchSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void runSearch(frontText, 1);
    return () => {
      mounted.current = false;
      searchSequence.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stage = async (result: ImageSearchResult) => {
    const key = keyOf(result);
    setStagingId(key);
    setStageErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    try { await onStage(result); } catch (error) { setStageErrors((current) => ({ ...current, [key]: message(error) })); } finally { setStagingId(null); }
  };

  return (
    <div className="media-picker">
      <div className="media-picker__search-row">
        <input
          aria-label="Search images"
          className="media-picker__search-input"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runSearch(query, 1);
            }
          }}
          placeholder="Search images…"
          type="search"
          value={query}
        />
        <button
          className="media-picker__button media-picker__button--primary"
          disabled={loading}
          onClick={() => void runSearch(query, 1)}
          type="button"
        >
          Search
        </button>
      </div>

      {loading && images.length === 0 ? <p className="media-picker__status" role="status">Loading images…</p> : null}
      {searchError ? (
        <div className="media-picker__message media-picker__message--error" role="alert">
          <p>{searchError}</p>
          <button className="media-picker__button media-picker__button--secondary" disabled={loading} onClick={() => void runSearch(query, 1)} type="button">
            Retry search
          </button>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="media-picker__message media-picker__message--warning" role="status" aria-label="Provider warnings">
          {warnings.map((warning) => <p key={warning.provider}>{providerName(warning.provider)}: {warning.message}</p>)}
        </div>
      ) : null}
      {!loading && !searchError && images.length === 0 ? <p className="media-picker__status">No images found for “{query}”.</p> : null}

      {images.length > 0 ? (
        <div className="media-picker__results">
          {images.map((result) => {
            const key = keyOf(result);
            return (
              <div className="media-picker__result" data-media-result key={key}>
                <button
                  aria-label={result.title || "Image result"}
                  className="media-picker__result-button"
                  disabled={stagingId === key}
                  onClick={() => void stage(result)}
                  type="button"
                >
                  <RemoteImagePreview url={result.previewUrl} fallbackUrl={result.imageUrl} alt={result.title} />
                </button>
                {stagingId === key ? <span className="media-picker__result-status">Adding…</span> : null}
                {stageErrors[key] ? (
                  <div className="media-picker__stage-error">
                    <p role="alert">{stageErrors[key]}</p>
                    <button className="media-picker__button media-picker__button--secondary" onClick={() => void stage(result)} type="button">Retry download</button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {images.length > 0 && hasMore ? (
        <button className="media-picker__button media-picker__button--secondary media-picker__load-more" disabled={loading} onClick={() => void runSearch(query, page + 1)} type="button">
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
