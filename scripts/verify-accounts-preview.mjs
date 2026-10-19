import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { chromium } from "@playwright/test";
import { previewChromiumOptions } from "./lib/preview-browser.mjs";
assert.equal(hostname(), "localhost", "Run only on the dedicated remote builder");
assert.equal(process.cwd(), "/home/wvn/wg-accounts-preview-20261019");
const origin = "https://localhost:18283";
const manifest = JSON.parse(readFileSync("reports/accounts-source-manifest.json", "utf8"));
for (const file of manifest.files) assert.equal(createHash("sha256").update(readFileSync(file.path)).digest("hex"), file.sha256, file.path);
mkdirSync("reports/accounts-preview", { recursive: true });
const browser = await chromium.launch(previewChromiumOptions("state/accounts-preview/tls.crt"));
const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
async function layout(label, width, height) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(dimensions.content <= dimensions.viewport + 1, label + " horizontal overflow");
  await page.screenshot({ path: `reports/accounts-preview/${label}.png`, fullPage: true });
  checks.push({ label, ...dimensions });
}
try {
  const health = await (await context.request.get(origin + "/health")).json();
  assert.equal(health.revision, manifest.revision);
  assert.equal((await context.request.get(origin + "/api/me")).status(), 401);
  const capabilities = await (await context.request.get(origin + "/api/login-options")).json();
  assert.equal(capabilities.password, false);
  await page.goto(origin + "/account");
  await page.getByRole("button", { name: "创建通行密钥并注册" }).waitFor();
  await layout("anonymous-desktop", 1440, 1000);
  await layout("anonymous-mobile", 390, 844);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.getByLabel("昵称").fill("预览验收 · 合成账号");
  await page.getByLabel("预览邀请码").fill(readFileSync("state/accounts-preview/invite", "utf8").trim());
  await page.getByRole("button", { name: "创建通行密钥并注册" }).click();
  await page.getByRole("heading", { name: "我的故事", exact: true }).waitFor();
  await layout("library-mobile", 390, 844);
  await layout("library-desktop", 1440, 1000);
  assert.deepEqual(errors, []);
  const status = await page.evaluate(async () => {
    const me = await (await fetch("/api/me")).json();
    const response = await fetch("/api/me", { method: "DELETE", headers: { "content-type": "application/json", "x-wg-binding": me.binding }, body: JSON.stringify({ confirmation: "DELETE" }) });
    return response.status;
  });
  assert.equal(status, 200, "Delete the isolated synthetic acceptance account");
  assert.equal((await context.request.get(origin + "/api/me")).status(), 401);
  const receipt = { status: "passed", checkedAt: new Date().toISOString(), host: hostname(), origin, revision: manifest.revision, sourceFilesVerified: manifest.files.length, serverBuildSha256: createHash("sha256").update(readFileSync("build/server/index.js")).digest("hex"), checks, pageErrors: errors, virtualPasskey: "passed", syntheticAccountDeleted: true, productionChanged: false, hardwarePasskey: "not tested", automaticGameSaves: "disabled" };
  writeFileSync("reports/accounts-preview/acceptance.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
} finally { await context.close(); await browser.close(); }
