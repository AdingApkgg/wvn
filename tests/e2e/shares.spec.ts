import { test, expect } from "@playwright/test";
import { authenticator, register, api } from "../helpers/account-browser";
const origin = process.env.WG_SHARING_TEST_URL,
  publicOrigin = process.env.WG_SHARING_PUBLIC_URL,
  adminOrigin = process.env.WG_SHARING_ADMIN_URL;
test.use({ ignoreHTTPSErrors: true });
test.skip(!origin, "Dedicated sharing preview required");
test("link and public shares can be published, moderated, claimed and withdrawn without changing the receiver head", async ({
  page,
  browser,
}) => {
  await page.goto(origin + "/account");
  await authenticator(page);
  expect((await register(page, "Sharing Author")).status).toBe(200);
  await page.reload();
  const select = page.getByRole("combobox", { name: "存档所属版本" });
  await expect(select).toBeVisible();
  const versionId = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(versionId!);
  await page
    .getByLabel("游戏导出的存档文件")
    .setInputFiles({
      name: "slot.dat",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("shared-original-chapter"),
    });
  await page
    .getByRole("button", { name: "保留云端历史，保存为新备份" })
    .click();
  await page.getByRole("button", { name: "分享这份存档" }).click();
  await page.getByLabel("分享标题").fill("A quiet chapter");
  await page.getByLabel("分享说明").fill("Ending spoiler detail");
  await page.getByLabel("我确认分享所列文件").check();
  await page.getByRole("button", { name: "创建分享", exact: true }).click();
  const url = await page.getByLabel("完整分享链接").inputValue();
  expect(url).toContain("#key=");
  const shareId = new URL(url).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "已保存链接" }).click();
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const recipient = await other.newPage();
    await recipient.goto(origin + "/account");
    await authenticator(recipient);
    expect((await register(recipient, "Sharing Recipient")).status).toBe(200);
    await recipient.goto(url);
    await expect(
      recipient.getByRole("heading", { name: "A quiet chapter", exact: true }),
    ).toBeVisible();
    await recipient
      .getByRole("button", { name: "保存到我的云存档", exact: true })
      .click();
    await expect(
      recipient.getByText("已保存独立副本，当前备份与游戏内存档未改变。", {
        exact: true,
      }),
    ).toBeVisible();
    const profiles = (await api(recipient, "/api/me/save-profiles")).data;
    expect(profiles[0].head).toBeNull();
    const download = recipient.waitForEvent("download");
    await recipient.getByRole("button", { name: "下载完整存档包" }).click();
    const file = await download;
    const bytes = await (
      await import("node:fs/promises")
    ).readFile((await file.path())!);
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.includes(Buffer.from("shared-original-chapter"))).toBe(true);
    await page.getByRole("button", { name: "分享这份存档" }).click();
    await page.getByLabel("分享标题").fill("Public chapter");
    await page.getByLabel("分享方式").selectOption("public");
    await page.getByLabel("我确认分享所列文件").check();
    await page.getByRole("button", { name: "创建分享", exact: true }).click();
    await expect(
      page.getByText("已提交审核，通过后出现在作品页。", { exact: true }),
    ).toBeVisible();
    const admin = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const manager = await admin.newPage();
      await manager.goto(adminOrigin + "/share-admin");
      await manager
        .getByLabel("管理令牌")
        .fill(process.env.WG_SHARING_ADMIN_TOKEN!);
      await manager.getByRole("button", { name: "进入审核后台" }).click();
      await expect(
        manager.getByText("Public chapter", { exact: true }),
      ).toBeVisible();
      await manager.getByLabel("审核原因").fill("Synthetic preview acceptance");
      await manager.getByRole("button", { name: "批准发布" }).click();
      await expect(
        manager.getByText("暂无待处理条目", { exact: true }),
      ).toBeVisible();
    } finally {
      await admin.close();
    }
    const catalog = (await api(page, "/api/account-catalog")).data;
    const work = catalog.find((w: { versions: { id: string }[] }) =>
      w.versions.some((v) => v.id === versionId),
    );
    const gallery = await browser.newPage();
    try {
      await gallery.goto(publicOrigin + work.url);
      await expect(
        gallery.getByRole("heading", { name: "玩家存档", exact: true }),
      ).toBeVisible();
      await expect(
        gallery.getByText("Public chapter", { exact: true }),
      ).toBeVisible();
      await expect(
        gallery.getByText("A quiet chapter", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await gallery.close();
    }
    const authorMe = (await api(page, "/api/me")).data;
    expect(
      (await api(page, `/api/me/save-shares/${shareId}/revoke`, {}, "POST"))
        .status,
    ).toBe(200);
    await recipient.reload();
    await expect(
      recipient.getByText("分享已失效或暂不可用。", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await api(
          recipient,
          `/api/me/save-profiles/${profiles[0].id}/revisions`,
        )
      ).data.items,
    ).toHaveLength(1);
    expect(authorMe.user.name).toBe("Sharing Author");
  } finally {
    await other.close();
  }
});
test("anonymous invalid links and public moderation endpoints stay isolated on narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/s/not-a-share#key=invalid");
  await expect(
    page.getByText("分享已失效或暂不可用。", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    (await page.request.get(origin + "/api/share-admin/queue")).status(),
  ).toBe(404);
  expect((await page.request.get(publicOrigin + "/share-admin")).status()).toBe(
    404,
  );
});
