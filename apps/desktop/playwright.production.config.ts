import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "production-startup.spec.ts",
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 1422",
    url: "http://127.0.0.1:1422",
    reuseExistingServer: false,
  },
});
