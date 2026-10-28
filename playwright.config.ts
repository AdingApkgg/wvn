import { defineConfig } from "@playwright/test";
import { previewChromiumOptions } from "./scripts/lib/preview-browser.mjs";
const certificate =
  process.env.WG_SHARING_TEST_CERT ?? process.env.WG_ACCOUNT_TEST_CERT;
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: {
    baseURL: process.env.WG_TEST_URL ?? "http://127.0.0.1:8281",
    headless: true,
    launchOptions: {
      ...(certificate
        ? previewChromiumOptions(certificate)
        : { args: ["--no-sandbox", "--disable-dev-shm-usage"] }),
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      ...((process.env.WG_TEST_PROXY || process.env.HTTPS_PROXY) ? { proxy: { server: (process.env.WG_TEST_PROXY || process.env.HTTPS_PROXY)!, bypass: "localhost,127.0.0.1,[::1]" } } : {}),
    },
    trace: "retain-on-failure",
  },
  reporter: "list",
});
