import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[data-atlas-ready="true"]')).toBeVisible({ timeout: 45_000 });
}

const resultCount = (page: Page) => page.getByTestId("result-count");

/** The element painted at the centre of `selector` must belong to it (nothing drawn on top). */
async function expectOnTop(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  const points = [[0.5, 0.5], [0.5, 0.15], [0.2, 0.8]].map(([fx, fy]) => [box!.x + box!.width * fx, box!.y + box!.height * fy]);
  for (const [x, y] of points) {
    const onTop = await page.evaluate(([px, py, sel]) => Boolean(document.elementFromPoint(px as number, py as number)?.closest(sel as string)), [x, y, selector]);
    expect(onTop, `${selector} is covered at ${Math.round(x)},${Math.round(y)}`).toBe(true);
  }
}

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
  await expect(resultCount(page)).toHaveText("1,156");

  await zones.getByRole("button", { name: /一区 \/ Q1/ }).click();
  await expect(resultCount(page)).toHaveText("1,036");
  await page.getByRole("radio", { name: "JCR 2026" }).click();
  await expect(resultCount(page)).toHaveText("1,365");
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
  await expect(page.getByRole("complementary", { name: "论文详情" }).locator(".record-title")).toBeVisible();
  await expectOnTop(page, ".drawer");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "论文详情" })).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "关闭区域论文" }).click();
  await expect(explorer).not.toHaveClass(/has-selection/);
});

test("links to a merged author id open the unified profile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop coverage is sufficient");
  // author-b4a7147b6c5677 was merged into Jessica Fridrich's OpenAlex identity via a shared ORCID.
  await ready(page, "/?view=authors&author=author-b4a7147b6c5677");
  const drawer = page.getByRole("complementary", { name: "学者档案" });
  await expect(drawer.getByRole("heading", { name: "Jessica Fridrich" })).toBeVisible();
  await expect(page).toHaveURL(/author=a5081020569/);
  await expect(drawer.locator(".mini-metrics dd").first()).toHaveText("89");

  // The profile lists twelve papers until it is expanded.
  const papers = drawer.locator(".compact-papers li");
  const total = Number(await drawer.locator(".mini-metrics dd").first().textContent());
  await expect(papers).toHaveCount(12);
  await drawer.getByRole("button", { name: `展开全部 ${total} 篇` }).click();
  await expect(papers).toHaveCount(total);
  await drawer.getByRole("button", { name: "收起" }).click();
  await expect(papers).toHaveCount(12);
});

test("paper rows expand in place with the full abstract, institutions and links", async ({ page }) => {
  await ready(page, "/?view=papers&q=forgery%20localization&sort=citations");
  const row = page.locator(".paper-row").first();
  const excerpt = (await row.locator(".paper-abstract").textContent()) ?? "";
  const toggle = row.getByRole("button", { name: /^展开/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();

  const more = row.getByRole("region", { name: "摘要、机构与链接" });
  const abstract = more.locator(".paper-abstract-full");
  await expect(abstract).toBeVisible();
  expect(((await abstract.textContent()) ?? "").length).toBeGreaterThanOrEqual(excerpt.length);
  await expect(more.getByRole("link", { name: /原始页面/ })).toHaveAttribute("href", /^https?:/);
  await expect(row.locator(".paper-abstract")).toHaveCount(0);

  const collapse = row.getByRole("button", { name: /^收起/ });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(more).toHaveCount(0);
});

test("mobile cards keep the venue and citations on one line", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "phone layout");
  await ready(page, "/?view=papers");
  const rows = page.locator(".paper-row");
  for (let index = 0; index < 6; index += 1) {
    const line = rows.nth(index).locator(".paper-venue");
    await expect(line.locator(".paper-cites")).toBeVisible();
    expect((await line.boundingBox())!.height).toBeLessThan(34);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("filter groups remember whether they are open and count their filters", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop coverage is sufficient");
  await ready(page, "/?view=papers&task=image_forgery&yearFrom=2020&yearTo=2024");
  const group = (title: string) => page.locator("details.filter-group").filter({ has: page.locator("summary", { hasText: title }) });
  await expect(group("研究方向").locator(".group-count")).toHaveText("1");
  await expect(group("发表年份").locator(".group-count")).toHaveText("1");
  await expect(group("发表渠道").locator(".group-count")).toHaveCount(0);

  await group("研究方向").locator("summary").click();
  await group("数据来源").locator("summary").click();
  await expect(group("研究方向")).not.toHaveAttribute("open", "");
  await ready(page, "/?view=papers&task=image_forgery");
  await expect(group("研究方向")).not.toHaveAttribute("open", "");
  await expect(group("研究方向").locator(".group-count")).toHaveText("1");
  await expect(group("数据来源")).toHaveAttribute("open", "");
});

test("the desktop filter sidebar folds away and is remembered", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop-only control");
  await ready(page, "/?view=papers");
  const panel = page.getByRole("complementary", { name: "筛选条件" });
  const list = page.locator(".paper-list");
  const narrow = (await list.boundingBox())!.width;

  await page.getByRole("button", { name: "收起筛选栏" }).click();
  await expect(panel).toBeHidden();
  const expand = page.getByRole("button", { name: /展开筛选/ });
  await expect(expand).toBeFocused();
  expect((await list.boundingBox())!.width).toBeGreaterThan(narrow + 200);

  await ready(page, "/?view=papers");
  await expect(panel).toBeHidden();
  await expand.click();
  await expect(panel).toBeVisible();
  await expect(page.getByRole("button", { name: "收起筛选栏" })).toBeFocused();
});

test("map regions preview six institutions and page their papers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop interaction coverage");
  await ready(page, "/?view=map");
  await page.locator(".map-node-host").last().click();
  const panel = page.getByRole("complementary", { name: "区域论文" });
  await expect(panel.locator(".chip")).toHaveCount(6);
  await panel.getByRole("button", { name: /^展开全部 \d+ 个机构$/ }).click();
  expect(await panel.locator(".chip").count()).toBeGreaterThan(6);
  await expect(panel.locator(".map-papers li")).toHaveCount(20);
  await panel.getByRole("button", { name: /^显示更多/ }).click();
  await expect(panel.locator(".map-papers li")).toHaveCount(40);
});

test("the phone map starts over the papers and opens regions as a bottom sheet", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "phone layout");
  await ready(page, "/?view=map");
  const map = (await page.locator(".map-explorer").boundingBox())!;
  // The busiest region is on the first screen.
  const largest = page.locator(".map-node-host").last();
  const node = (await largest.boundingBox())!;
  expect(node.x).toBeGreaterThanOrEqual(map.x);
  expect(node.x + node.width).toBeLessThanOrEqual(map.x + map.width);

  await largest.click();
  const panel = page.getByRole("complementary", { name: "区域论文" });
  const sheet = (await panel.boundingBox())!;
  expect(Math.abs(sheet.y + sheet.height - (map.y + map.height))).toBeLessThan(4);
  const [panelLayer, controlLayer] = await page.evaluate(() => [".map-panel", ".leaflet-top"]
    .map((selector) => Number(getComputedStyle(document.querySelector(selector)!).zIndex)));
  expect(panelLayer).toBeGreaterThan(controlLayer);
  await expectOnTop(page, ".map-panel-head");

  await panel.getByRole("button", { name: "收起区域论文" }).click();
  await expect(panel.locator(".map-panel-scroll")).toBeHidden();
  await panel.getByRole("button", { name: "展开区域论文" }).click();
  await expect(panel.locator(".map-papers li").first()).toBeVisible();
});
