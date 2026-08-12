import { expect, test } from "@playwright/test";

test("loads the atlas and switches core views", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "生成图像取证研究图谱" })).toBeVisible();
  await expect(page.locator(".dataset-stamp small")).toContainText("篇论文");
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "论文库" }).click();
  await expect(page.getByRole("heading", { name: "论文库" })).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: /筛选与导出/ }).click();
  await page.getByLabel("研究任务").selectOption("scene_text_forgery");
  await expect(page.locator(".paper-card").first()).toBeVisible();
});

test("mobile exposes the filter drawer", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only assertion");
  await page.goto("/");
  await page.getByRole("button", { name: /筛选与导出/ }).click();
  await expect(page.getByLabel("关键词")).toBeVisible();
});

test("opens an author record with trends and collaborations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop coverage is sufficient");
  await page.goto("/?view=authors");
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "打开作者档案 →" }).first().click();
  await expect(page.getByRole("complementary", { name: "作者档案" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "年度趋势" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "主要合作作者" })).toBeVisible();
});

test("restores a shared filter URL and exports CSV", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop coverage is sufficient");
  await page.goto("/?view=papers&task=scene_text_forgery");
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "论文库" })).toBeVisible();
  await expect(page.getByLabel("研究任务")).toHaveValue("scene_text_forgery");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  expect((await download).suggestedFilename()).toContain(".csv");
});

test("filters real CAS TOP, CAS zone 1 and JCR Q1 records", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop filter regression coverage");
  await page.goto("/?view=papers&journalSystem=CAS&journal=TOP");
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByLabel("期刊评价")).toBeEnabled();
  await expect(page.getByLabel("期刊分区")).toBeEnabled();
  await expect(page.getByLabel("期刊评价")).toHaveValue("CAS");
  await expect(page.getByLabel("期刊分区")).toHaveValue("TOP");
  await expect(page.locator(".filter-result strong")).toHaveText("585");

  await page.getByLabel("期刊分区").selectOption("1");
  await expect(page.locator(".filter-result strong")).toHaveText("517");
  await page.getByLabel("期刊评价").selectOption("JCR");
  await expect(page.locator(".filter-result strong")).toHaveText("627");
});

test("opens an efficient cluster intelligence dock without covering the map", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop interaction coverage");
  await page.goto("/?view=map");
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
  const node = page.locator(".signal-node-host").first();
  await expect(node).toBeVisible();
  await node.click();
  await expect(page.getByRole("complementary", { name: "区域论文情报舱" })).toBeVisible();
  await expect(page.locator(".cluster-abstract").first()).toBeVisible();
  await expect(page.locator(".map-explorer")).toHaveClass(/has-cluster/);
});

test("uses the full map workbench and keeps paper details reversible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop map workbench coverage");
  await page.goto("/?view=map");
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".stats-column")).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);

  const explorer = page.locator(".map-explorer");
  const explorerBox = await explorer.boundingBox();
  const viewport = page.viewportSize();
  expect(explorerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(explorerBox!.width).toBeGreaterThan(viewport!.width - 310);
  expect(Math.abs(explorerBox!.y + explorerBox!.height - viewport!.height)).toBeLessThan(24);

  await page.locator(".signal-node-host").first().click();
  await page.locator(".cluster-paper-open").first().click();
  await expect(page.getByRole("complementary", { name: "论文详情" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "区域论文情报舱" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "← 返回区域论文" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "论文详情" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "区域论文情报舱" })).toBeVisible();
  await page.getByRole("button", { name: "关闭区域情报舱" }).click();
  await expect(explorer).not.toHaveClass(/has-cluster/);
});
