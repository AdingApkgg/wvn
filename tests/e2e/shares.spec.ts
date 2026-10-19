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
  await page.getByLabel("游戏导出的存档文件").setInputFiles({
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
  await page.getByRole("button", { name: "分享这份存档" }).click();
  await page.getByLabel("分享标题").fill("Ignored duplicate");
  await page.getByLabel("我确认分享所列文件").check();
  await page.getByRole("button", { name: "创建分享", exact: true }).click();
  await expect(
    page.getByText("这份快照已有有效链接分享，未重复创建。", { exact: true }),
  ).toBeVisible();
  expect((await api(page, "/api/me/save-shares")).data.items).toHaveLength(1);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
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
    let moderationCookie = "";
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
      const reviewCard = manager
        .locator("[data-share-id]")
        .filter({ hasText: "Public chapter" });
      await expect(
        reviewCard.getByText("slot.dat", { exact: true }),
      ).toBeVisible();
      await expect(
        reviewCard.getByText("SHA256", { exact: true }),
      ).toBeVisible();
      await expect(
        reviewCard.getByText("章节节点", { exact: true }),
      ).toBeVisible();
      await manager.getByLabel("审核原因").fill("Synthetic preview acceptance");
      await manager.getByRole("button", { name: "批准发布" }).click();
      await expect(
        manager.getByText("暂无待处理条目", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "关闭", exact: true }).click();
      await page
        .getByRole("button", { name: "刷新分享列表", exact: true })
        .click();
      const ownCard = page.locator(".account-pending").filter({
        has: page.getByRole("heading", {
          name: "Public chapter",
          exact: true,
        }),
      });
      await ownCard.getByRole("button", { name: "编辑分享说明" }).click();
      const edit = page.getByRole("alertdialog");
      await edit
        .getByLabel("进度类型", { exact: true })
        .selectOption("complete");
      await edit.getByLabel("含剧透说明").uncheck();
      await page.setViewportSize({ width: 390, height: 844 });
      await edit.screenshot({
        path: "reports/sharing-preview/edit-progress-mobile-checked.png",
        animations: "disabled",
      });
      const bounds = await edit.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
      await edit.getByRole("button", { name: "保存说明", exact: true }).click();
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await ownCard.getByRole("button", { name: "编辑分享说明" }).click();
      await expect(edit.getByLabel("进度类型", { exact: true })).toHaveValue(
        "complete",
      );
      await expect(edit.getByLabel("含剧透说明")).not.toBeChecked();
      await edit.getByRole("button", { name: "取消", exact: true }).click();
      const ownPublic = (
        await api(page, "/api/me/save-shares")
      ).data.items.find((x: { mode: string }) => x.mode === "public");
      const before = await page.request.get(
        origin + "/api/public/save-shares/" + ownPublic.id,
      );
      const beforeEdit = await before.json();
      expect(beforeEdit.progress).toBe("chapter");
      expect(beforeEdit.spoiler).toBe(true);
      await manager.getByRole("button", { name: "刷新审核队列" }).click();
      await expect(
        reviewCard.getByRole("heading", { name: "待审核内容", exact: true }),
      ).toBeVisible();
      await expect(reviewCard.getByText("通关", { exact: true })).toBeVisible();
      await expect(
        reviewCard.getByText("章节节点", { exact: true }),
      ).toBeVisible();
      await manager.getByRole("button", { name: "批准发布" }).click();
      await expect(
        manager.getByText("暂无待处理条目", { exact: true }),
      ).toBeVisible();
      const after = await page.request.get(
        origin + "/api/public/save-shares/" + ownPublic.id,
      );
      const afterEdit = await after.json();
      expect(afterEdit.progress).toBe("complete");
      expect(afterEdit.spoiler).toBe(false);
    } finally {
      moderationCookie=(await admin.cookies()).map(c=>`${c.name}=${c.value}`).join("; ");
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
    const publicParent = (
      await api(page, "/api/me/save-shares")
    ).data.items.find((x: { mode: string }) => x.mode === "public");
    const publicReceipt = await api(recipient, "/api/me/share-claims", {
      shareId: publicParent.id,
      requestId: crypto.randomUUID(),
    });
    expect(publicReceipt.status).toBe(200);
    const child = await api(recipient, "/api/me/save-shares", {
      profileId: publicReceipt.data.profile.id,
      generation: publicReceipt.data.profile.generation,
      revisionId: publicReceipt.data.revision.id,
      mode: "public",
      requestId: crypto.randomUUID(),
      title: "Received public reshare",
      description: "Source is conditional",
      progress: "chapter",
      spoiler: false,
    });
    expect(child.status).toBe(201);
    expect(
      (
        await page.request.post(
          adminOrigin + `/api/share-admin/${child.data.id}/moderate`,
          {
            headers: { origin: adminOrigin!, cookie: moderationCookie },
            data: {
              revision: 1,
              action: "approve",
              reason: "Synthetic provenance acceptance",
            },
          },
        )
      ).status(),
    ).toBe(200);
    await recipient.goto(origin + "/s/" + child.data.id);
    await expect(
      recipient.getByRole("link", { name: "查看公开来源" }),
    ).toHaveAttribute("href", "/s/" + publicParent.id);
    await expect(
      recipient.getByText("版本信息已按发布时保存。", { exact: true }),
    ).toBeVisible();
    expect(
      (await api(page, `/api/me/save-shares/${publicParent.id}/revoke`, {}))
        .status,
    ).toBe(200);
    await recipient.reload();
    await expect(
      recipient.getByRole("heading", {
        name: "Received public reshare",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      recipient.getByRole("link", { name: "查看公开来源" }),
    ).toHaveCount(0);
    await recipient.goto(url);
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
    ).toHaveLength(2);
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

test("public version and progress filters persist through the next page and reset its cursor on submit", async ({
  page,
}) => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = process.env.WG_ACCOUNT_DATABASE!;
  expect(database).toContain("/state/sharing-test/");
  const catalog = await (
    await page.request.get(publicOrigin + "/api/catalog")
  ).json();
  const work = catalog.find(
    (w: { versions: unknown[] }) => w.versions.length > 1,
  );
  expect(work).toBeTruthy();
  const [one, two] = work.versions;
  await page.goto(origin + "/account");
  await authenticator(page);
  expect((await register(page, "Filter Fixture Author")).status).toBe(200);
  await page.reload();
  await page
    .getByRole("combobox", { name: "存档所属版本" })
    .selectOption(one.id);
  await page.getByLabel("游戏导出的存档文件").setInputFiles({
    name: "filter-fixture.dat",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("Synthetic pagination fixture"),
  });
  await page
    .getByRole("button", { name: "保留云端历史，保存为新备份" })
    .click();
  await page.getByRole("button", { name: "分享这份存档" }).waitFor();
  const profile = (await api(page, "/api/me/save-profiles")).data[0];
  const revision = (
    await api(page, `/api/me/save-profiles/${profile.id}/revisions`)
  ).data.items[0];
  const templateShare = await api(page, "/api/me/save-shares", {
    profileId: profile.id,
    revisionId: revision.id,
    generation: profile.generation,
    mode: "public",
    title: "Filter template",
    description: "",
    progress: "chapter",
    spoiler: false,
    requestId: crypto.randomUUID(),
  });
  expect(templateShare.status).toBe(201);
  const db = new DatabaseSync(database);
  const ids: string[] = [];
  try {
    db.exec("PRAGMA busy_timeout=5000");
    const template = db
      .prepare("SELECT * FROM wg_save_shares WHERE id=?")
      .get(templateShare.data.id)!;
    expect(template).toBeTruthy();
    // Isolated list fixtures reuse immutable bytes; public visibility still checks source generation.
    for (let n = 0; n < 70; n++) {
      const id = "browser-filter-" + n;
      ids.push(id);
      const v = n % 3 === 0 ? two : one;
      const progress = n % 3 === 1 ? "route" : "complete";
      db.prepare(
        "INSERT INTO wg_save_shares (id,owner,profile,generation,revision,version,work,mode,secret_hash,state,expires,files,approved,pending,metadata_revision,created,request_id,payload) SELECT ?,owner,profile,generation,revision,?,?,'public',NULL,'active',NULL,files,?,NULL,1,?,?,payload FROM wg_save_shares WHERE id=?",
      ).run(
        id,
        v.id,
        work.id,
        JSON.stringify({
          title: `Filter example ${n}`,
          description: "Synthetic list fixture",
          spoiler: false,
          progress,
        }),
        Date.now() + n,
        id,
        template.id,
      );
    }
    await page.goto(publicOrigin + work.url);
    await page.getByLabel("游戏版本", { exact: true }).selectOption(one.id);
    await page.getByLabel("进度类型", { exact: true }).selectOption("complete");
    await page.getByRole("button", { name: "筛选玩家存档" }).click();
    await expect(page.locator("[data-public-share-id]")).toHaveCount(20);
    const first = await page
      .locator("[data-public-share-id]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-public-share-id")),
      );
    await page.getByRole("link", { name: "更多玩家存档" }).click();
    await expect(page).toHaveURL(/saveCursor=/);
    await expect(page.getByLabel("游戏版本", { exact: true })).toHaveValue(
      one.id,
    );
    await expect(page.getByLabel("进度类型", { exact: true })).toHaveValue(
      "complete",
    );
    expect(new URL(page.url()).searchParams.get("saveCursor")).toBeTruthy();
    const second = await page
      .locator("[data-public-share-id]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-public-share-id")),
      );
    expect(second.length).toBe(3);
    expect(second.some((id) => first.includes(id))).toBe(false);
    expect(
      [...first, ...second].every(
        (id) => Number(id!.split("-").at(-1)) % 3 === 2,
      ),
    ).toBe(true);
    await page.getByLabel("进度类型", { exact: true }).selectOption("route");
    await page.getByRole("button", { name: "筛选玩家存档" }).click();
    await expect(page).toHaveURL(/saveProgress=route/);
    expect(new URL(page.url()).searchParams.has("saveCursor")).toBe(false);
    const routes = await page
      .locator("[data-public-share-id]")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-public-share-id")),
      );
    expect(routes.length).toBe(20);
    expect(routes.every((id) => Number(id!.split("-").at(-1)) % 3 === 1)).toBe(
      true,
    );
    await page.reload();
    await expect(page.getByLabel("进度类型", { exact: true })).toHaveValue(
      "route",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  } finally {
    for (const id of ids)
      db.prepare("DELETE FROM wg_save_shares WHERE id=?").run(id);
    db.close();
  }
});
