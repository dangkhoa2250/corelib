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
          if (command === "load_plugin_lifecycle_state") {
            return { state: { schemaVersion: 1, accounts: {} }, notices: [] };
          }
          if (command === "save_plugin_lifecycle_state") return undefined;
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

test("reorders sidebar tabs with a real browser drag", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__corelibInvokeCalls", {
      configurable: true,
      value: calls,
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        metadata: { currentWindow: { label: "main" } },
        invoke: async (command: string) => {
          calls.push(command);
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
          if (command === "load_plugin_lifecycle_state") {
            return { state: { schemaVersion: 1, accounts: {} }, notices: [] };
          }
          if (command === "list_documents" || command === "list_decks") return [];
          return undefined;
        },
      },
    });
  });
  await page.goto("http://127.0.0.1:1422");
  await expect(page.getByLabel("Primary")).toBeVisible();

  const source = page.locator('li[data-surface-id="route.trash"]');
  const target = page.locator('li[data-surface-id="route.memora"]');
  await expect(source).toHaveCount(1);
  await expect(target).toHaveCount(1);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Sidebar drag targets are not measurable.");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  const followX = sourceBox.x + sourceBox.width / 2 + 48;
  const followY = sourceBox.y + sourceBox.height / 2 + 6;
  await page.mouse.move(followX, followY, { steps: 4 });
  await expect.poll(async () => {
    const draggedBox = await source.boundingBox();
    if (!draggedBox) return Number.POSITIVE_INFINITY;
    return Math.hypot(
      draggedBox.x + draggedBox.width / 2 - followX,
      draggedBox.y + draggedBox.height / 2 - followY,
    );
  }).toBeLessThan(3);
  const statistics = page.locator('li[data-surface-id="route.statistics"]');
  const statisticsBox = await statistics.boundingBox();
  if (!statisticsBox) throw new Error("Sidebar animation target is not measurable.");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.25);
  await page.mouse.move(statisticsBox.x + statisticsBox.width / 2, statisticsBox.y + statisticsBox.height * 0.75);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.25);
  const animationCounts = await page.locator(".app-sidebar__nav > li[data-surface-id]").evaluateAll(
    (rows) => rows.map((row) => ({
      surfaceId: row.getAttribute("data-surface-id"),
      animations: row.getAnimations().length,
    })),
  );
  expect(animationCounts.find(({ surfaceId }) => surfaceId === "route.trash")?.animations).toBe(0);
  expect(Math.max(...animationCounts.map(({ animations }) => animations))).toBeLessThanOrEqual(1);
  await page.waitForTimeout(220);
  const finalTargetBox = await target.boundingBox();
  if (!finalTargetBox) throw new Error("Final sidebar drag target is not measurable.");
  await page.mouse.move(finalTargetBox.x + finalTargetBox.width / 2, finalTargetBox.y + finalTargetBox.height * 0.75, { steps: 12 });
  await page.mouse.up();

  await expect.poll(async () => page.evaluate(() =>
    (window as Window & { __corelibInvokeCalls?: string[] }).__corelibInvokeCalls
      ?.filter((command) => command === "save_plugin_lifecycle_state").length ?? 0,
  )).toBeGreaterThan(0);

  await expect.poll(async () => page.locator(".app-sidebar__nav > li[data-surface-id]").evaluateAll(
    (rows) => rows.map((row) => row.getAttribute("data-surface-id")),
  )).toEqual([
    "route.home",
    "route.library",
    "route.memora",
    "route.trash",
    "route.statistics",
  ]);
});
