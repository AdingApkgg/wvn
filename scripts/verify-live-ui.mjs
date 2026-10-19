// Read-only UI acceptance for the isolated preview. Token arrives on stdin, never in logs.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const publicUrl = process.env.WG_LIVE_PUBLIC_URL;
const adminUrl = process.env.WG_LIVE_ADMIN_URL;
for (const value of [publicUrl, adminUrl]) {
  if (!value || !["127.0.0.1", "localhost"].includes(new URL(value).hostname))
    throw Error("Use an explicit loopback preview URL");
}
let token = "";
for await (const chunk of process.stdin) token += chunk;
token = token.trim();
if (!/^[A-Za-z0-9_-]{40,60}$/.test(token))
  throw Error("Preview startup token missing");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const failures = [];
let metadataWrites = 0;
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("request", (request) => {
    if (
      !["GET", "HEAD"].includes(request.method()) &&
      new URL(request.url()).pathname.startsWith("/api/manage/") &&
      !request.url().endsWith("/login")
    )
      metadataWrites++;
  });
  await page.goto(adminUrl + "/manage");
  await page.getByLabel("本次服务启动令牌").fill(token);
  token = "";
  await page.getByRole("button", { name: "登录管理" }).click();
  await page.getByRole("tab", { name: "作品与版本" }).waitFor();
  assert.equal(
    await page
      .locator(".admin-stats strong")
      .allTextContents()
      .then((v) => v.join(",")),
    "64,79,0",
  );
  await mkdir("reports", { recursive: true });
  await page.screenshot({
    path: "reports/live-admin-desktop.png",
    animations: "disabled",
  });
  await page.getByPlaceholder("标题或 v / b 编号").fill("v27448");
  const editor = page.locator('[data-work-id="v27448"]');
  const toggle = editor.locator('[data-slot="accordion-trigger"]').first();
  await toggle.click();
  const title = editor.getByLabel("显示标题");
  const original = await title.inputValue();
  await title.fill("仅验证未保存草稿");
  await toggle.click();
  await toggle.click();
  assert.equal(await title.inputValue(), "仅验证未保存草稿");
  await page.getByRole("tab", { name: "来源与映射" }).click();
  await page.getByRole("heading", { name: "来源去重与候选" }).waitFor();
  await page.getByRole("tab", { name: "验证报告" }).click();
  await page.getByRole("heading", { name: "导入验证报告" }).waitFor();
  await page.getByRole("tab", { name: "作品与版本" }).click();
  assert.equal(await title.inputValue(), "仅验证未保存草稿");
  await title.fill(original);
  await toggle.click();
  await page.getByPlaceholder("标题或 v / b 编号").fill("");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Admin overflows " + width,
    );
    if (width === 390)
      await page.screenshot({
        path: "reports/live-admin-mobile.png",
        animations: "disabled",
      });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(publicUrl + "/");
  await page.getByRole("heading", { name: "故事目录" }).waitFor();
  await page.screenshot({
    path: "reports/live-catalog-desktop.png",
    animations: "disabled",
  });
  await page.goto(publicUrl + "/b315601/");
  await page.getByRole("link", { name: "在 BGM 查看 ↗" }).waitFor();
  await page.screenshot({
    path: "reports/live-work-desktop.png",
    animations: "disabled",
  });
  assert.deepEqual(failures, []);
  assert.equal(metadataWrites, 0);
  const result = {
    checkedAt: new Date().toISOString(),
    works: 64,
    versions: 79,
    pending: 0,
    adminTabs: true,
    draftsPreserved: true,
    mobileWidths: [390, 320],
    pageErrors: failures,
    metadataWrites,
  };
  await writeFile(
    "reports/live-ui-verification.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
