import { expect, test } from "@playwright/test";

const views = ["/", "/?view=papers", "/?view=map"];

for (const url of views) {
  test(`captures ${url} for visual QA`, async ({ page }, testInfo) => {
    await page.goto(url);
    await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
    const name = url === "/" ? "overview" : url.split("=")[1];
    await page.screenshot({ path: `test-results/visual-${testInfo.project.name}-${name}.png`, fullPage: false });
  });
}
