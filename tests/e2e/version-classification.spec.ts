import { test, expect } from "@playwright/test";

test("社区分类明确标示来源，无成人标记版本可在公共模式阅读", async ({ page, request }) => {
  await page.goto("/4/");
  await page.locator("#work-versions > summary").click();
  await expect(page.locator(".version").getByText("社区标记：无成人性内容", { exact: true })).toBeVisible();
  await expect(page.locator(".work-read-actions").getByRole("link", { name: "开始阅读", exact: true })).toHaveAttribute("href", "/4/1/");
  const work = (await (await request.get("/api/catalog")).json()).find((work: { id: string }) => work.id === "v4");
  expect(work.versions[0].classification.sexualContent).toBe("none");
  expect(work.versions[0].classification.ageRating).toBeUndefined();
  expect(work.versions[0].contentRestricted).toBe(false);
  await page.locator("#work-versions").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "reports/version-community-none.png", animations: "disabled" });
});

test("成人社区标记保留准入限制，不能匿名取得资源清单", async ({ page, request }) => {
  await page.goto("/1085/");
  await page.locator("#work-versions > summary").click();
  await expect(page.locator(".version").getByText("社区标记：含成人性内容", { exact: true })).toBeVisible();
  const work = (await (await request.get("/api/catalog")).json()).find((work: { id: string }) => work.id === "v1085");
  expect(work.versions[0].classification.sexualContent).toBe("present");
  expect(work.versions[0].contentRestricted).toBe(true);
  expect(work.versions[0].launchPath).toBe("");
  expect((await request.get("/api/player/ons-v1085-1/resources")).status()).toBe(401);
  await page.locator("#work-versions").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "reports/version-community-present.png", animations: "disabled" });
});

test("补丁状态不明的版本仍显示待核实并保持受限", async ({ page, request }) => {
  await page.goto("/32805/");
  await page.locator("#work-versions > summary").click();
  await expect(page.locator(".version").getByText("内容待核实", { exact: true })).toBeVisible();
  const work = (await (await request.get("/api/catalog")).json()).find((work: { id: string }) => work.id === "v32805");
  expect(work.versions[0].classification.sexualContent).toBe("unknown");
  expect(work.versions[0].contentRestricted).toBe(true);
  await expect(page.getByText("社区标记：无成人性内容", { exact: true })).toHaveCount(0);
  await page.locator("#work-versions").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "reports/version-community-unknown.png", animations: "disabled" });
});
