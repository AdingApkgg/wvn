import { test, expect } from "@playwright/test";
import { qualify } from "../helpers/qualify";

test("supplemented metadata has complete fields and honest image/source attribution", async ({ page }) => {
  test.setTimeout(180_000);
  await qualify(page);
  const catalog = await (await page.request.get("/api/catalog")).json();
  expect(catalog).toHaveLength(72);
  for (const work of catalog) {
    expect(work.metadata?.description.trim(), work.id + " description").toBeTruthy();
  }
  // 只有官方原始图片评分双零且有票数的素材才展示；待核实封面在投影时就置空，
  // 所以封面数与 kinds 分布只覆盖通过独立分级的那部分素材。
  const kinds = catalog.reduce((counts: Record<string, number>, w: any) => {
    const cover = w.metadata?.cover;
    if (!cover) return counts;
    const kind = cover.kind ?? "original";
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
  expect(kinds).toEqual({ original: 43, screenshot: 4 });
  const withCover = catalog.filter((w: any) => w.metadata?.cover);
  expect(withCover).toHaveLength(47);
  const hidden = catalog.filter((w: any) => !w.metadata?.cover);
  expect(hidden).toHaveLength(25);
  // 备用封面必须来自通过分级的游戏画面，并带可核对的来源标注。
  for (const slug of ["/13190/", "/6589/", "/37021/"]) {
    await page.goto(slug);
    const cover = page.locator(".work-cover");
    await expect(cover).toHaveAttribute("alt", /游戏画面（封面备用）/);
    await expect
      .poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);
    // 来源标注在可折叠的元数据区里，默认收起，因此断言存在而非可见。
    await expect(
      page.locator(".metadata-credit").filter({ hasText: "游戏画面（封面备用）" }).first(),
    ).toBeAttached();
    await expect(page.locator(".metadata-credit").filter({ hasText: "截图来自 VNDB" }).first()).toBeVisible();
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  }
  // 官方宣传图尚未完成视觉审查，页面照常渲染但不展示图片。
  for (const slug of ["/32805/", "/8038/"]) {
    await page.goto(slug);
    await expect(page.locator(".work-cover")).toHaveCount(0);
    await expect(page.locator("h1")).toBeVisible();
  }
  await page.goto("/36555/");
  await expect(page.locator(".synopsis p")).toContainText("文化祭");
  await expect(page.locator(".synopsis .metadata-credit")).toContainText("中文整理");
  await expect(
    page.locator('a[href="https://sonokoi-horyu.net/gardenparty/"]').first(),
  ).toBeAttached();
  await page.goto("/b315601/");
  await expect(page.locator(".synopsis p")).toContainText("重新开始生活");
  await expect(
    page.locator('a[href="https://072project.com/r18/jp/shop/RA24086637"]').first(),
  ).toBeAttached();
  await page.screenshot({ path: "reports/supplements-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "reports/supplements-mobile.png", fullPage: true });
});
