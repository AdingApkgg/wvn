// 用实际渲染逐条量对比度和触控目标。颜色可能是 oklch/color-mix，无法可靠解析字符串，
// 所以在页面里用 canvas 把每个颜色真的画一笔再读回 sRGB 像素，按 WCAG 公式算对比度。
import { chromium } from "playwright";

const PUB = process.env.AUDIT_PUBLIC_ORIGIN ?? "http://127.0.0.1:8281";
const ACCOUNT = process.env.AUDIT_ACCOUNT_ORIGIN ?? "https://localhost:8283";
const WIDTHS = [320, 390, 768, 1440];
const TARGETS = [
  ["catalog-text", `${PUB}/`, ".catalog-description,.primary-navigation a,.search-row button,.content-mode-entry,.card-meta"],
  ["work-text", `${PUB}/10597/`, ".work-breadcrumb a,.work-heading p,.card-meta,[data-slot=button][data-variant=link]"],
  ["account-text", `${ACCOUNT}/account`, ".account-sections a,.account-sections p,.primary-navigation a"],
];
const CONTROLS = "a,button,input,select,summary,textarea";

// 注入页面的采样器：返回文字色与从元素到根的全部背景色（均为 sRGB + alpha）。
const SAMPLER = (selector) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  function toRgba(value) {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = value;
    if (context.fillStyle === "#000" && !/^#000|black|rgb\(0, 0, 0\)/.test(value)) {
      // 非法值会保留上一步的黑色，用一层洋红底区分
      context.fillStyle = "#123456";
      context.fillStyle = value;
    }
    context.globalAlpha = 1;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  }

  return [...document.querySelectorAll(selector)]
    .filter((element) => element.textContent?.trim())
    .map((element) => {
      const layers = [];
      for (let node = element; node; node = node.parentElement) layers.push(toRgba(getComputedStyle(node).backgroundColor));
      return { label: element.textContent.trim().slice(0, 24), text: toRgba(getComputedStyle(element).color), layers };
    });
};

const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
const failures = [];
const measured = [];

for (const [name, url, selector] of TARGETS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, ignoreHTTPSErrors: true });
  const response = await page.goto(url, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    failures.push({ name, url, reason: `HTTP ${response?.status()}` });
    await page.close();
    continue;
  }
  for (const item of await page.evaluate(SAMPLER, selector)) {
    // 由内向外合成背景，得到这行字真正落地的底色。
    const bg = [...item.layers].reverse().reduce((base, layer) => composite(layer, base), [255, 255, 255, 1]);
    const ratio = contrastRatio(composite(item.text, bg), bg);
    measured.push({ name, label: item.label, ratio: Number(ratio.toFixed(2)) });
    if (ratio < 4.5) failures.push({ name, label: item.label, ratio: Number(ratio.toFixed(2)) });
  }
  await page.close();
}

for (const [name, url] of [
  ["catalog-controls", `${PUB}/`],
  ["work-controls", `${PUB}/10597/`],
  ["account-controls", `${ACCOUNT}/account`],
]) {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, ignoreHTTPSErrors: true });
    await page.goto(url, { waitUntil: "networkidle" });
    const result = await page.evaluate((controls) => {
      const small = [];
      for (const element of document.querySelectorAll(controls)) {
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(element).visibility === "hidden") continue;
        if (box.height < 44 || box.width < 44) small.push(`${element.tagName} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small };
    }, CONTROLS);
    if (result.overflow > 0) failures.push({ name, width, reason: `横向溢出 ${result.overflow}px` });
    for (const item of result.small) failures.push({ name, width, reason: `触控目标过小 ${item}` });
    await page.close();
  }
}

await browser.close();

// 合成与相对亮度按 WCAG 定义实现。
function composite(fg, bg) {
  return [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3]), 1];
}

function luminance(rgb) {
  const [r, g, b] = rgb.slice(0, 3).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const worst = [...measured].sort((a, b) => a.ratio - b.ratio).slice(0, 5);
const lines = [`采样 ${measured.length} 处文字与 36 组触控目标/溢出检查`];
lines.push(`最低五处对比度：${worst.map((item) => `${item.name} "${item.label}" ${item.ratio}`).join(" / ")}`);
if (failures.length) {
  lines.push(`失败 ${failures.length} 项`);
  for (const item of failures) lines.push(` - ${JSON.stringify(item)}`);
  process.exitCode = 1;
} else {
  lines.push("通过");
}
console.error(lines.join("\n"));
