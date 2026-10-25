import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const origin = process.env.WG_ONS_TEST_URL || "http://127.0.0.1:18481";
mkdirSync("reports/ons-pilot", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.WG_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--disable-background-networking"], proxy: { server: "http://127.0.0.1:10808", bypass: "localhost,127.0.0.1" } });
const results = [], errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  for (const [pilot, path, title] of [["clannad", "/4/1/", "CLANNAD"], ["saya", "/97/1/", "沙耶之歌"]]) {
    const page = await context.newPage();
    let securityProbe = false;
    page.on("pageerror", e => errors.push({ pilot, error: e.message }));
    page.on("console", m => { if (m.type() === "error") errors.push({ pilot, securityProbe, console: m.text().slice(0, 450) }); });
    await page.goto(origin + path, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "开始阅读", exact: true }).click();
    const frame = await page.waitForEvent("framenavigated", { predicate: f => f.url().includes("/__ons/runtime/"), timeout: 10000 }).catch(() => page.frames().find(f => f.url().includes("/__ons/runtime/")));
    assert(frame, "sandbox frame exists");
    await page.waitForFunction(() => /引擎已启动|启动失败|引擎停止/.test(document.querySelector('[role="status"]')?.textContent || ""), null, { timeout: 90000 });
    assert.match(await page.getByRole("status").textContent(), /引擎已启动/);
    await frame.waitForFunction(() => globalThis.g_onsyuri_module?.FS && document.querySelector("canvas").width > 0, null, { timeout: 60000 });
    await page.waitForTimeout(8000);
    securityProbe = true;
    const isolation = await frame.evaluate(async () => {
      let parentBlocked = false, storageBlocked = false, privateBlocked = false;
      try { void parent.document.body; } catch { parentBlocked = true; }
      try { indexedDB.open("wg-ons-pilot-v1"); } catch { storageBlocked = true; }
      try { await fetch("/api/catalog", { credentials: "include" }); } catch { privateBlocked = true; }
      return { parentBlocked, storageBlocked, privateBlocked, files: g_onsyuri_module.FS.readdir("/save"), width: document.querySelector("canvas").width, height: document.querySelector("canvas").height };
    });
    assert(isolation.parentBlocked && isolation.storageBlocked && isolation.privateBlocked, JSON.stringify(isolation));
    await page.screenshot({ path: `reports/ons-pilot/${pilot}-desktop.png`, fullPage: true });
    results.push({ pilot, title, isolation, status: "started" });
    await page.close({ runBeforeUnload: false });
  }
  const upper = await context.newPage();
  await upper.goto(origin + "/97/1/", { waitUntil: "networkidle" });
  await upper.getByRole("button", { name: "开始阅读", exact: true }).waitFor();
  await upper.evaluate(async () => {
    const s = await (await import("/ons/storage.mjs")).openSaveStore();
    try { const h = await s.get("saya"); await s.commit("saya", h?.revision ?? 0, { schema: 1, pilot: "saya", files: [{ path: "ENVDATA", data: new Uint8Array(), mtime: 1609459200000 }] }, "file-import"); } finally { s.close(); }
  });
  await upper.getByRole("button", { name: "开始阅读", exact: true }).click();
  await upper.getByRole("status").filter({ hasText: "引擎已启动" }).waitFor({ timeout: 60000 });
  const upperFrame = upper.frames().find(f => f.url().includes("/__ons/runtime/"));
  const settings = await upperFrame.evaluate(() => ({ link: g_onsyuri_module.FS.readlink("/game/envdata"), files: g_onsyuri_module.FS.readdir("/save") }));
  assert.equal(settings.link, "/save/ENVDATA", "restored settings retain exact path spelling");
  assert(!settings.files.includes("envdata"), "no case-fold duplicate settings file");
  await upper.getByRole("button", { name: "结束阅读并保留存档", exact: true }).click();
  await upper.getByRole("button", { name: "开始阅读", exact: true }).waitFor();
  results.push({ case: "uppercase-envdata-restoration", status: "passed", settings });
  await upper.close();
  await context.close();
  writeFileSync("reports/ons-pilot/startup.json", JSON.stringify({ status: "passed", results, errors }, null, 2));
  console.log(JSON.stringify({ status: "passed", results, errors }));
} catch (e) {
  writeFileSync("reports/ons-pilot/startup.json", JSON.stringify({ status: "failed", error: e.message, results, errors }, null, 2));
  for (const page of browser.contexts().flatMap(c => c.pages())) await page.screenshot({ path: "reports/ons-pilot/startup-failure.png", fullPage: true }).catch(() => {});
  throw e;
} finally { await browser.close(); }
