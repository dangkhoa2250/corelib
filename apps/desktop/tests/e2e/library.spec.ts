import { test, expect } from "@playwright/test";

test("Library exposes import and Cmd+K", async ({ page }) => {
  await page.goto("http://127.0.0.1:1420");
  await expect(page.getByRole("button", { name: "Import from Mac" })).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await expect(page.getByRole("searchbox", { name: "Search your library" })).toBeVisible();
});
