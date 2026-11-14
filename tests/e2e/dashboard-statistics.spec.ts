import { join } from "node:path";
import { expect, test } from "@playwright/test";

const root = process.env.WG_STATISTICS_TEST_ROOT;
const origin = process.env.WG_STATISTICS_TEST_URL;
test.skip(!root || !origin, "需要本任务独立统计预览");
test.use({
  storageState: root ? join(root, "private/admin-state.json") : undefined,
});

test("内部统计图表可切换范围、重试，并适应窄屏", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin + "/dash");
  await expect(
    page.getByRole("heading", { name: "全站概览", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dashboard-stats strong")).toHaveCount(4);
  await expect(page.locator(".statistics-chart svg").first()).toBeVisible();
  await expect(page.locator(".statistics-metrics")).toContainText(
    "被引用存档容量",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    const boxes = await page.locator(".statistics-chart").evaluateAll((nodes) =>
      nodes.map((node) => ({
        w: node.getBoundingClientRect().width,
        h: node.getBoundingClientRect().height,
      })),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(boxes.every((b) => b.w > 100 && b.h >= 200)).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("statistics-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("statistics-mobile.png"),
    fullPage: true,
  });
  for (const days of ["7", "90"]) {
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/api/dash/statistics") &&
        new URL(r.url()).searchParams.get("days") === days,
    );
    await page.getByLabel("趋势范围").selectOption(days);
    const result = await response;
    expect(result.status()).toBe(200);
    expect((await result.json()).trend).toHaveLength(Number(days));
    await expect(
      page.getByRole("heading", { name: `最近 ${days} 天`, exact: true }),
    ).toBeVisible();
  }
  await page.getByText("查看每日趋势数据", { exact: true }).click();
  await expect(page.locator(".statistics-trend-table tbody tr")).toHaveCount(
    90,
  );
  await page.route("**/api/dash/statistics*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"code":"STATISTICS_UNAVAILABLE"}',
    }),
  );
  await page.getByRole("button", { name: "刷新概览", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "重试", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/dash/statistics*");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".dashboard-stats strong")).toHaveCount(4);
  const downloaded: string[] = [];
  page.on("request", (r) => downloaded.push(r.url()));
  await page.goto(origin + "/dash/users");
  await expect(
    page.getByRole("heading", { name: "用户管理", exact: true }),
  ).toBeVisible();
  expect(
    downloaded.some((url) => /dashboard-statistics-view.*\.js/.test(url)),
  ).toBe(false);
  expect(errors).toEqual([]);
});
