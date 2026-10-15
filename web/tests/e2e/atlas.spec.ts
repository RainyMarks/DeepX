import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
}

const resultCount = (page: Page) => page.getByTestId("result-count");

test("overview links into a filtered paper library", async ({ page }) => {
  await ready(page, "/");
  await expect(page.getByRole("heading", { level: 1, name: "生成图像取证研究图谱" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "研究方向" })).toBeVisible();
  await page.locator(".task-card", { hasText: "场景文本图像伪造" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "论文库" })).toBeVisible();
  await expect(page).toHaveURL(/view=papers/);
  await expect(page).toHaveURL(/task=scene_text_forgery/);
  await expect(page.getByRole("button", { name: "移除筛选：场景文本图像伪造" })).toBeVisible();
  await expect(page.locator(".paper-row").first()).toBeVisible();
});

test("search from the top bar switches to results", async ({ page }) => {
  await ready(page, "/");
  await page.getByRole("searchbox", { name: "搜索论文" }).fill("steganalysis");
  await expect(page).toHaveURL(/view=papers/);
  await expect(page.locator(".paper-row").first()).toContainText(/stegan/i);
});

test("mobile exposes the filter drawer", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only assertion");
  await ready(page, "/?view=papers");
  const panel = page.getByRole("complementary", { name: "筛选条件" });
  await expect(panel).not.toBeInViewport();
  await page.getByRole("button", { name: /^筛选/ }).click();
  await expect(panel.getByRole("group", { name: "研究方向" })).toBeInViewport();
  await panel.getByRole("button", { name: /深度伪造与人脸操纵/ }).click();
  await panel.getByRole("button", { name: /^查看 .* 条结果$/ }).click();
  await expect(panel).not.toBeInViewport();
  await expect(page).toHaveURL(/task=deepfake_detection/);
});

test("opens an author profile with trends and collaborators", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop coverage is sufficient");
  await ready(page, "/?view=authors");
  await page.locator(".data-table .row-link").first().click();
  const drawer = page.getByRole("complementary", { name: "学者档案" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "年度产出" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "主要合作者" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});

test("restores a shared filter URL and exports CSV", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop coverage is sufficient");
  await ready(page, "/?view=papers&task=scene_text_forgery");
  const option = page.getByRole("group", { name: "研究方向" }).getByRole("button", { name: /场景文本图像伪造/ });
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await page.getByText("导出").click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "CSV 表格" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test("filters real CAS TOP, CAS zone 1 and JCR Q1 records", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop filter regression coverage");
  await ready(page, "/?view=papers&journalSystem=CAS&journal=TOP");
  const zones = page.getByRole("group", { name: "期刊分区" });
  await expect(page.getByRole("radio", { name: "中科院 2025" })).toHaveAttribute("aria-checked", "true");
  await expect(zones.getByRole("button", { name: /中科院 TOP/ })).toHaveAttribute("aria-pressed", "true");
  await expect(resultCount(page)).toHaveText("585");

  await zones.getByRole("button", { name: /一区 \/ Q1/ }).click();
  await expect(resultCount(page)).toHaveText("517");
  await page.getByRole("radio", { name: "JCR 2026" }).click();
  await expect(resultCount(page)).toHaveText("627");
});

test("opens a paper record from a deep link and closes it with history", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop coverage is sufficient");
  await ready(page, "/?view=papers");
  await page.locator(".paper-title").first().click();
  const drawer = page.getByRole("complementary", { name: "论文详情" });
  await expect(drawer.locator(".record-title")).toBeVisible();
  await expect(page).toHaveURL(/paper=paper-/);
  const url = page.url();

  await page.goBack();
  await expect(drawer).toHaveCount(0);

  await ready(page, url);
  await expect(page.getByRole("complementary", { name: "论文详情" }).locator(".record-title")).toBeVisible();
});

test("map clusters open a regional panel and paper records", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop interaction coverage");
  await ready(page, "/?view=map");
  await expect(page.locator("footer")).toHaveCount(0);
  const explorer = page.locator(".map-explorer");
  const box = await explorer.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width).toBeGreaterThan(viewport.width - 340);
  expect(Math.abs(box!.y + box!.height - viewport.height)).toBeLessThan(24);

  await page.locator(".map-node-host").last().click();
  const panel = page.getByRole("complementary", { name: "区域论文" });
  await expect(panel).toBeVisible();
  await panel.locator(".map-papers button").first().click();
  await expect(page.getByRole("complementary", { name: "论文详情" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "论文详情" })).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "关闭区域论文" }).click();
  await expect(explorer).not.toHaveClass(/has-selection/);
});
