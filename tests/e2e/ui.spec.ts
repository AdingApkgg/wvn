import { test, expect } from "@playwright/test";

test("exit confirmation traps focus and cancel restores the story control", async ({
  page,
}) => {
  await page.route("**/atri/**", (route) =>
    route.fulfill({
      body: "<title>ATRI resource fixture</title>",
      contentType: "text/html",
    }),
  );
  await page.goto("/27448/1/");
  const back = page.locator(".player-bar button").first();
  await back.click();
  const dialog = page.getByRole("alertdialog", { name: "离开当前故事？" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "继续阅读" })).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await dialog.getByRole("button", { name: "继续阅读" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(back).toBeFocused();
  await back.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/27448\/1\/?$/);
});

test("catalog filtering works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto((process.env.WG_TEST_URL ?? "http://127.0.0.1:8281") + "/");
    await page.getByRole("searchbox").fill("ATRI");
    await page.getByRole("combobox", { name: /引擎/ }).selectOption("Artemis");
    await page.getByRole("button", { name: "查找" }).click();
    await expect(page.locator(".story-card")).toHaveCount(1);
    await expect(page.locator(".story-card")).toContainText("ATRI");
  } finally {
    await context.close();
  }
});

test("narrow layouts retain accessible filters and the story directory", async ({
  page,
}) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("searchbox")).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "引擎", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
