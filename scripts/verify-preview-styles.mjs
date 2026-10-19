import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { chromium } from "@playwright/test";
import { previewChromiumOptions } from "./lib/preview-browser.mjs";

assert.equal(hostname(), "localhost");
assert.equal(process.cwd(), "/home/wvn/wg-accounts-preview-20261019");
const acceptance = JSON.parse(
  readFileSync("reports/sharing-preview/acceptance.json", "utf8"),
);
const revision = readFileSync("reports/sharing-source-revision", "utf8").trim();
const targets = [
  ["account", "https://localhost:18283/account"],
  ["moderation", "https://localhost:18285/share-admin"],
  ["source", acceptance.publicReshareUrl],
  ["work", acceptance.publicWorkUrl],
];
for (const [, target] of targets) {
  const url = new URL(target);
  assert.ok(
    [
      "https://localhost:18283",
      "https://localhost:18285",
      "http://127.0.0.1:18284",
    ].includes(url.origin),
  );
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
}
const runs = [];
let failure;
try {
  for (let round = 0; round < 20; round++) {
    const browser = await chromium.launch(
      previewChromiumOptions("state/accounts-preview/tls.crt"),
    );
    try {
      for (const [role, url] of targets) {
        const context = await browser.newContext({
          ignoreHTTPSErrors: false,
          viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();
        const requests = [],
          bodies = [];
        const record = { round, role, requests };
        runs.push(record);
        page.on("requestfailed", (request) => {
          const path = new URL(request.url()).pathname;
          if (/^\/assets\/[A-Za-z0-9_-]+\.css$/.test(path))
            requests.push({ path, error: request.failure()?.errorText });
        });
        page.on("response", (response) => {
          const path = new URL(response.url()).pathname;
          if (!/^\/assets\/[A-Za-z0-9_-]+\.css$/.test(path)) return;
          bodies.push(
            (async () => {
              const body = await response.body();
              const expected = readFileSync("build/client" + path);
              const sha256 = createHash("sha256").update(body).digest("hex");
              requests.push({
                path,
                status: response.status(),
                bytes: body.length,
                sha256,
              });
              assert.equal(response.status(), 200);
              assert.equal(
                sha256,
                createHash("sha256").update(expected).digest("hex"),
              );
            })().catch(() => {
              requests.push({ path, error: "STYLE_RESPONSE_INVALID" });
            }),
          );
        });
        try {
          await page.goto(url);
          await page.waitForFunction(
            () =>
              getComputedStyle(document.documentElement)
                .getPropertyValue("--background")
                .trim() === "#13151b",
            null,
            { timeout: 5000 },
          );
          await Promise.all(bodies);
          assert.ok(requests.some((r) => r.status === 200));
          assert.ok(requests.every((r) => !r.error));
          record.theme = await page.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue("--background")
              .trim(),
          );
          record.width = await page.evaluate(
            () => document.documentElement.scrollWidth,
          );
          assert.ok(record.width <= 391);
          if (round === 19)
            await page.screenshot({
              path: `reports/sharing-preview/styles-final-${role}.png`,
              fullPage: true,
            });
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
    console.log(JSON.stringify({ round, pages: runs.length }));
  }
} catch (error) {
  failure = error;
}
const report = {
  status: failure ? "failed" : "passed",
  checkedAt: new Date().toISOString(),
  revision,
  rounds: 20,
  pages: runs.length,
  ignoreHTTPSErrors: false,
  trust: "current preview certificate public key; Node process-local CA",
  ...(failure ? { error: failure.name } : {}),
  runs,
  productionChanged: false,
};
writeFileSync(
  "reports/sharing-preview/styles-acceptance.json",
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
if (failure) {
  console.error(
    JSON.stringify({ code: "PREVIEW_STYLES_FAILED", pages: runs.length }),
  );
  process.exitCode = 1;
}
