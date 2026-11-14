import { test, expect } from "@playwright/test";

test("首页卡片同步版本分类，默认SFW仍注明未核实，语言不显示空占位", async ({ page, request }) => {
  const works = await (await request.get("/api/catalog")).json();
  await page.goto("/");
  for (const work of works) {
    // 使用链接精确定位，避免相近作品标题互相匹配。
    const exactCard = page.locator(`.story-card[href="${work.url}"]`);
    const labels = new Set<string>();
    for (const version of work.versions) {
      const classification = version.classification;
      labels.add(classification?.sexualContent === "present" ? "NSFW"
        : classification?.sexualContent === "none" ? (classification.source.startsWith("user-default:sfw-unverified:") ? "默认 SFW · 未核实" : "SFW")
        : "内容待核实");
    }
    for (const label of labels) {
      await expect(exactCard.getByLabel("版本内容分类").getByText(label, { exact: true })).toBeVisible();
    }
    await expect(exactCard.locator(".card-meta")).not.toContainText("未标注");
  }
});

test("分类标签在窄屏和桌面不溢出", async ({ page }, testInfo) => {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".story-card").first().getByLabel("版本内容分类")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`card-classification-${width}.png`), animations: "disabled" });
  }
});
