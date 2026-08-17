import "./polyfills";
import * as pdfjs from "pdfjs-dist";
// @ts-expect-error pdfjs raw worker bundle does not have standalone type definitions
import * as pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
(globalThis as { pdfjsLib?: unknown }).pdfjsLib = pdfjs;

export { pdfjs, pdfjsWorker, pdfWorkerUrl };
