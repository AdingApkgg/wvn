import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test("desktop catalog search, work navigation, version URL and exit confirmation", async ({
  page,
}) => {
  await page.route("**/atri/**", (route) =>
    route.fulfill({
      body: "<title>ATRI fixture</title>",
      contentType: "text/html",
    }),
  );
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
  await page.getByRole("link", { name: "开始阅读" }).click();
  await expect(page).toHaveURL(/\/27448\/1\/?$/);
  await expect(page.locator("iframe")).toHaveAttribute("src", "/atri/");
  await page.locator(".player-bar button").first().click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
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
  await expect(page.getByRole("tab", { name: "作品与版本" })).toBeVisible();
  await page.getByPlaceholder("标题或 v / b 编号").fill("v27448");
  const editor = page.locator('[data-work-id="v27448"]');
  const toggle = editor.locator('[data-slot="accordion-trigger"]').first();
  await toggle.click();
  const title = editor.getByLabel("显示标题");
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
  await toggle.click();
  await expect(title).not.toBeVisible();
  await toggle.click();
  await expect(title).toHaveValue("ATRI 测试草稿");
  await page.getByRole("tab", { name: "来源与映射" }).click();
  await expect(
    page.getByRole("heading", { name: "来源去重与候选" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "作品与版本" }).click();
  await expect(title).toHaveValue("ATRI 测试草稿");
  const versionId = await page.evaluate(async () => {
    const response = await fetch("/api/manage/works/v27448/versions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "UI confirmation fixture",
        legacyPath: "/ui-confirm-fixture/",
        engine: "Artemis",
      }),
    });
    if (!response.ok) throw Error("Fixture creation failed");
    return (await response.json()).id;
  });
  await page.getByRole("button", { name: "刷新列表" }).click();
  const version = editor
    .locator(".version-edit")
    .filter({ hasText: versionId });
  await version.getByLabel("展示状态").selectOption("deleted");
  await version.getByRole("button", { name: "保存版本", exact: true }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "删除此版本的目录登记？",
  });
  await expect(confirm).toBeVisible();
  await expect(
    confirm.getByRole("button", { name: "取消", exact: true }),
  ).toBeFocused();
  await confirm.getByRole("button", { name: "取消", exact: true }).click();
  const persisted = () =>
    page.evaluate(async (id) => {
      const works = await (await fetch("/api/manage/catalog")).json();
      return works.flatMap((w: any) => w.versions).find((v: any) => v.id === id)
        .status;
    }, versionId);
  expect(await persisted()).toBe("published");
  await version.getByRole("button", { name: "保存版本", exact: true }).click();
  await confirm.getByRole("button", { name: "确认删除登记" }).click();
  await expect.poll(persisted).toBe("deleted");
  await expect(confirm).toHaveCount(0);
  await toggle.click();
  await page.getByPlaceholder("标题或 v / b 编号").fill("");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "reports/admin-desktop.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "reports/admin-mobile.png", fullPage: false });
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
    page.getByRole("link", { name: "BGM ↗" }),
  ).toHaveAttribute("href", "https://bgm.tv/subject/315601");
  await page.getByRole("link", { name: "开始阅读" }).click();
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
