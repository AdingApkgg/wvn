import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// 几何验收使用合成图片，不依赖远端图片可用性；沿用目录的真实尺寸元数据。
const covers = JSON.parse(readFileSync("data/metadata.json", "utf8")).works
  .map((work: any) => work.cover).filter(Boolean);
async function mockCoverImages(page: Page) {
  await page.route("**/media/**", route => {
    const cover = covers.find((cover: any) => cover.url === new URL(route.request().url()).pathname);
    const width = cover?.width ?? (cover?.kind === "logo" ? 480 : 200);
    const height = cover?.height ?? (cover?.kind === "logo" ? 200 : 300);
    return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="teal"/></svg>` });
  });
}
test.beforeEach(async ({ page }) => mockCoverImages(page));

test("mixed covers keep their proportions and align within each gallery row", async ({ page }) => {
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const cards = page.locator(".story-card").filter({ has: page.locator("img") });
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

test("a single filtered portrait stays modest and wide artwork gets a horizontal card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?q=ATRI&engine=Artemis");
  await expect(page.locator(".story-card")).toHaveCount(1);
  const art = await page.locator(".card-art").boundingBox();
  expect(art!.width).toBeLessThan(260);
  await page.locator(".story-card").click();
  await expect(page).toHaveURL(/\/27448\/$/);
  await page.route("**/media/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"/>' }));
  await page.goto("/?q=ATRI&engine=Artemis");
  const card = page.locator(".story-card");
  const image = card.locator("img");
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const media = await card.locator(".card-art").boundingBox();
  const body = await card.locator(".card-body").boundingBox();
  expect(body!.x).toBeGreaterThan(media!.x + media!.width);
  expect(media!.height).toBeLessThan(260);
  await page.screenshot({ path: "reports/poster-wide.png", animations: "disabled" });
  await page.setViewportSize({ width: 320, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// 加载后的真实尺寸必须能覆盖元数据；布局不能只让图片在固定框内 contain。
test("loaded square and wide artwork update the card geometry", async ({ page }) => {
  let ratio = 1;
  await page.route("**/media/**", route => route.fulfill({
    contentType: "image/svg+xml",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${ratio * 200}" height="200"><rect width="100%" height="100%" fill="teal"/></svg>`,
  }));
  for (ratio of [1, 3]) {
    await page.goto("/?q=ATRI&engine=Artemis");
    const card = page.locator(".story-card");
    await expect(card).toHaveCount(1);
    await expect.poll(() => card.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight)).toBe(ratio);
    await expect.poll(async () => {
      const box = await card.locator(".card-art").boundingBox();
      return Math.abs(box!.width / box!.height - ratio);
    }).toBeLessThan(0.05);
    if (ratio > 2.2) {
      await expect(card).toHaveClass(/story-card-wide/);
      const art = await card.locator(".card-art").boundingBox();
      const body = await card.locator(".card-body").boundingBox();
      expect(body!.x).toBeGreaterThan(art!.x + art!.width);
    }
  }
});

test("without JavaScript cover metadata preserves proportions", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await mockCoverImages(page);
    await page.goto((process.env.WG_TEST_URL ?? "http://127.0.0.1:8281") + "/?q=ATRI&engine=Artemis");
    const card = page.locator(".story-card");
    await expect(card).toHaveCount(1);
    const image = card.locator("img");
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    const ratio = await image.evaluate((el: HTMLImageElement) => Number(el.getAttribute("width")) / Number(el.getAttribute("height")));
    const art = await card.locator(".card-art").boundingBox();
    expect(art!.width / art!.height).toBeCloseTo(ratio, 1);
  } finally { await context.close(); }
});
