import { expect, test } from "@playwright/test";

test("Library exposes Review today entry point", async ({ page }) => {
  await page.goto("http://127.0.0.1:1420");
  await expect(page.getByRole("button", { name: "Review today" })).toBeVisible();
  // The Playwright Vite server does not provide Tauri's SQLite invoke bridge;
  // the full click-through lifecycle is covered by App integration tests.
});
