import { test, expect } from "@playwright/test";

test("mixed covers keep their proportions and align within each gallery row", async ({ page }) => {
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const cards = page.locator(".story-card");
    for (const card of (await cards.all()).slice(0, 6)) {
      await card.scrollIntoViewIfNeeded();
      await expect.poll(() => card.locator("img").evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    }
    const rows = await cards.evaluateAll(elements => elements.slice(0, 6).map(el => {
      const art = el.querySelector(".card-art")!.getBoundingClientRect();
      const image = el.querySelector("img") as HTMLImageElement;
      return { top: el.getBoundingClientRect().top, width: art.width, height: art.height, ratio: image.naturalWidth / image.naturalHeight, fit: getComputedStyle(image).objectFit };
    }));
    for (const art of rows) {
      expect(art.width / art.height).toBeCloseTo(art.ratio, 1);
      expect(art.fit).toBe("contain");
      expect(art.width).toBeLessThanOrEqual(width);
    }
    for (const art of rows) {
      const peers = rows.filter(other => Math.abs(other.top - art.top) < 2);
      for (const peer of peers) expect(Math.abs(peer.height - art.height)).toBeLessThan(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440 || width === 390) {
      await page.evaluate(() => window.scrollTo(0, document.querySelector(".story-grid")!.getBoundingClientRect().top + scrollY - 72));
      await page.screenshot({ path: `reports/poster-catalog-${width}.png`, animations: "disabled" });
    }
  }
});

test("a single filtered portrait stays modest and a logo gets a horizontal card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?q=v27448");
  await expect(page.locator(".story-card")).toHaveCount(1);
  const art = await page.locator(".card-art").boundingBox();
  expect(art!.width).toBeLessThan(260);
  await page.locator(".story-card").click();
  await expect(page).toHaveURL(/\/27448\/$/);
  await page.goto("/?q=v8038");
  const card = page.locator(".story-card");
  const image = card.locator("img");
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const media = await card.locator(".card-art").boundingBox();
  const body = await card.locator(".card-body").boundingBox();
  expect(body!.x).toBeGreaterThan(media!.x + media!.width);
  expect(media!.height).toBeLessThan(260);
  await page.screenshot({ path: "reports/poster-logo.png", animations: "disabled" });
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
