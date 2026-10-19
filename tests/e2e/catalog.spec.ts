import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("desktop catalog search, work navigation, version URL and exit confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "故事目录" })).toBeVisible();
  await page.screenshot({
    path: "reports/catalog-desktop.png",
    fullPage: false,
  });
  await page.getByRole("searchbox").fill("ATRI");
  await page.getByRole("button", { name: "查找" }).click();
  await expect(page.locator(".story-card")).toHaveCount(1);
  await page.locator(".story-card").click();
  await expect(page).toHaveURL(/\/27448\/?$/);
  await expect(
    page.getByRole("heading", { name: "ATRI", exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "开始 ↗" }).click();
  await expect(page).toHaveURL(/\/27448\/1\/?$/);
  await expect(page.locator("iframe")).toHaveAttribute("src", "/atri/");
  await page.locator(".player-bar button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "离开", exact: true }).click();
  await expect(page).toHaveURL(/\/27448\/?$/);
});
test("mobile, empty results and malformed IDs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("searchbox")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "reports/catalog-mobile.png",
    fullPage: false,
  });
  await page.getByRole("searchbox").fill("does-not-exist-000");
  await page.getByRole("button", { name: "查找" }).click();
  await expect(
    page.getByRole("heading", { name: "暂时没有匹配的故事" }),
  ).toBeVisible();
  const response = await page.goto("/027448/");
  expect(response?.status()).toBe(404);
});
test("public management never renders", async ({ page, request }) => {
  for (const path of ["/manage", "/manage.data", "/api/manage/catalog"])
    expect((await request.get(path)).status()).toBe(404);
});
test("private management edits persist and stale edit retains unsaved draft", async ({
  page,
}) => {
  const admin = process.env.WG_ADMIN_URL ?? "http://127.0.0.1:8282";
  await page.goto(admin + "/manage");
  const token = readFileSync(
    process.env.WG_TEST_TOKEN_FILE ?? "state/admin-token",
    "utf8",
  );
  await page.getByLabel("本次服务启动令牌").fill(token);
  await page.getByRole("button", { name: "登录管理" }).click();
  await expect(
    page.getByRole("heading", { name: "来源去重与候选" }),
  ).toBeVisible();
  await page.getByPlaceholder("标题或 v / b 编号").fill("v27448");
  await page.locator("details.panel>summary").click();
  const title = page.locator("details.panel").getByLabel("显示标题");
  await title.fill("ATRI 测试草稿");
  await page.evaluate(async () => {
    const w = (await (await fetch("/api/manage/catalog")).json()).find(
      (x: any) => x.id === "v27448",
    );
    await fetch("/api/manage/works/v27448", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: w.revision, patch: { title: w.title } }),
    });
  });
  await page.getByRole("button", { name: "保存作品", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("记录已变化");
  await expect(title).toHaveValue("ATRI 测试草稿");
  await page.getByRole("button", { name: "刷新列表" }).click();
  await expect(title).toHaveValue("ATRI 测试草稿");
});

test("Bangumi fallback search and hydrated navigation preserve the legacy execution path", async ({
  page,
  request,
}) => {
  await page.route("**/" + encodeURI("死宅天使") + "/**", (route) =>
    route.fulfill({
      body: "<title>Resource path fixture</title>",
      contentType: "text/html",
    }),
  );
  await page.goto("/");
  await page.getByRole("searchbox").fill("死宅天使");
  await page.getByRole("button", { name: "查找" }).click();
  await expect(page.locator(".story-card")).toHaveCount(1);
  await page.locator(".story-card").click();
  await expect(page).toHaveURL(/\/b315601\/?$/);
  await expect(
    page.getByRole("heading", { name: "尼特与天使与色色家族", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "在 BGM 查看 ↗" }),
  ).toHaveAttribute("href", "https://bgm.tv/subject/315601");
  await page.getByRole("link", { name: "开始 ↗" }).click();
  await expect(page).toHaveURL(/\/b315601\/1\/?$/);
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    encodeURI("/死宅天使/"),
  );
  await page.locator(".player-bar button").first().click();
  await page.getByRole("button", { name: "离开", exact: true }).click();
  await expect(page).toHaveURL(/\/b315601\/?$/);
  for (const path of ["/b0315601/", "/b315601/01/", "/315601/"])
    expect((await request.get(path)).status()).toBe(404);
});
