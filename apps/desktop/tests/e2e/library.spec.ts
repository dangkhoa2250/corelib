import { test, expect } from "@playwright/test";

test("Quick Open and Command Palette stay available in Settings", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        metadata: { currentWindow: { label: "main" } },
        invoke: async (command: string) => {
          if (command === "account_session") {
            return {
              profile: {
                id: "e2e-user",
                displayName: "E2E User",
                email: "e2e@example.test",
                status: "approved",
                role: "member",
                analyticsEnabled: true,
              },
              entitlements: { featureKeys: [], refreshedAt: "2026-07-16T00:00:00Z" },
            };
          }
          if (command === "list_documents" || command === "list_decks") return [];
          return undefined;
        },
      },
    });
  });
  await page.goto("http://127.0.0.1:1421");
  await page.getByRole("button", { name: "Settings" }).click();
  const settingsSearch = page.getByLabel("Search settings");
  await expect(settingsSearch).toBeVisible();
  await settingsSearch.focus();
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("dialog", { name: "Quick Open" })).toBeVisible();
  await page.keyboard.press("Escape");
  await settingsSearch.focus();
  await page.keyboard.press("Control+Shift+K");
  await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
});
