import { expect, test } from "@playwright/test";

test("the production bundle renders the signed-in application", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("http://127.0.0.1:1422/", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        "<head>",
        `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">`,
      ),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        metadata: { currentWindow: { label: "main" } },
        invoke: async (command: string) => {
          if (command === "account_session") {
            return {
              profile: {
                id: "production-e2e-user",
                displayName: "Production E2E User",
                email: "production-e2e@example.test",
                status: "approved",
                role: "member",
                analyticsEnabled: true,
              },
              entitlements: { featureKeys: [], refreshedAt: "2026-08-07T00:00:00Z" },
            };
          }
          if (command === "list_documents" || command === "list_decks") return [];
          return undefined;
        },
      },
    });
  });

  await page.goto("http://127.0.0.1:1422");

  await page.waitForTimeout(100);
  expect(pageErrors).toEqual([]);
  await expect(page.getByLabel("Primary")).toBeVisible();
});
