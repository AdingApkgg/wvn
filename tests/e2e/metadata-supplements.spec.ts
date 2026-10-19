import { test, expect } from "@playwright/test";

test("supplemented metadata has complete fields and honest image/source attribution", async ({ page, request }) => {
  test.setTimeout(180_000);
  const catalog = await (await request.get("/api/catalog")).json();
  expect(catalog).toHaveLength(64);
  for (const work of catalog) {
    expect(work.metadata?.cover, work.id + " cover").toBeTruthy();
    expect(work.metadata?.description.trim(), work.id + " description").toBeTruthy();
  }
  const kinds = catalog.reduce((counts: Record<string, number>, w: any) => {
    const kind = w.metadata.cover.kind ?? "original";
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
  expect(kinds).toEqual({ original: 49, promotion: 7, logo: 5, screenshot: 3 });
  for (const [path, kind] of [["/8038/", "官方标题图"], ["/32805/", "官方宣传图"], ["/13190/", "游戏画面（封面备用）"]]) {
    await page.goto(path);
    const cover = page.locator(".work-cover");
    await expect(cover).toHaveAttribute("alt", new RegExp(kind.replace(/[()（）]/g, "\\$&")));
    await expect.poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.locator(".metadata-credit").filter({ hasText: kind }).first()).toBeVisible();
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  }
  await page.goto("/36555/");
  await expect(page.locator(".synopsis p")).toContainText("文化祭");
  await expect(page.locator(".synopsis .metadata-credit")).toContainText("中文整理");
  await expect(page.getByRole("link", { name: "官方 Garden Party 专题 ↗" })).toHaveAttribute("href", "https://sonokoi-horyu.net/gardenparty/");
  await page.goto("/b315601/");
  await expect(page.locator(".synopsis p")).toContainText("重新开始生活");
  await expect(page.getByRole("link", { name: "072 Project 发行商 ↗" })).toHaveAttribute("href", "https://072project.com/r18/jp/shop/RA24086637");
  await expect.poll(() => page.locator(".work-cover").evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: "reports/supplements-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "reports/supplements-mobile.png", fullPage: true });
});
