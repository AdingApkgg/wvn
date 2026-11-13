import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { authenticator, register, api } from "../helpers/account-browser";
import { RULE_QUESTIONS } from "../../src/content/quiz";

const evidence = JSON.parse(readFileSync("data/cover-review-20261114.json", "utf8")).records;

const repaired = ["v32805", "v14365", "v27057", "v44184", "v33099", "v33969", "v14805", "v11071", "v19182", "v45247", "v32183", "v22880", "v23290", "v23772"];

test("14张补齐封面均通过投影、真实下载和浏览器解码", async ({ page, request }) => {
  test.setTimeout(90000);
  const catalog = await (await request.get("/api/catalog")).json();
  for (const id of repaired) {
    const work = catalog.find((work: { id: string }) => work.id === id);
    expect(work, id).toBeTruthy();
    expect(work.coverStatus, id).toBe("available");
    expect(work.metadata.cover.classification.sexual).toBe("safe");
    expect(work.metadata.cover.classification.violence).toBe("tame");
    const response = await request.get(work.metadata.cover.url);
    expect(response.status(), id).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^image\//);
    const reviewed = evidence.find((image: { id: string; selected: boolean }) => image.id === id && image.selected);
    const bytes = await response.body();
    expect(bytes.length).toBe(reviewed.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(reviewed.sha256);
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const cards = page.locator(".story-card");
    await expect(cards).toHaveCount(55);
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator("img")).toHaveCount(1);
      await expect.poll(() => card.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(page.locator(".cover-placeholder")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.story-card[href="/32805/"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `reports/cover-repaired-${width}.png`, animations: "disabled" });
  }
});

test("封面下载失败时目录和详情显示明确原因，导航后可以正常重试", async ({ page }) => {
  await page.route("**/media/**", route => route.abort());
  await page.goto("/?q=ATRI&engine=Artemis");
  const card = page.locator(".story-card");
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText("封面加载失败", { exact: true })).toBeVisible();
  await expect(card.getByText("请刷新页面重试", { exact: true })).toBeVisible();
  await card.click();
  await expect(page.locator(".work-heading").getByText("封面加载失败", { exact: true })).toBeVisible();
  await page.screenshot({ path: "reports/cover-load-failure.png", animations: "disabled" });
  await page.unroute("**/media/**");
  await page.reload();
  await expect.poll(() => page.locator(".work-cover").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("封面加载失败", { exact: true })).toHaveCount(0);
});

test("手机封面不被容器裁切，横幅和详情失败提示均完整可见", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/32805/");
  const frame = page.locator(".work-cover-frame");
  await expect.poll(() => frame.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const boxes = await frame.evaluate(element => {
    const outer = element.getBoundingClientRect(), inner = element.querySelector("img")!.getBoundingClientRect();
    return { outer: { w: outer.width, h: outer.height }, inner: { w: inner.width, h: inner.height } };
  });
  expect(boxes.inner.w).toBeLessThanOrEqual(boxes.outer.w);
  expect(boxes.inner.h).toBeLessThanOrEqual(boxes.outer.h);
  await page.route("**/media/**", route => route.abort());
  for (const path of ["/32805/", "/?q=万华镜3"]) {
    await page.goto(path);
    const placeholder = page.locator(".cover-placeholder").first();
    await placeholder.scrollIntoViewIfNeeded();
    await expect(placeholder.getByText("封面加载失败", { exact: true })).toBeVisible();
    const fits = await placeholder.evaluate(element => {
      const outer = element.parentElement!.getBoundingClientRect();
      return [...element.children].filter(child => !child.hasAttribute("aria-hidden")).every(child => {
        const box = child.getBoundingClientRect();
        return box.left >= outer.left && box.right <= outer.right && box.top >= outer.top && box.bottom <= outer.bottom;
      });
    });
    expect(fits).toBe(true);
  }
});

test("已开启NSFW也保留未知图片的审核提示，不暴露图片地址", async ({ page }) => {
  await page.goto("/");
  await authenticator(page);
  expect((await register(page, "封面原因验收")).status).toBe(200);
  const attempt = (await api(page, "/api/me/content/attempts", {})).data;
  const answers = Object.fromEntries(attempt.questions.map((question: { id: string }) => [question.id, RULE_QUESTIONS.find(rule => rule.id === question.id)!.correctChoiceId]));
  expect((await api(page, `/api/me/content/attempts/${attempt.id}/submit`, { answers })).status).toBe(200);
  expect((await api(page, "/api/me/content/mode", { mode: "restricted" }, "PATCH")).status).toBe(200);
  await page.goto("/26310/");
  await expect(page.getByText("封面待审核", { exact: true })).toBeVisible();
  await expect(page.getByText("核实图片内容后展示", { exact: true })).toBeVisible();
  await expect(page.locator(".work-cover-frame img")).toHaveCount(0);
  const response = await page.request.get("/api/catalog");
  const work = (await response.json()).find((work: { id: string }) => work.id === "v26310");
  expect(work.coverStatus).toBe("unreviewed");
  expect(work.metadata.cover).toBe(null);
});
