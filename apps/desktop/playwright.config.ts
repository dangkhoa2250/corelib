import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 1421",
    url: "http://127.0.0.1:1421",
    reuseExistingServer: false,
  },
});
