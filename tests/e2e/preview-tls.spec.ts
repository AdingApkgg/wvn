import { test, expect, chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = process.env.WG_SHARING_TEST_URL;
const certificate = process.env.WG_SHARING_TEST_CERT;
test.skip(!origin || !certificate, "Remote sharing TLS fixture only");

async function options(path: string) {
  const module = await import("../../scripts/lib/preview-browser.mjs").catch(
    () => null,
  );
  assert.ok(
    module?.previewChromiumOptions,
    "Explicit preview certificate trust must exist",
  );
  return module.previewChromiumOptions(path);
}

test("preview browser and API trust the fixture certificate without ignoring HTTPS errors", async () => {
  const browser = await chromium.launch(await options(certificate!));
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: false });
    const page = await context.newPage();
    const stylesheet = page.waitForResponse((r) =>
      new URL(r.url()).pathname.endsWith(".css"),
    );
    await page.goto(origin! + "/account");
    expect((await stylesheet).status()).toBe(200);
    // 只证明样式表真的生效，不钉死主题色：`--background` 现在由 `--paper`
    // 的 oklch 令牌转一层，写死十六进制会在每次调色时误报。
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          token: getComputedStyle(document.documentElement)
            .getPropertyValue("--background")
            .trim(),
          painted: getComputedStyle(document.body).backgroundColor,
        })),
      )
      // Chromium 对 oklch 令牌的计算值原样返回 oklch(...)，不一律折成 rgb(...)。
      .toEqual({
        token: expect.stringMatching(/\S/),
        painted: expect.stringMatching(/^(?:rgb|oklch)\(/),
      });
    expect((await context.request.get(origin! + "/health")).status()).toBe(200);
  } finally {
    await browser.close();
  }
});

test("trusting a different localhost certificate does not bypass browser certificate errors", async () => {
  const root = mkdtempSync(join(tmpdir(), "wg-wrong-certificate-"));
  try {
    const wrong = join(root, "unrelated.crt");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        join(root, "unrelated.key"),
        "-out",
        wrong,
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost",
      ],
      { stdio: "ignore" },
    );
    const browser = await chromium.launch(await options(wrong));
    try {
      const context = await browser.newContext({ ignoreHTTPSErrors: false });
      const page = await context.newPage();
      await expect(page.goto(origin! + "/account")).rejects.toThrow(
        /ERR_CERT_AUTHORITY_INVALID/,
      );
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
