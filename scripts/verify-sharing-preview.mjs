import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { hostname } from "node:os";
import { chromium } from "@playwright/test";
import { PreviewCleanup } from "./lib/preview-cleanup.mjs";
async function authenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}
async function register(page, nickname, entry) {
  assert.equal(
    (
      await page
        .context()
        .request.get(origin + "/api/me", { timeout: 5000, maxRedirects: 0 })
    ).status(),
    401,
    "Synthetic registration must start in an anonymous fresh context",
  );
  await page.getByLabel("昵称", { exact: true }).fill(nickname);
  await page.getByLabel("预览邀请码").fill(process.env.WG_ACCOUNT_TEST_INVITE);
  const result = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/passkey/verify-registration") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "创建通行密钥并注册" }).click();
  const response = await result;
  assert.equal(response.status(), 200);
  const registration = await response.json();
  const registeredId =
    registration.user?.id ??
    registration.userId ??
    registration.passkey?.userId;
  if (typeof registeredId === "string") cleanup.identify(entry, registeredId);
  const current = await page
    .context()
    .request.get(origin + "/api/me", { timeout: 5000, maxRedirects: 0 });
  assert.equal(current.status(), 200);
  const me = await current.json();
  if (entry.accountId) assert.equal(me.user.id, entry.accountId);
  else cleanup.identify(entry, me.user.id);
  await page.getByRole("heading", { name: "我的故事", exact: true }).waitFor();
  return { status: response.status() };
}
async function api(page, path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch("/api/me");
      const me = response.ok ? await response.json() : null;
      const result = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          ...(me ? { "x-wg-binding": me.binding } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: result.status, data: await result.json() };
    },
    { path, body },
  );
}
assert.equal(hostname(), "localhost");
assert.equal(process.cwd(), "/home/wvn/wg-accounts-preview-20261019");
const origin = "https://localhost:18283",
  publicOrigin = "http://127.0.0.1:18284",
  adminOrigin = "https://localhost:18285";
const cleanup = new PreviewCleanup({
  directory: "state/sharing-preview/acceptance-runs",
  origin,
});
let manifest,
  browser,
  a,
  b,
  m,
  receipt,
  passed = false,
  failure,
  stage = "preflight";
const errors = [],
  layouts = [],
  polish = process.env.WG_SHARING_POLISH_ACCEPTANCE === "1",
  ephemeral = [];
async function screenshot(page, name, width, height) {
  await page.setViewportSize({ width, height });
  const content = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  assert.ok(content <= width + 1, name + " overflow");
  await page.screenshot({
    path: `reports/sharing-preview/${name}.png`,
    fullPage: true,
  });
  layouts.push({ name, width, content });
}
const synthetic =
  "WG sharing protocol preview only. This is NOT a game save and must not be imported into games.";
try {
  manifest = JSON.parse(
    readFileSync("reports/sharing-source-manifest.json", "utf8"),
  );
  for (const file of manifest.files)
    assert.equal(
      createHash("sha256").update(readFileSync(file.path)).digest("hex"),
      file.sha256,
      file.path,
    );
  process.env.WG_ACCOUNT_TEST_INVITE = readFileSync(
    "state/accounts-preview/invite",
    "utf8",
  ).trim();
  mkdirSync("reports/sharing-preview", { recursive: true });
  stage = "launch-browser";
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  a = await browser.newContext({ ignoreHTTPSErrors: true });
  b = await browser.newContext({ ignoreHTTPSErrors: true });
  m = await browser.newContext({ ignoreHTTPSErrors: true });
  stage = "register-author";
  const author = await a.newPage();
  author.on("pageerror", (e) => errors.push(e.message));
  await author.goto(origin + "/account");
  await authenticator(author);
  assert.equal(
    (
      await register(
        author,
        "WG 分享示例 · 合成账号",
        cleanup.begin(a, "author", true),
      )
    ).status,
    200,
  );
  if (process.env.WG_PREVIEW_FAIL_AFTER_REGISTER === "1") {
    stage = "injected-after-registration";
    throw Object.assign(new Error("Controlled preview cleanup acceptance"), {
      code: "INJECTED_ACCEPTANCE_FAILURE",
    });
  }
  await author.reload();
  const health = await (await a.request.get(origin + "/health")).json();
  assert.equal(health.revision, manifest.revision);
  const owner = (await api(author, "/api/me")).data.user.id;
  const select = author.getByRole("combobox", { name: "存档所属版本" });
  await select.waitFor();
  const version = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(version);
  await author.getByLabel("游戏导出的存档文件").setInputFiles({
    name: "wg-preview-synthetic.dat",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(synthetic),
  });
  await author
    .getByRole("button", { name: "保留云端历史，保存为新备份" })
    .click();
  async function publish(mode, title) {
    await author.getByRole("button", { name: "分享这份存档" }).click();
    await author.getByLabel("分享标题").fill(title);
    await author
      .getByLabel("分享说明")
      .fill(
        "这是分享协议验收的合成示例，不能用于游戏读档。说明折叠用于验证剧透交互。",
      );
    await author.getByLabel("分享方式").selectOption(mode);
    await author.getByLabel("我确认分享所列文件").check();
    await author.getByRole("button", { name: "创建分享", exact: true }).click();
  }
  stage = "publish-shares";
  await publish("link", "预览示例 · 私密链接（合成文件）");
  const link = await author.getByLabel("完整分享链接").inputValue();
  writeFileSync("state/sharing-preview/example-link", link + "\n", {
    mode: 0o600,
  });
  await author.getByRole("button", { name: "已保存链接" }).click();
  await publish("public", "预览示例 · 玩家存档分享（合成文件）");
  await author
    .getByText("已提交审核，通过后出现在作品页。", { exact: true })
    .waitFor();
  await author.getByRole("button", { name: "关闭", exact: true }).click();
  const own = (await api(author, "/api/me/save-shares")).data.items;
  const published = own.find((s) => s.mode === "public");
  stage = "moderation";
  const manager = await m.newPage();
  manager.on("pageerror", (error) => errors.push(error.message));
  await manager.goto(adminOrigin + "/share-admin");
  await manager
    .getByLabel("管理令牌")
    .fill(
      readFileSync("state/accounts-preview/share-admin-token", "utf8").trim(),
    );
  await manager.getByRole("button", { name: "进入审核后台" }).click();
  const reviewCard = manager.locator(`[data-share-id="${published.id}"]`);
  await reviewCard.waitFor();
  if (polish) {
    await reviewCard
      .getByText("wg-preview-synthetic.dat", { exact: true })
      .waitFor();
    assert.equal(
      await reviewCard.locator("code").first().innerText(),
      createHash("sha256").update(synthetic).digest("hex"),
    );
    await screenshot(manager, "moderation-files-desktop", 1440, 1000);
    await screenshot(manager, "moderation-files-mobile", 390, 844);
    await manager.setViewportSize({ width: 1440, height: 1000 });
  }
  await manager
    .getByLabel("审核原因")
    .fill(
      "Isolated preview synthetic acceptance; not a compatibility certification",
    );
  await reviewCard.getByRole("button", { name: "批准发布" }).click();
  await reviewCard.waitFor({ state: "detached" });
  if (polish) {
    await author
      .getByRole("button", { name: "刷新分享列表", exact: true })
      .click();
    const ownCard = author.locator(".account-pending").filter({
      has: author.getByRole("heading", {
        name: published.title,
        exact: true,
      }),
    });
    await ownCard.getByRole("button", { name: "编辑分享说明" }).click();
    const edit = author.getByRole("alertdialog");
    await edit.getByLabel("进度类型", { exact: true }).selectOption("complete");
    await edit.getByLabel("含剧透说明").uncheck();
    await screenshot(author, "edit-progress-mobile", 390, 844);
    await edit.getByRole("button", { name: "保存说明", exact: true }).click();
    await edit.waitFor({ state: "detached" });
    await ownCard.getByRole("button", { name: "编辑分享说明" }).click();
    assert.equal(
      await edit.getByLabel("进度类型", { exact: true }).inputValue(),
      "complete",
    );
    assert.equal(await edit.getByLabel("含剧透说明").isChecked(), false);
    await edit.getByRole("button", { name: "取消", exact: true }).click();
    const before = (
      await api(author, "/api/public/save-shares/" + published.id)
    ).data;
    assert.equal(before.progress, "chapter");
    assert.equal(before.spoiler, true);
    await manager.getByRole("button", { name: "刷新审核队列" }).click();
    await reviewCard
      .getByRole("heading", { name: "待审核内容", exact: true })
      .waitFor();
    await reviewCard.getByText("通关", { exact: true }).waitFor();
    await reviewCard.getByText("章节节点", { exact: true }).waitFor();
    await screenshot(manager, "moderation-edit-desktop", 1440, 1000);
    await screenshot(manager, "moderation-edit-mobile", 390, 844);
    await reviewCard.getByRole("button", { name: "批准发布" }).click();
    await reviewCard.waitFor({ state: "detached" });
    const after = (await api(author, "/api/public/save-shares/" + published.id))
      .data;
    assert.equal(after.progress, "complete");
    assert.equal(after.spoiler, false);
  }
  await screenshot(manager, "moderation-desktop", 1440, 1000);
  stage = "register-recipient";
  const recipient = await b.newPage();
  recipient.on("pageerror", (e) => errors.push(e.message));
  await recipient.goto(origin + "/account");
  await authenticator(recipient);
  assert.equal(
    (
      await register(
        recipient,
        "WG 领取示例 · 合成账号",
        cleanup.begin(b, "recipient", true),
      )
    ).status,
    200,
  );
  stage = "claim-download-revoke";
  await recipient.goto(origin + "/s/" + published.id);
  await recipient
    .getByRole("heading", { name: published.title, exact: true })
    .waitFor();
  await recipient
    .getByRole("button", { name: "保存到我的云存档", exact: true })
    .click();
  await recipient
    .getByText("已保存独立副本，当前备份与游戏内存档未改变。", { exact: true })
    .waitFor();
  const profiles = (await api(recipient, "/api/me/save-profiles")).data;
  assert.equal(profiles[0].head, null);
  const received = (
    await api(recipient, `/api/me/save-profiles/${profiles[0].id}/revisions`)
  ).data.items[0];
  const receiverId = (await api(recipient, "/api/me")).data.user.id;
  const digest = createHash("sha256").update(synthetic).digest("hex");
  const ownerPath =
    "state/accounts-preview/blobs/" +
    createHash("sha256").update(owner).digest("hex") +
    "/" +
    digest +
    ".bin";
  const receiverPath =
    "state/accounts-preview/blobs/" +
    createHash("sha256").update(receiverId).digest("hex") +
    "/" +
    digest +
    ".bin";
  assert.equal(
    createHash("sha256").update(readFileSync(receiverPath)).digest("hex"),
    digest,
  );
  assert.notEqual(
    statSync(ownerPath).ino,
    statSync(receiverPath).ino,
    "cross-owner bytes must have independent inodes",
  );
  const privateCopy = await recipient.evaluate(
    async ({ profile, revision }) => {
      const response = await fetch(
        `/api/me/save-profiles/${profile}/revisions/${revision}/files?name=wg-preview-synthetic.dat`,
      );
      return { status: response.status, text: await response.text() };
    },
    { profile: profiles[0].id, revision: received.id },
  );
  assert.equal(privateCopy.status, 200);
  assert.equal(privateCopy.text, synthetic);

  const download = recipient.waitForEvent("download");
  await recipient.getByRole("button", { name: "下载完整存档包" }).click();
  const file = await download;
  const zip = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import zipfile,json,sys,hashlib;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))",
        await file.path(),
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(
    zip["files/wg-preview-synthetic.dat"],
    createHash("sha256").update(synthetic).digest("hex"),
  );
  assert.ok(zip["manifest.json"]);
  const manifestFile = execFileSync(
    "python3",
    [
      "-c",
      "import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read('manifest.json').decode())",
      await file.path(),
    ],
    { encoding: "utf8" },
  );
  assert.ok(!manifestFile.includes(owner));
  // Use a separate link for destructive acceptance; retain the public and link examples.
  const authorProfile = (await api(author, "/api/me/save-profiles")).data[0];
  const authorRevision = (
    await api(author, `/api/me/save-profiles/${authorProfile.id}/revisions`)
  ).data.items[0];
  const disposable = await api(author, "/api/me/save-shares", {
    profileId: authorProfile.id,
    generation: authorProfile.generation,
    revisionId: authorRevision.id,
    mode: "link",
    days: 1,
    requestId: crypto.randomUUID(),
    title: "撤回验收 · 合成文件",
    description: "Disposable protocol test",
    progress: "other",
    spoiler: false,
  });
  assert.equal(disposable.status, 201);
  const claim = await api(recipient, "/api/me/share-claims", {
    shareId: disposable.data.id,
    secret: disposable.data.secret,
    requestId: crypto.randomUUID(),
  });
  assert.equal(claim.status, 200);
  assert.equal(
    (await api(author, `/api/me/save-shares/${disposable.data.id}/revoke`, {}))
      .status,
    200,
  );
  assert.equal(
    (
      await api(recipient, `/api/share-links/${disposable.data.id}/inspect`, {
        secret: disposable.data.secret,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await api(recipient, "/api/me/share-downloads", {
        shareId: disposable.data.id,
        secret: disposable.data.secret,
      })
    ).status,
    404,
  );
  const afterRevoke = await recipient.evaluate(
    async ({ profile, revision }) => {
      const response = await fetch(
        `/api/me/save-profiles/${profile}/revisions/${revision}/files?name=wg-preview-synthetic.dat`,
      );
      return { status: response.status, text: await response.text() };
    },
    { profile: profiles[0].id, revision: claim.data.revision.id },
  );
  assert.equal(afterRevoke.status, 200);
  assert.equal(afterRevoke.text, synthetic);
  await screenshot(recipient, "detail-desktop", 1440, 1000);
  await screenshot(recipient, "detail-mobile", 390, 844);
  const catalog = (await api(author, "/api/account-catalog")).data,
    work = catalog.find((w) => w.versions.some((v) => v.id === version));
  const gallery = await browser.newPage();
  gallery.on("pageerror", (error) => errors.push(error.message));
  await gallery.goto(publicOrigin + work.url);
  await gallery.locator(`[data-public-share-id="${published.id}"]`).waitFor();
  await screenshot(gallery, "work-desktop", 1440, 1000);
  await screenshot(gallery, "work-mobile", 390, 844);
  let filteredPages = 0;
  if (polish) {
    const expected = new Set([published.id]);
    for (let n = 0; n < 4; n++) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const fixture = await context.newPage();
      const cleanupEntry = cleanup.begin(context, `pagination-${n + 1}`);
      ephemeral.push({ context, page: fixture, cleanupEntry });
      stage = `register-pagination-${n + 1}`;
      await fixture.goto(origin + "/account");
      await authenticator(fixture);
      await register(
        fixture,
        `分页验收 ${n + 1} · ${cleanup.runId.slice(0, 8)}`,
        cleanupEntry,
      );
      await fixture.reload();
      await fixture
        .getByRole("combobox", { name: "存档所属版本" })
        .selectOption(version);
      await fixture.getByLabel("游戏导出的存档文件").setInputFiles({
        name: "pagination-synthetic.dat",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(synthetic),
      });
      await fixture
        .getByRole("button", { name: "保留云端历史，保存为新备份" })
        .click();
      await fixture.getByRole("button", { name: "分享这份存档" }).waitFor();
      const profile = (await api(fixture, "/api/me/save-profiles")).data[0];
      const revision = (
        await api(fixture, `/api/me/save-profiles/${profile.id}/revisions`)
      ).data.items[0];
      for (let j = 0; j < 5; j++) {
        const made = await api(fixture, "/api/me/save-shares", {
          profileId: profile.id,
          revisionId: revision.id,
          generation: profile.generation,
          mode: "public",
          requestId: crypto.randomUUID(),
          title: `分页验收 ${n + 1}-${j + 1} · 临时合成文件`,
          description:
            "Only used by preview pagination acceptance; removed afterward.",
          progress: "complete",
          spoiler: false,
        });
        assert.equal(made.status, 201);
        expected.add(made.data.id);
        const status = await manager.evaluate(async (id) => {
          const response = await fetch(`/api/share-admin/${id}/moderate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              revision: 1,
              action: "approve",
              reason: "Synthetic pagination acceptance",
            }),
          });
          return response.status;
        }, made.data.id);
        assert.equal(status, 200);
      }
    }
    stage = "filtered-pagination";
    await gallery.goto(publicOrigin + work.url);
    await gallery.getByLabel("游戏版本", { exact: true }).selectOption(version);
    await gallery
      .getByLabel("进度类型", { exact: true })
      .selectOption("complete");
    await gallery.getByRole("button", { name: "筛选玩家存档" }).click();
    await gallery.waitForURL(
      (url) => url.searchParams.get("saveProgress") === "complete",
    );
    const seen = new Set();
    for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
      filteredPages++;
      assert.equal(
        await gallery.getByLabel("游戏版本", { exact: true }).inputValue(),
        version,
      );
      assert.equal(
        await gallery.getByLabel("进度类型", { exact: true }).inputValue(),
        "complete",
      );
      const ids = await gallery
        .locator("[data-public-share-id]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-public-share-id")),
        );
      for (const id of ids) {
        assert.ok(!seen.has(id));
        seen.add(id);
      }
      const next = gallery.getByRole("link", { name: "更多玩家存档" });
      if (!(await next.count())) break;
      const before = gallery.url();
      await next.click();
      await gallery.waitForURL((url) => url.href !== before);
    }
    assert.ok(filteredPages >= 2);
    for (const id of expected) assert.ok(seen.has(id), id);
    await screenshot(gallery, "filtered-next-page-desktop", 1440, 1000);
    await screenshot(gallery, "filtered-next-page-mobile", 390, 844);
    await gallery
      .getByLabel("进度类型", { exact: true })
      .selectOption("chapter");
    await gallery.getByRole("button", { name: "筛选玩家存档" }).click();
    await gallery.waitForURL(
      (url) => url.searchParams.get("saveProgress") === "chapter",
    );
    assert.equal(new URL(gallery.url()).searchParams.has("saveCursor"), false);
    stage = "cleanup-pagination";
    for (const fixture of ephemeral) {
      const result = await cleanup.remove(fixture.cleanupEntry);
      assert.equal(
        result.ok,
        true,
        "Temporary account cleanup failed; inspect private run journal",
      );
    }
  }
  await gallery.close();
  assert.deepEqual(errors, []);
  receipt = {
    status: "passed",
    checkedAt: new Date().toISOString(),
    host: hostname(),
    revision: manifest.revision,
    sourceFilesVerified: manifest.files.length,
    buildSha256: createHash("sha256")
      .update(readFileSync("build/server/index.js"))
      .digest("hex"),
    publicWorkUrl: publicOrigin + work.url,
    publicShareUrl: origin + "/s/" + published.id,
    examples: "synthetic files explicitly labelled; not game saves",
    ...(polish
      ? {
          combinedFilterPages: filteredPages,
          progressEditAndPendingApproval: "passed",
          moderationManifest: "passed",
          temporaryPaginationAccountsDeleted: ephemeral.every(
            (f) => f.cleanupEntry.state === "deleted",
          ),
        }
      : {}),
    authorNamespaceIndependent: true,
    revokedSourceDenied: true,
    recipientCopyReadableAfterRevoke: true,
    privateCopySHA256: digest,
    receivedHead: null,
    zipCRC: "passed",
    zipFileSHA256: zip["files/wg-preview-synthetic.dat"],
    layouts,
    pageErrors: errors,
    hardwarePasskey: "not tested",
    realGameSaveCompatibility: "not tested",
    productionChanged: false,
    adminTokenConsumedByAcceptance: true,
  };
  passed = true;
} catch (error) {
  failure = error;
  cleanup.recordFailure(stage, error);
} finally {
  const result = await cleanup.finish({ passed, stage, error: failure });
  for (const resource of [
    ...ephemeral.map((f) => f.context),
    a,
    b,
    m,
    browser,
  ]) {
    if (!resource) continue;
    try {
      await resource.close();
    } catch (error) {
      cleanup.recordFailure("close-resources", error);
      result.status = "failed";
    }
  }
  mkdirSync("reports/sharing-preview", { recursive: true });
  writeFileSync(
    "reports/sharing-preview/latest-run.json",
    JSON.stringify(result, null, 2) + "\n",
    { mode: 0o600 },
  );
  if (result.status === "passed") {
    receipt.runId = cleanup.runId;
    receipt.cleanup = {
      deleted: result.deleted,
      remaining: result.remaining,
      privateJournal: result.report,
    };
    writeFileSync(
      "reports/sharing-preview/acceptance.json",
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(JSON.stringify(receipt));
  } else {
    console.error(
      JSON.stringify({ code: "PREVIEW_ACCEPTANCE_FAILED", ...result }),
    );
    process.exitCode = 1;
  }
}
