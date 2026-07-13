# PDF Zoom Benchmarks

## Scenario

- Source binary: `.worktrees/pdf-zoom-render-revision/apps/desktop/src-tauri/target/debug/library_desktop`
- Document: `math/mml-book.pdf`
- Page: search result `Theorem 6.16` (PDF page 225; the current-page observer may report 222–223 during transformed scrolling)
- Interaction: five-second idle, three `50% -> 300% -> 50% -> 300%` cycles, five viewport scrolls down/up, five-second settle
- Sampling: source app process tree every 100 ms

## Results

| Version | Mean CPU | Peak CPU | Peak RSS | Settled RSS | First exact tile | Full exact coverage | Cache peak | Cache-hit ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 0.90% | 63.50% | 149.97 MiB | 43.42 MiB | Not instrumented | Whole-set gate | N/A | N/A |
| 64 MiB resident-accounted tile cache | 27.70% | 137.50% | 500.73 MiB | 427.89 MiB | Instrumented in dev output | Instrumented in dev output | <= 64 MiB by invariant | Instrumented in dev output |

Baseline resource source: `tmp/pdf-benchmarks/baseline.csv`, sampled from `target/debug/library_desktop` plus its matching WebKit WebContent, Networking, and GPU XPC processes.

Final resource source: `tmp/pdf-benchmarks/resident-budget-final.csv`. The sampler selects the WebKit XPC group nearest the requested source PID's launch time because a second Library worktree was running with the same bundle data directory.

## Recovery and interpretation

- The interaction run performs real exact-scale raster work while zooming, so its mean CPU is higher than the old settle-only renderer. The final one-second window averaged `0.01%` CPU and peaked at `0.10%`; raster work does not continue indefinitely after the gesture.
- A clean settled sample after the resident-accounting revision averaged `0.00%` CPU and settled at `129.17 MiB` RSS (`tmp/pdf-benchmarks/resident-budget-idle.csv`).
- WebKit RSS remains above the logical cache size because decoded PDF data, JavaScript heap, canvas CPU backing stores, and GPU surfaces are separate allocations. Cache admission therefore charges each canvas at twice its visible RGBA byte size.
- Prefetch is mutually exclusive and bounded: at most one adjacent-scale tile during zoom, or two scroll-ring tiles after zoom settles. This reduced a measured prefetch-idle average from `47.18%` CPU to `0.00%`.
- Cache reuse, first-exact latency, full-coverage latency, hit ratio, and eviction count are exposed through the development-only `PDF tile benchmark metrics` output. Automated component tests verify that a completed zoom level is reused without new PDF.js raster calls.
