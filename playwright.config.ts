import { defineConfig } from "@playwright/test";
import { previewChromiumOptions } from "./scripts/lib/preview-browser.mjs";
// 一次测试可能同时打到两套自签预览（公开栈 + 内容边界栈的 24684/24685）。
// 都须显式信任：只信一把会让另一套的管理页 ERR_CERT_AUTHORITY_INVALID。
const certificates = [
  process.env.WG_SHARING_TEST_CERT,
  process.env.WG_ACCOUNT_TEST_CERT,
  process.env.WG_CONTENT_TEST_CERT,
].filter((path): path is string => !!path);
// 回环预览的 CSP sandbox 帧是 opaque origin，拿不到页面级 local-network-access 授权，
// 连自己的脚本都会被判成越界访问回环。线上是公网 origin 不受影响，只在回环测试里关掉。
function loopbackPreview(): boolean {
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(process.env.WG_TEST_URL ?? "http://127.0.0.1:8281").hostname);
  } catch { return false; }
}
const baseURL = process.env.WG_TEST_URL ?? "http://127.0.0.1:8281";
// 只算一次：它会读证书、设进程级 CA 信任。
const chromium = certificates.length
  ? previewChromiumOptions(certificates)
  : { args: ["--no-sandbox", "--disable-dev-shm-usage"] };
const proxy = process.env.WG_TEST_PROXY ?? process.env.HTTPS_PROXY;
const bypass = ["localhost", "127.0.0.1", "[::1]", process.env.WG_CONTENT_TEST_URL
  ? new URL(process.env.WG_CONTENT_TEST_URL).hostname
  : ""].filter(Boolean).join(",");
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: {
    baseURL,
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
      args: [
        ...chromium.args,
        // 回环预览的 CSP sandbox 帧是 opaque origin，拿不到页面级 local-network-access 授权，
        // 连自己的脚本都会被判成越界访问回环。线上是公网 origin 不受影响，只在回环测试里关掉。
        ...(loopbackPreview() ? ["--disable-features=LocalNetworkAccessChecks"] : []),
      ],
      ...(proxy ? { proxy: { server: proxy, bypass } } : {}),
    },
    trace: "retain-on-failure",
  },
  reporter: "list",
});
