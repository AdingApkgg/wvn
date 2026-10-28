// 仅用于独立 Compose 预览；不读取或登录原生产账号。
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { previewChromiumOptions } from "../../scripts/lib/preview-browser.mjs";
import { players } from "../../public/player/registry.mjs";
import {
  enterNativeStory,
  nativePoint,
  isNativeBodyCheckpoint,
  advanceNativeStory,
  nativeDialogueChanged,
} from "../../scripts/lib/renpy-native-menu.mjs";
const output = process.env.WVN_QA_REPORT ?? "/qa/browser.json";
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(process.env.HOME ?? "/tmp/wvn-browser", { recursive: true });
const options = previewChromiumOptions(process.env.WVN_QA_CERT);
options.args.push(
  "--enable-unsafe-swiftshader",
  "--autoplay-policy=no-user-gesture-required",
);
if (process.env.WVN_QA_PROXY)
  options.proxy = {
    server: process.env.WVN_QA_PROXY,
    bypass: "localhost,127.0.0.1",
  };
const browser = await chromium.launch(options),
  results = [];
let stage = "web",
  activePage;
const pulse = setInterval(
  () => console.log(JSON.stringify({ stage, at: new Date().toISOString() })),
  30000,
);
pulse.unref();
async function pageFor() {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (d) => d.accept());
  activePage = page;
  return { context, page, errors };
}
try {
  const web = process.env.WVN_WEB_ORIGIN;
  {
    const { context, page, errors } = await pageFor();
    assert.equal(
      (await page.goto(web, { waitUntil: "networkidle" })).status(),
      200,
    );
    assert((await page.locator("body").innerText()).includes("ATRI"));
    assert.equal(
      (
        await page.goto(web + "/account", { waitUntil: "networkidle" })
      ).status(),
      200,
    );
    const login = await page.request.get(web + "/api/login-options");
    assert.equal(login.status(), 200);
    assert.equal((await login.json()).passkey, true);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.dirname(output) + "/web.png" });
    results.push({ service: "web", status: "passed", errors });
    await context.close();
  }
  stage = "manager";
  {
    const { context, page, errors } = await pageFor();
    await page.goto(process.env.WVN_MANAGER_ORIGIN + "/manage", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByLabel("本次服务启动令牌")
      .fill(fs.readFileSync(process.env.WVN_MANAGER_TOKEN_FILE, "utf8").trim());
    const authenticated = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/manage/login" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "登录管理", exact: true }).click();
    assert.equal(
      (await authenticated).status(),
      200,
      "Manager startup token is single use; recreate the isolated manager before QA",
    );
    await page.getByRole("tab", { name: "引擎与 SDK", exact: true }).click();
    await page
      .getByRole("heading", { name: "引擎与 SDK", exact: true })
      .waitFor();
    const summary = await page.evaluate(async () => {
      const r = await fetch("/api/manage/engines");
      return { status: r.status, data: await r.json() };
    });
    assert.equal(summary.status, 200);
    assert.equal(summary.data.versions, 79);
    assert.equal(summary.data.emscriptenVersions, 68);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.dirname(output) + "/manager.png" });
    results.push({
      service: "manager",
      status: "passed",
      versions: 79,
      errors,
    });
    await context.close();
  }
  if (process.env.WVN_B2_ORIGIN) {
    const origin = process.env.WVN_B2_ORIGIN,
      release = JSON.parse(
        fs.readFileSync("/run/wvn-b2/candidate.json", "utf8"),
      ).release.id;
    for (const id of ["clannad", "renpy-v50789-1"]) {
      stage = "b2-" + id;
      const entry = players.find((p) => p.id === id),
        { context, page, errors } = await pageFor(),
        network = [],
        sources = [];
      page.on("response", async (r) => {
        if (!/\/__(?:player|ons|engines)\//.test(r.url())) return;
        const h = await r.allHeaders().catch(() => ({}));
        if (r.status() >= 400)
          network.push({ status: r.status(), url: r.url() });
        if (h["x-wvn-resource-source"] === "b2") sources.push(r.url());
      });
      page.on("requestfailed", (r) => {
        if (!r.failure()?.errorText.includes("ERR_ABORTED"))
          network.push({ url: r.url(), error: r.failure()?.errorText });
      });
      // 候选策略按版本自动启用；?engine= 仅用于已有兼容证明的运行时策略。
      assert.equal(
        (
          await page.goto(origin + entry.route, {
            waitUntil: "domcontentloaded",
          })
        ).status(),
        200,
      );
      if (id.startsWith("renpy")) {
        await page.getByRole("note").filter({ hasText: "候选引擎" }).waitFor();
      }
      async function start() {
        const read = page.waitForResponse(
          (r) =>
            r.status() === 200 &&
            r.request().method() === "POST" &&
            new URL(r.url()).pathname ===
              "/api/public/works/" + entry.workId + "/read",
          { timeout: 480000 },
        );
        read.catch(() => {});
        await page
          .getByRole("button", { name: /^(开始阅读|继续阅读)$/ })
          .click();
        await page.waitForFunction(() => !!document.querySelector("iframe"));
        await read;
        const frame = page
          .frames()
          .find((f) => /\/__(ons\/runtime|player\/resource)\//.test(f.url()));
        assert(frame);
        await frame.waitForFunction(
          (kind) =>
            kind === "ONS"
              ? !!globalThis.g_onsyuri_module?.FS
              : !!globalThis.Module?.calledRun,
          entry.runtimeKind ?? "ONS",
          { timeout: 180000 },
        );
        return frame;
      }
      const frame = await start();
      const isolation = await frame.evaluate(() => {
        let parentDenied = false;
        try {
          void parent.document.body;
        } catch {
          parentDenied = true;
        }
        return { origin: self.origin, parentDenied };
      });
      assert.equal(isolation.origin, "null");
      assert(isolation.parentDenied);
      let bodyAdvanced;
      if (id.startsWith("renpy")) {
        const command = (script) =>
          frame.evaluate(
            async (script) =>
              await Promise.race([
                renpy_exec(script),
                new Promise((_, reject) =>
                  setTimeout(() => reject(Error("RenPy query timeout")), 20000),
                ),
              ]),
            script,
          );
        await enterNativeStory(page, frame, command, id);
        const deadline = Date.now() + 300000;
        let before, after;
        while (Date.now() < deadline) {
          before = await nativePoint(command, id);
          if (isNativeBodyCheckpoint(before, id)) break;
          await advanceNativeStory(page, frame, command);
        }
        assert(isNativeBodyCheckpoint(before, id));
        for (let n = 0; n < 20; n++) {
          await advanceNativeStory(page, frame, command);
          after = await nativePoint(command, id);
          if (nativeDialogueChanged(before, after)) break;
        }
        assert(nativeDialogueChanged(before, after));
        bodyAdvanced = true;
      }
      await page.screenshot({ path: path.dirname(output) + "/" + id + ".png" });
      await page
        .getByRole("button", { name: "保存并退出", exact: true })
        .click();
      await page
        .getByRole("button", { name: /^(开始阅读|继续阅读)$/ })
        .waitFor({ timeout: 45000 });
      assert.equal(await page.locator("iframe").count(), 0);
      await start();
      await page
        .getByRole("button", { name: "保存并退出", exact: true })
        .click();
      await page
        .getByRole("button", { name: /^(开始阅读|继续阅读)$/ })
        .waitFor({ timeout: 45000 });
      assert(sources.length > 0);
      if (id.startsWith("renpy")) {
        assert(
          sources.some((url) =>
            url.includes("/__engines/resource/" + release + "/"),
          ),
          "Shared engine must come from B2",
        );
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(network, []);
      results.push({
        service: "b2-preview",
        id,
        status: "passed",
        bodyAdvanced,
        reentry: true,
        isolation,
        b2Responses: sources.length,
        errors,
        network,
      });
      await context.close();
    }
  }
  fs.writeFileSync(
    output,
    JSON.stringify(
      { status: "passed", results, checkedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ status: "passed", checks: results.length }));
} catch (error) {
  let failurePage;
  if (stage.startsWith("b2-") && activePage && !activePage.isClosed()) {
    failurePage = {
      url: activePage.url(),
      text: await activePage
        .locator("body")
        .innerText()
        .catch(() => ""),
    };
    await activePage
      .screenshot({ path: path.dirname(output) + "/failure.png" })
      .catch(() => {});
  }
  fs.writeFileSync(
    output,
    JSON.stringify(
      { status: "failed", stage, error: error.message, failurePage, results },
      null,
      2,
    ),
  );
  throw error;
} finally {
  clearInterval(pulse);
  await browser.close();
}
