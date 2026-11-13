import { test, expect } from "@playwright/test";

test("桌面侧栏与平板导航轨为内容留出空间，手机保留底栏", async ({ page }, info) => {
  for (const width of [1440, 1200, 1199, 1024, 768, 721, 720, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const navigation = page.getByRole("navigation", { name: "主要导航" });
    const targets = await navigation.getByRole("link").all();
    expect(targets).toHaveLength(4);
    for (const link of targets) {
      await expect(link).toBeVisible();
      const rect = await link.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(48);
      expect(rect!.height).toBeGreaterThanOrEqual(48);
    }
    const first = (await targets[0].boundingBox())!;
    const second = (await targets[1].boundingBox())!;
    const content = (await page.locator("main").boundingBox())!;
    if (width > 720) {
      const sidebar = (await page.locator(".site-navigation").boundingBox())!;
      expect(sidebar.x).toBe(0);
      expect(sidebar.height).toBe(900);
      expect(sidebar.width).toBe(width >= 1200 ? 256 : 96);
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      expect(content.x).toBeGreaterThanOrEqual(sidebar.width);
      if (width === 1440 || width === 768) await page.screenshot({ path: info.outputPath(`sidebar-${width}.png`), animations: "disabled" });
      await page.evaluate(() => scrollTo(0, 600));
      expect((await page.locator(".site-navigation").boundingBox())!.y).toBe(0);
    } else {
      const bar = (await navigation.boundingBox())!;
      expect(bar.y + bar.height).toBeCloseTo(900, 0);
      expect(second.x).toBeGreaterThan(first.x);
      expect(content.x).toBeCloseTo((width - content.width) / 2, 0);
      expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingLeft))).toBe(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("侧栏支持键盘导航并在阅读器与私有后台移除占位", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "主要导航" });
  await navigation.getByRole("link", { name: "书架", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(navigation.getByRole("link", { name: "书架", exact: true })).toHaveAttribute("aria-current", "page");
  for (const path of ["/27448/1/", "/manage"]) {
    await page.goto(path);
    await expect(page.locator(".site-navigation")).toHaveCount(0);
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingLeft))).toBe(0);
  }
});
