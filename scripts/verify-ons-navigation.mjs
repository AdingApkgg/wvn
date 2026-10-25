import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const origin = process.env.WG_ONS_TEST_URL || "http://127.0.0.1:18481";
const browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"] });
try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, "oncomplete");
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", { ...descriptor, set(callback) {
      descriptor.set.call(this, typeof callback === "function" ? function(event) {
        if (window.__onsDelayCompletion) setTimeout(() => callback.call(this, event), 700);
        else callback.call(this, event);
      } : callback);
    } });
  });
  const page = await context.newPage();
  const events = [];
  page.on("domcontentloaded", () => events.push({ document: page.url() }));
  page.on("dialog", async dialog => { events.push({ dialog: dialog.type() }); await dialog.dismiss(); });
  await page.goto(origin + "/4/", { waitUntil: "networkidle" });
  await page.evaluate(() => { window.__onsNavigationMarker = "same-document"; });
  await page.locator('a[href="/4/1/"], a[href="/4/1"]').first().click();
  events.push({ spa: await page.evaluate(() => window.__onsNavigationMarker) });
  await page.getByRole("button", { name: "开始阅读", exact: true }).click();
  await page.getByRole("button", { name: "游戏菜单", exact: true }).waitFor();
  await page.evaluate(() => history.back());
  try { await page.getByRole("alertdialog").waitFor({ timeout: 5000 }); }
  catch (e) { console.log(JSON.stringify({ events, url: page.url(), status: await page.locator('[role="status"]').allTextContents(), body: (await page.locator("body").innerText()).slice(0, 450) })); throw e; }
  assert.match(new URL(page.url()).pathname, /^\/4\/1\/?$/);
  await page.getByRole("button", { name: "继续阅读", exact: true }).click();
  await page.getByRole("alertdialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("alertdialog").count(), 0);
  await page.getByRole("status").filter({ hasText: "引擎已启动" }).waitFor({ timeout: 60000 });
  await page.evaluate(() => { window.__onsDelayCompletion = true; history.back(); });
  await page.getByRole("alertdialog").waitFor();
  const started = Date.now();
  await page.getByRole("button", { name: "保存并离开", exact: true }).click();
  await page.waitForTimeout(200);
  assert.match(new URL(page.url()).pathname, /^\/4\/1\/?$/, "navigation must wait for durable completion acknowledgement");
  await page.waitForURL(/\/4\/?$/, { timeout: 10000 });
  const elapsed = Date.now() - started;
  assert(elapsed >= 600, "persist completion was not awaited");
  const result = { status: "passed", cases: ["spa-back-is-blocked-and-cancellable", "spa-back-waits-for-indexeddb-completion"], delayedAckMs: elapsed, events };
  mkdirSync("reports/ons-pilot", { recursive: true });
  writeFileSync("reports/ons-pilot/navigation.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await context.close();
} finally { await browser.close(); }
