import { expect, test } from "@playwright/test";

test("captures the ready atlas for visual QA", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
  await page.locator(".leaflet-tile-loaded").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  await page.screenshot({
    path: `test-results/visual-${testInfo.project.name}.png`,
    fullPage: false,
  });
});
