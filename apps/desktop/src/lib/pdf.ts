import "./polyfills";
import * as pdfjs from "pdfjs-dist";
// `?worker&url` hands back the URL of a worker chunk Vite bundled itself, so it goes
// through build.target (safari15) instead of shipping node_modules source verbatim.
// Import the legacy build explicitly rather than relying on the vite.config alias.
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?worker&url";

// Deliberately workerSrc and not workerPort. A shared port would be torn down by the
// first `loadingTask.destroy()`: the worker answers "Terminate" by destroying its own
// message handler, so it stops listening for good and every later document would hang.
// workerSrc gives pdf.js one worker per document, whose lifecycle it already manages —
// and it keeps pdf.js's own fallback to the main thread if the spawn fails.
//
// What must NOT come back is `globalThis.pdfjsWorker`: setting it makes
// PDFWorker._initialize() take the fake-worker branch unconditionally, which parses and
// rasterizes every page on the UI thread.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Where pdf.js actually executes document parsing and rasterization.
 *
 * - `dedicated-worker`: a real Worker owns the work; the UI thread stays free.
 * - `main-thread`: pdf.js could not spawn the worker and fell back to running
 *   everything on the UI thread. Reader, viewer and thumbnails will crawl.
 * - `unknown`: the probe itself failed, so nothing can be claimed either way.
 */
export type PdfWorkerMode = "dedicated-worker" | "main-thread" | "unknown";

let workerModeProbe: Promise<PdfWorkerMode> | null = null;

/**
 * Spawns a throwaway pdf.js worker and reports which path it took. pdf.js falls back to
 * the main thread silently, so this is the only way to tell from inside the app which
 * one is live — it backs the readout in Settings.
 */
export function detectPdfWorkerMode(): Promise<PdfWorkerMode> {
  workerModeProbe ??= (async () => {
    let worker: pdfjs.PDFWorker | null = null;
    try {
      worker = new pdfjs.PDFWorker();
      await worker.promise;
      // `_webWorker` is only populated when pdf.js managed to spawn a real Worker; the
      // fake-worker path leaves it null.
      const spawned = (worker as unknown as { _webWorker: unknown })._webWorker;
      const mode: PdfWorkerMode = spawned ? "dedicated-worker" : "main-thread";
      console.info(`[pdf] worker mode: ${mode}`);
      return mode;
    } catch (error) {
      console.warn("[pdf] could not determine worker mode", error);
      return "unknown";
    } finally {
      try {
        worker?.destroy();
      } catch (_) {}
    }
  })();

  return workerModeProbe;
}

(globalThis as { pdfjsLib?: unknown }).pdfjsLib = pdfjs;

export { pdfjs, pdfWorkerUrl };
