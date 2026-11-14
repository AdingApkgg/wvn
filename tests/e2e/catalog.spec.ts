import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { qualify } from "../helpers/qualify";

// 内容门禁关闭时（平台启动器）播放器会自动进入沙箱，起手按钮根本不出现；
// 门禁开启时则需要手动点一次。两种情况都归到同一个「iframe 已挂载」结果。
async function enterSandbox(page: import("@playwright/test").Page) {
  const start = page.locator('[data-testid="reader-start"]');
  try {
    await start.waitFor({ state: "visible", timeout: 10_000 });
    await start.click();
  } catch {
    // 已自动开始
  }
}
test("desktop catalog search, work navigation, version URL and exit confirmation", async ({
  page,
}) => {
  await qualify(page);
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
  // 门禁挂载且已登录时作品页给的是「取得资格后阅读」，未挂门禁才是「开始阅读」。
  await page.getByRole("link", { name: /^(?:开始阅读|取得资格后阅读|开启显示后阅读)$/ }).click();
  await expect(page).toHaveURL(/\/27448\/1\/?$/);
  await enterSandbox(page);
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    /^\/__player\/runtime\//,
  );
  await page.getByRole("link", { name: "返回作品" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "继续阅读", exact: true }).click();
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(page).toHaveURL(/\/27448\/1\/?$/);
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
test("public management never renders", async ({ request }) => {
  for (const path of ["/manage", "/manage.data", "/api/manage/catalog"])
    expect((await request.get(path)).status()).toBe(404);
});
test("private management edits persist and stale edit retains unsaved draft", async ({
  page,
}) => {
  const admin = process.env.WG_ADMIN_URL ?? "http://127.0.0.1:8282";
  const taskPreview=!!process.env.WG_TEST_URL&&process.env.WG_TEST_URL===process.env.WG_UI_UX_TEST_URL;
  const privateDir=process.env.WG_PRIVATE_DIR??resolve("..","private"),sessionFile=resolve(privateDir,"browser-admin-session.json");
  // 本目录没有 ../private 时（例如在重设计分支上跑），由 env 指向实际预览的私有目录；
  // 没有 preview-process 就退化为纯令牌登录，不依赖会话文件。
  const server=taskPreview?await readFile(resolve(privateDir,"preview-process.json"),"utf8").then(JSON.parse,()=>null):null;
  if(taskPreview&&server){try{const saved=JSON.parse(readFileSync(sessionFile,"utf8"));if(saved.pid===server.pid)await page.context().addCookies(saved.cookies)}catch{}}
  await page.goto(admin + "/manage");
  if((await page.request.get(admin+"/api/manage/catalog")).status()!==200){
  const token = readFileSync(
    process.env.WG_TEST_TOKEN_FILE ?? "state/admin-token",
    "utf8",
  );
  await page.getByLabel("本次服务启动令牌").fill(token);
  await page.getByRole("button", { name: "登录管理" }).click();
  }
  // 会话文件只是加速缓存，目录不存在也不影响令牌登录。
  if(taskPreview)try{writeFileSync(sessionFile,JSON.stringify({pid:server?.pid,cookies:await page.context().cookies(admin)}),{mode:0o600})}catch{}
  await expect(page.getByRole("tab", { name: "作品与版本" })).toBeVisible();
  await page.getByPlaceholder("标题或 v / b 编号").fill("v27448");
  const editor = page.locator('[data-work-id="v27448"]');
  const toggle = editor.locator('[data-slot="accordion-trigger"]').first();
  if(await toggle.getAttribute("aria-expanded")!=="true")await toggle.click();
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
  await page.getByRole("button", { name: "保存作品", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("记录已变化");
  expect(await page.evaluate(async()=>(await(await fetch("/api/manage/catalog")).json()).find((work:any)=>work.id==="v27448").title)).not.toBe("ATRI 测试草稿");
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
        legacyPath: "/ui-confirm-fixture-"+crypto.randomUUID()+"/",
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
  await page.getByRole("tab",{name:"内容分类",exact:true}).click();
  const classifications=page.getByRole("region",{name:"内容分类管理"}),reviews=classifications.getByRole("button",{name:"审核",exact:true});
  const classificationReason=classifications.getByRole("textbox",{name:"审核理由",exact:true});
  await reviews.nth(0).click();await classificationReason.fill("尚未提交的分类证据");
  await reviews.nth(1).click();await reviews.nth(0).click();
  await expect(classificationReason).toHaveValue("尚未提交的分类证据");
  const leaving=page.waitForEvent("dialog"),attempted=page.locator(".admin-heading a").click();
  const leaveDialog=await leaving;expect(leaveDialog.type()).toBe("beforeunload");await leaveDialog.dismiss();await attempted;
  await expect(classificationReason).toHaveValue("尚未提交的分类证据");
  await page.getByRole("tab",{name:"作品与版本",exact:true}).click();
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
  await qualify(page);
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
  await page.getByRole("link", { name: /^(?:开始阅读|取得资格后阅读|开启显示后阅读)$/ }).click();
  await expect(page).toHaveURL(/\/b315601\/1\/?$/);
  await enterSandbox(page);
  await expect(page.locator("iframe")).toHaveAttribute(
    "src",
    /^\/__player\/runtime\//,
  );
  await page.getByRole("link", { name: "返回作品" }).click();
  await page.getByRole("button", { name: "继续阅读", exact: true }).click();
  await expect(page.getByRole("alertdialog")).not.toBeVisible();
  await expect(page).toHaveURL(/\/b315601\/1\/?$/);
  for (const path of ["/b0315601/", "/b315601/01/", "/315601/"])
    expect((await request.get(path)).status()).toBe(404);
});

// 跨站（公开入口与账号入口不同 origin）时，把账号侧会话搬到公开入口后仍须按真实资格放行。
test("跨站部署时账号会话在公开入口同样生效", async ({ page }) => {
  const origin = process.env.WG_ACCOUNT_TEST_URL!;
  const target = new URL(process.env.WG_TEST_URL!);
  await page.goto(origin + "/health");
  const { authenticator, register, api } = await import("../helpers/account-browser");
  const { qualifyOnly } = await import("../helpers/qualify");
  await authenticator(page);
  expect((await register(page, "Probe Q")).status).toBe(200);
  await qualifyOnly(page);
  // 只有公开入口与账号入口分开部署（平台QA、双栈预览）才算跨站，单 origin 生产不需要搬迁。
  expect((await api(page, "/api/me/content")).status).toBe(200);
  const cookies = await page.context().cookies(origin);
  await page.context().addCookies(cookies.map(({ name, value, expires, httpOnly, secure, sameSite }) => ({
    name, value, domain: target.hostname, path: "/", ...(expires > 0 ? { expires } : {}), httpOnly, secure, sameSite,
  })));
  await page.goto(target.origin + "/?q=" + encodeURIComponent("死宅天使"));
  // 关键词命中 NSFW 作品，说明公开入口已按回源资格投影目录，而不是退回匿名视图。
  await expect(page.locator(".story-card")).toHaveCount(1);
  const catalog = await page.evaluate(async () => {
    const r = await fetch("/api/catalog");
    const j = await r.json();
    return [r.status, Array.isArray(j) ? j.some((w: { id: string }) => w.id === "b315601") : null];
  });
  expect(catalog).toEqual([200, true]);
  const me = await page.evaluate(async () => (await fetch("/api/me")).status);
  expect(me).toBe(200);
});
