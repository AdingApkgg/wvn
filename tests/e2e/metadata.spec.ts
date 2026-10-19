import { test, expect } from "@playwright/test";
test("cached metadata images load under cross-origin isolation and tags filter the catalog", async ({
  page,
  request,
}) => {
  // The deployed preview is reached through two SSH tunnels carrying real images.
  test.setTimeout(180_000);
  await page.goto("/27448/");
  await expect(page.getByRole("heading", { name: "故事简介" })).toBeVisible();
  const cover = page.getByRole("img", { name: "ATRI 封面", exact: true });
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  const shot = page.locator(".screenshot-grid img").first();
  await shot.scrollIntoViewIfNeeded();
  await expect
    .poll(() => shot.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  const source = await shot.getAttribute("src");
  expect(source).toMatch(/^\/media\/[a-f0-9]{64}\.(jpg|png|webp)$/);
  expect((await request.get(source!)).headers()["content-type"]).toMatch(
    /^image\//,
  );
  const link = page.locator(".metadata-tags a").first(),
    tag = await link.innerText();
  await link.click();
  await expect(page).toHaveURL(/\?tag=/);
  const catalog = await (await request.get("/api/catalog")).json();
  const displayed = await page
    .locator(".story-card")
    .evaluateAll((cards) => cards.map((c) => c.getAttribute("href")));
  expect(displayed.length).toBeGreaterThan(0);
  expect(displayed.length).toBeLessThan(catalog.length);
  for (const url of displayed)
    expect(
      catalog
        .find((w: any) => w.url === url)
        .metadata.tags.some((t: any) => t.name === tag),
    ).toBe(true);
  await page.goto("/27448/");
  for (const screenshot of await page.locator(".screenshot-grid img").all()) {
    await screenshot.scrollIntoViewIfNeeded();
    await expect.poll(() => screenshot.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  }
  await page.screenshot({
    path: "reports/metadata-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "reports/metadata-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
