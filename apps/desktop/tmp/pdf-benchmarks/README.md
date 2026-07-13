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
| 64 MiB tile cache | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

Baseline resource source: `tmp/pdf-benchmarks/baseline.csv`, sampled from `target/debug/library_desktop` plus its matching WebKit WebContent, Networking, and GPU XPC processes.
