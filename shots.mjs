// 交付用截图 + 关键测量：四个断点的公开页、作品页、阅读器、账号与规则页。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const PUB = "http://127.0.0.1:8281";
const ACCOUNT = "https://localhost:8283";
const OUT = "/home/i/wvn/shots";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
const report = {};

const pages = [
  { name: "catalog", base: PUB, path: "/", widths: [320, 390, 768, 1440], full: true },
  { name: "work", base: PUB, path: "/10597/", widths: [320, 390, 768, 1440], full: true },
  { name: "reader", base: PUB, path: "/10597/1/", widths: [320, 390, 768, 1440], full: false },
  { name: "account", base: ACCOUNT, path: "/account", widths: [320, 390, 768, 1440], full: true },
  { name: "content", base: ACCOUNT, path: "/content", widths: [390, 1440], full: true },
];

for (const spec of pages) {
  for (const width of spec.widths) {
    const page = await browser.newPage({
      viewport: { width, height: width < 500 ? 844 : 960 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
    });
    const res = await page.goto(spec.base + spec.path, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${spec.name}-${width}.jpg`, quality: 82, type: "jpeg", fullPage: spec.full });
    report[`${spec.name}-${width}`] = {
      status: res?.status(),
      ...(await page.evaluate(() => {
        const small = [...document.querySelectorAll("a, button, input, select, summary")].map((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") return null;
          return { t: el.tagName + "." + (el.className || "").toString().split(" ")[0], w: Math.round(r.width), h: Math.round(r.height) };
        }).filter((x) => x && (x.h < 44 || x.w < 44)).slice(0, 15);
        return {
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          pageHeight: document.documentElement.scrollHeight,
          below44: small,
        };
      })),
    };
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
