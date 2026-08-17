import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: [
      { find: /^pdfjs-dist\/build\/pdf\.worker\.mjs/, replacement: "pdfjs-dist/legacy/build/pdf.worker.mjs" },
      { find: /^pdfjs-dist\/web\/pdf_viewer\.mjs/, replacement: "pdfjs-dist/legacy/web/pdf_viewer.mjs" },
      { find: /^pdfjs-dist\/web\/pdf_viewer\.css/, replacement: "pdfjs-dist/legacy/web/pdf_viewer.css" },
      { find: /^pdfjs-dist$/, replacement: "pdfjs-dist/legacy/build/pdf.mjs" },
    ],
  },

  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
