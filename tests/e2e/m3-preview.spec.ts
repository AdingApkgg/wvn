import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { authenticator, register, api } from "../helpers/account-browser";
import { RULE_QUESTIONS } from "../../src/content/quiz";

// 本文件包含私有后台登录；所有截图只保留页面，不录制凭据或会话。
test.use({ trace: "off", video: "off" });

test("M3关键页面的桌面和手机实图", async ({ page }, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, route] of [["catalog", "/"], ["work", "/27448/"], ["login", "/account?tab=security"], ["content", "/content"], ["share-empty", "/s/m3-preview-missing"]]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), animations: "disabled" });
    }
  }
  await page.goto("/health");
  await authenticator(page);
  expect((await register(page, "M3 预览读者")).status).toBe(200);
  const attempt = (await api(page, "/api/me/content/attempts", {})).data;
  const answers = Object.fromEntries(attempt.questions.map((q: { id: string }) => [q.id, RULE_QUESTIONS.find(rule => rule.id === q.id)!.correctChoiceId]));
  expect((await api(page, `/api/me/content/attempts/${attempt.id}/submit`, { answers })).status).toBe(200);
  expect((await api(page, "/api/me/content/mode", { mode: "restricted" }, "PATCH")).status).toBe(200);
  expect((await api(page, "/api/me/library/v27448", { revision: 0, status: "playing", note: "M3 隔离预览示例" }, "PATCH")).status).toBe(200);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, route] of [["shelf", "/account?tab=library"], ["saves", "/account?tab=saves"], ["reader", "/27448/1/"]]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      if (name === "shelf") await expect(page.locator('[data-shelf-work="v27448"]')).toBeVisible();
      if (name === "reader") await expect(page.locator(".reader-surface")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), animations: "disabled" });
    }
  }
  expect(errors).toEqual([]);
});

test("私有目录与审核的只读预览", async ({ browser }, info) => {
  test.skip(!process.env.WG_M3_ADMIN_TOKEN_FILE || !process.env.WG_M3_SHARE_TOKEN_FILE, "需显式指定本任务隔离令牌文件");
  const base = new URL(process.env.WG_TEST_URL!);
  expect(base.port).toBe("24883");
  expect(base.protocol).toBe("https:");
  const errors: string[] = [];
  for (const [port, route, file, loginPath] of [
    [24884, "/manage", process.env.WG_M3_ADMIN_TOKEN_FILE!, "/api/manage/login"],
    [24885, "/share-admin", process.env.WG_M3_SHARE_TOKEN_FILE!, "/api/share-admin/login"],
  ] as const) {
    // 只在独立预览进程中读取令牌，绝不写入报告或截图。
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      const target = new URL(base); target.port = String(port);
      // 管理服务仅绑定 loopback；凭据只提交到本任务的 loopback。
      target.hostname = "localhost";
      // 禁止录制 trace/video；通过标准登录接口取得同一浏览器上下文的会话。
      const sessionFile = join(dirname(file), `m3-screenshot-session-${port}.json`);
      try { await context.addCookies(JSON.parse(readFileSync(sessionFile, "utf8")).cookies); } catch { /* 无既有验收会话。 */ }
      const checkPath = port === 24884 ? "/api/manage/catalog" : "/api/share-admin/queue";
      if ((await context.request.get(target.origin + checkPath)).status() !== 200) {
        const response = await context.request.post(target.origin + loginPath, { headers: { origin: target.origin }, maxRedirects: 0, data: { token: readFileSync(file, "utf8").trim() } });
        expect(response.status()).toBe(200);
        writeFileSync(sessionFile, JSON.stringify(await context.storageState()), { mode: 0o600 });
      }
      await page.goto(target.origin + route);
      if (port === 24884) await expect(page.getByRole("tab", { name: "作品与版本", exact: true })).toBeVisible();
      else await expect(page.getByRole("button", { name: "刷新审核队列", exact: true })).toBeVisible();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`${port === 24884 ? "manage" : "moderation"}-${width}.png`), animations: "disabled" });
      }
    } finally { await context.close(); }
  }
  expect(errors).toEqual([]);
});
