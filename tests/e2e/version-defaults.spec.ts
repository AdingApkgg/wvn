import { test, expect } from "@playwright/test";

test("未决版本按用户默认SFW可读，并明确标为尚未核实", async ({ page, request }) => {
  await page.goto("/32805/");
  await page.locator("#work-versions > summary").click();
  await expect(page.locator(".version").getByText("默认 SFW · 未核实", { exact: true })).toBeVisible();
  await expect(page.locator(".version").getByText("已确认不含成人性内容", { exact: true })).toHaveCount(0);
  const work = (await (await request.get("/api/catalog")).json()).find((work: { id: string }) => work.id === "v32805");
  expect(work.versions[0].classification.sexualContent).toBe("none");
  expect(work.versions[0].classification.source).toMatch(/^user-default:sfw-unverified:/);
  expect(work.versions[0].classification.reason).toContain("未核实");
  expect(work.versions[0].classification.ageRating).toBeUndefined();
  expect(work.versions[0].contentRestricted).toBe(false);
  await expect(page.locator(".work-read-actions").getByRole("link", { name: "开始阅读", exact: true })).toBeVisible();
  await page.locator("#work-versions").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "reports/version-user-default-sfw.png", animations: "disabled" });
});

test("SFW筛选包括本轮用户默认值，并且不声称全部已确认", async ({ page }) => {
  await page.goto("/?q=NinNinDays2&content=none");
  await expect(page.locator(".story-card")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "移除内容筛选：SFW（含默认）", exact: true })).toBeVisible();
  await page.locator(".advanced-filters > summary").click();
  await expect(page.locator('#catalog-content option[value="none"]')).toHaveText("SFW（含默认）");
});
