# PDF extraction safety

PDF text extraction is performed only by a local child process. `lopdf` can inflate a compressed
page stream before it returns text, so checking a `String` after `extract_text` cannot protect the
desktop process from an allocation spike.

The desktop executable recognizes an internal `--pdf-text-extract-worker <managed-pdf>` mode before
starting Tauri. On Unix, that worker has hard `RLIMIT_DATA`, `RLIMIT_AS`, and `RLIMIT_CPU` limits.
The parent caps worker stdout at 4 MiB and kills workers that exceed a five-second wall-clock limit.
The parent process never decodes PDF page content and therefore remains alive if parsing is killed
or fails. Any worker failure leaves the document `ready` with `index_state='failed'`, preserving the
existing recoverable indexing state.

The worker is intentionally local and offline; it does not use reader or cloud-source code. On a
platform where these hard Unix resource limits are unavailable, extraction fails closed instead of
falling back to in-process parsing.
