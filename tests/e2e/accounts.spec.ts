import { registrationFixture } from "../helpers/webauthn.ts";
import { test, expect, type Page } from "@playwright/test";
const origin = process.env.WG_ACCOUNT_TEST_URL;
test.use({ ignoreHTTPSErrors: false });
test.skip(!origin, "Separate HTTPS account preview required");
import {
  authenticator,
  register,
  login,
  api,
} from "../helpers/account-browser";
test("Passkey-first: registration, sign-out, login and last-key protection", async ({
  page,
}) => {
  await page.goto(origin + "/health");
  await authenticator(page);
  const registration = await register(page, "Reader A");
  expect(registration.status).toBe(200);
  expect(registration.body).toEqual({ ok: true });
  const me = await api(page, "/api/me");
  expect(me.status).toBe(200);
  expect(me.data.user.name).toBe("Reader A");
  expect(me.data.passkeys).toHaveLength(1);
  const remove = await api(
    page,
    `/api/me/passkeys/${me.data.passkeys[0].id}/delete`,
    {},
  );
  expect(remove.status).toBe(409);
  expect((await api(page, "/api/auth/sign-out", {})).status).toBe(200);
  expect((await api(page, "/api/me")).status).toBe(401);
  expect(await login(page)).toBe(200);
  expect((await api(page, "/api/me")).data.user.id).toBe(me.data.user.id);
});
test("recovery ticket has no ordinary access and replacing a key revokes old sessions", async ({
  page,
  browser,
}) => {
  await page.goto(origin + "/health");
  await authenticator(page);
  expect((await register(page, "Recovery Reader")).status).toBe(200);
  const me = await api(page, "/api/me");
  const codes = await api(page, "/api/me/recovery-codes", {});
  expect(codes.data.codes).toHaveLength(10);
  const fresh = await browser.newContext({ ignoreHTTPSErrors: false });
  try {
    const target = await fresh.newPage();
    await target.goto(origin + "/health");
    await authenticator(target);
    expect(
      (
        await api(target, "/api/recovery/start", {
          accountId: me.data.user.id,
          code: codes.data.codes[0],
        })
      ).status,
    ).toBe(200);
    expect((await api(target, "/api/me")).status).toBe(401);
    const recovered = await target.evaluate(async () => {
      const options = await (
        await fetch("/api/recovery/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).json();
      const decode = (v: string) =>
        Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        );
      options.challenge = decode(options.challenge);
      options.user.id = decode(options.user.id);
      options.excludeCredentials = options.excludeCredentials.map(
        (c: { id: string }) => ({ ...c, id: decode(c.id) }),
      );
      const cred = (await navigator.credentials.create({
        publicKey: options,
      })) as PublicKeyCredential;
      const r = await fetch("/api/recovery/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: cred.toJSON() }),
      });
      return { status: r.status, data: await r.json() };
    });
    expect(recovered.status).toBe(200);
    expect(recovered.data.codes).toHaveLength(10);
    expect((await api(target, "/api/me")).status).toBe(401);
    expect((await api(page, "/api/me")).status).toBe(401);
    expect(await login(target)).toBe(200);
    expect((await api(target, "/api/me")).data.user.id).toBe(me.data.user.id);
    expect(
      (
        await api(target, "/api/recovery/start", {
          accountId: me.data.user.id,
          code: codes.data.codes[1],
        })
      ).status,
    ).toBe(400);
  } finally {
    await fresh.close();
  }
});
test("account page lets a player register and keep a recovery kit", async ({
  page,
}) => {
  await page.goto(origin + "/account");
  await authenticator(page);
  await expect(
    page.getByRole("heading", { name: "管理你的作品与存档" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "创建账号", exact: true }).click();
  await page.getByLabel("昵称").fill("UI Reader");
  await expect(page.locator("#account-invite")).toHaveCount(0);
  await page.getByRole("button", { name: "创建通行密钥并注册" }).click();
  await expect(page.getByRole("heading", { name: "我的故事" })).toBeVisible();
  await page.getByRole("tab", { name: "账号安全", exact: true }).click();
  await page.getByRole("button", { name: "生成恢复码" }).click();
  await expect(
    page.getByRole("heading", { name: "保存你的恢复码" }),
  ).toBeVisible();
  await expect(page.locator(".recovery-code")).toHaveCount(10);
  await page.getByRole("button", { name: "我已保存，关闭" }).click();
  await expect(page.locator(".recovery-code")).toHaveCount(0);
  await page.getByRole("button", { name: "退出账号" }).click();
  await expect(
    page.getByRole("button", { name: "使用通行密钥登录", exact: true }),
  ).toBeVisible();
});

test("server refuses valid none-attestation without user verification", async ({
  page,
}) => {
  await page.goto(origin + "/health");
  const options = await page.evaluate(async () => {
    const context = encodeURIComponent(
      JSON.stringify({ nickname: "No UV Reader" }),
    );
    return (
      await fetch(
        "/api/auth/passkey/generate-register-options?context=" + context,
      )
    ).json();
  });
  const response = registrationFixture(options.challenge, origin!, false);
  // Characterize the fixture: upstream accepts its structure when UV is optional.
  const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
  const verified = await verifyRegistrationResponse({
    response,
    expectedOrigin: origin!,
    expectedRPID: new URL(origin!).hostname,
    expectedChallenge: options.challenge,
    requireUserVerification: false,
  });
  expect(verified.verified).toBe(true);
  expect(verified.registrationInfo?.userVerified).toBe(false);
  const status = await page.evaluate(
    async (response) =>
      (
        await fetch("/api/auth/passkey/verify-registration", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response, createSession: true }),
        })
      ).status,
    response,
  );
  expect(status).toBe(400);
  expect((await api(page, "/api/me")).status).toBe(401);
});
test("private library survives login and another account cannot read it", async ({
  page,
  browser,
}) => {
  await page.goto(origin + "/health");
  await authenticator(page);
  expect((await register(page, "Book Owner")).status).toBe(200);
  const catalog = await api(page, "/api/account-catalog");
  const work = catalog.data[0];
  expect(work).toBeTruthy();
  expect(
    (
      await api(
        page,
        `/api/me/library/${work.id}`,
        { revision: 0, status: "playing", note: "private chapter" },
        "PATCH",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await api(
        page,
        `/api/me/library/${work.id}`,
        { revision: 0, status: "completed", note: "stale" },
        "PATCH",
      )
    ).status,
  ).toBe(409);
  const exportA = await api(page, "/api/me/export");
  expect(exportA.data.library[0].note).toBe("private chapter");
  const other = await browser.newContext({ ignoreHTTPSErrors: false });
  try {
    const target = await other.newPage();
    await target.goto(origin + "/health");
    await authenticator(target);
    expect((await register(target, "Other Reader")).status).toBe(200);
    expect((await api(target, "/api/me/library")).data).toEqual([]);
    expect((await api(target, "/api/me/export")).data.library).toEqual([]);
  } finally {
    await other.close();
  }
  expect((await api(page, "/api/me/library")).data[0].note).toBe(
    "private chapter",
  );
});
test("additional keys, safe names, stale bindings and account deletion", async ({
  page,
}) => {
  await page.goto(origin + "/health");
  const key = await authenticator(page);
  expect((await register(page, "Manage Reader")).status).toBe(200);
  const before = await api(page, "/api/me");
  await key.cdp.send("WebAuthn.removeVirtualAuthenticator", {
    authenticatorId: key.id,
  });
  await key.cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "usb",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  expect((await register(page, "Manage Reader")).status).toBe(200);
  const me = await api(page, "/api/me");
  expect(me.data.passkeys).toHaveLength(2);
  expect(
    (
      await api(
        page,
        `/api/me/passkeys/${me.data.passkeys[0].id}`,
        { name: "备用钥匙" },
        "PATCH",
      )
    ).status,
  ).toBe(200);
  const stale = await page.evaluate(async (binding) => {
    const result = await fetch("/api/me/recovery-codes", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wg-binding": binding },
      body: "{}",
    });
    return { status: result.status, body: await result.json() };
  }, before.data.binding);
  expect(stale.status).toBe(409);
  expect(stale.body.code).toBe("IDENTITY_CHANGED");
  expect(
    (await api(page, "/api/me", { confirmation: "wrong" }, "DELETE")).status,
  ).toBe(400);
  expect(
    (await api(page, "/api/me", { confirmation: "DELETE" }, "DELETE")).status,
  ).toBe(200);
  expect((await api(page, "/api/me")).status).toBe(401);
});
test("manual cloud backup uploads exact files and restores history without touching game storage", async ({
  page,
}) => {
  await page.goto(origin + "/account");
  await authenticator(page);
  await page.getByRole("tab", { name: "创建账号", exact: true }).click();
  await page.getByLabel("昵称").fill("Cloud Reader");
  await expect(page.locator("#account-invite")).toHaveCount(0);
  await page.getByRole("button", { name: "创建通行密钥并注册" }).click();
  await page.getByRole("tab", { name: "存档", exact: true }).click();
  const select = page.getByRole("combobox", { name: "存档所属版本" });
  await expect(select).toBeVisible();
  const version = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(version!);
  await page.getByLabel("游戏导出的存档文件").setInputFiles({
    name: "save1.dat",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("progress-one"),
  });
  await page
    .getByRole("button", { name: "保留云端历史，保存为新备份" })
    .click();
  await expect(page.getByRole("status")).toContainText("文件备份已保存到云端");
  const firstDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "下载 save1.dat", exact: true })
    .first()
    .click();
  const first = await firstDownload;
  expect(
    await (
      await import("node:fs/promises")
    ).readFile((await first.path())!, "utf8"),
  ).toBe("progress-one");
  await page.getByLabel("游戏导出的存档文件").setInputFiles({
    name: "save1.dat",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("progress-two"),
  });
  await page
    .getByRole("button", { name: "保留云端历史，保存为新备份" })
    .click();
  await expect(
    page.getByRole("link", { name: "下载 save1.dat", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "设为当前云端备份" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "下载 save1.dat", exact: true }),
  ).toHaveCount(3);
  const restoredDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "下载 save1.dat", exact: true })
    .first()
    .click();
  const restored = await restoredDownload;
  expect(
    await (
      await import("node:fs/promises")
    ).readFile((await restored.path())!, "utf8"),
  ).toBe("progress-one");
});
test("interrupted cloud upload stays local after reload and is hidden from a different account", async ({
  page,
}) => {
  await page.goto(origin + "/account");
  await authenticator(page);
  await page.getByRole("tab", { name: "创建账号", exact: true }).click();
  await page.getByLabel("昵称").fill("Draft Owner");
  await expect(page.locator("#account-invite")).toHaveCount(0);
  await page.getByRole("button", { name: "创建通行密钥并注册" }).click();
  await page.getByRole("tab", { name: "存档", exact: true }).click();
  const select = page.getByRole("combobox", { name: "存档所属版本" });
  await expect(select).toBeVisible();
  const version = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(version!);
  await page.route("**/api/me/uploads/*/files/*", (route) => route.abort());
  await page.getByLabel("游戏导出的存档文件").setInputFiles({
    name: "pending.dat",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("offline-progress"),
  });
  await page
    .getByRole("button", { name: "保留云端历史，保存为新备份" })
    .click();
  await expect(
    page.getByRole("button", { name: "继续上传", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("combobox", { name: "存档所属版本" })
    .selectOption(version!);
  await expect(
    page.getByRole("button", { name: "继续上传", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "退出账号", exact: true }).click();
  await page.getByRole("tab", { name: "创建账号", exact: true }).click();
  await page.getByLabel("昵称").fill("Other Draft Reader");
  await expect(page.locator("#account-invite")).toHaveCount(0);
  await page.getByRole("button", { name: "创建通行密钥并注册" }).click();
  await page
    .getByRole("combobox", { name: "存档所属版本" })
    .selectOption(version!);
  await expect(page.getByLabel("游戏导出的存档文件")).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "继续上传", exact: true }),
  ).toHaveCount(0);
});

test("recovery completion keeps the target kit separate from another discoverable account", async ({
  page,
}) => {
  await page.goto(origin + "/health");
  const key = await authenticator(page);
  expect((await register(page, "Recovery Target A")).status).toBe(200);
  const a = (await api(page, "/api/me")).data;
  const oldCredential = (
    await key.cdp.send("WebAuthn.getCredentials", { authenticatorId: key.id })
  ).credentials[0];
  const codes = (await api(page, "/api/me/recovery-codes", {})).data;
  await api(page, "/api/auth/sign-out", {});
  expect((await register(page, "Other Discoverable B")).status).toBe(200);
  await api(page, "/api/auth/sign-out", {});
  await key.cdp.send("WebAuthn.removeCredential", {
    authenticatorId: key.id,
    credentialId: oldCredential.credentialId,
  });
  await page.goto(origin + "/account");
  // Keep the original focus-refresh cancellation separate from this identity regression.
  await page.evaluate(() =>
    window.addEventListener("focus", (e) => e.stopImmediatePropagation(), true),
  );
  await page.getByRole("button", { name: "丢失通行密钥？恢复账号", exact: true }).click();
  await page.getByLabel("恢复账号标识").fill(a.user.id);
  await page.getByLabel("一次性恢复码").fill(codes.codes[0]);
  await page.route("**/api/recovery/complete", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const credentialId = route.request().postDataJSON().response.id;
    // Only B remains discoverable: a generic post-recovery login would choose B.
    await key.cdp.send("WebAuthn.removeCredential", {
      authenticatorId: key.id,
      credentialId: Buffer.from(credentialId, "base64url").toString("base64"),
    });
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "验证恢复码并创建新密钥" }).click();
  await expect(page.locator(".recovery-code")).toHaveCount(10);
  await expect(
    page.getByRole("button", {
      name: "返回登录",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(1);
  expect((await api(page, "/api/me")).status).toBe(401);
  await page.getByRole("button", { name: "我已保存，关闭" }).click();
  await page.getByRole("button", { name: "返回登录", exact: true }).click();
  await page
    .getByRole("button", { name: "使用通行密钥登录", exact: true })
    .click();
  await expect(
    page.getByText("Other Discoverable B，欢迎回来。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".recovery-code")).toHaveCount(0);
});

test("late rotation refresh cannot restore A recovery secrets after a cross-tab switch to B", async ({
  page,
  browser,
}) => {
  await page.goto(origin + "/health");
  await authenticator(page);
  expect((await register(page, "Secret Owner A")).status).toBe(200);
  const other = await browser.newContext({ ignoreHTTPSErrors: false });
  let release!: () => void;
  try {
    const target = await other.newPage();
    await target.goto(origin + "/health");
    await authenticator(target);
    expect((await register(target, "Secret Owner B")).status).toBe(200);
    const cookiesB = await other.cookies();
    await page.goto(origin + "/account");
    await expect(
      page.getByText("Secret Owner A，欢迎回来。", { exact: true }),
    ).toBeVisible();
    let hold = false;
    let waiting!: () => void;
    const held = new Promise<void>((r) => {
      waiting = r;
    });
    const released = new Promise<void>((r) => {
      release = r;
    });
    await page.route("**/api/me/recovery-codes", async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      hold = true;
      await route.fulfill({ response });
    });
    await page.route("**/api/me", async (route) => {
      if (!hold) return route.continue();
      hold = false;
      const response = await route.fetch();
      waiting();
      await released;
      await route.fulfill({ response }).catch(() => {});
    });
    await page.getByRole("tab", { name: "账号安全", exact: true }).click();
    await page.getByRole("button", { name: "生成恢复码", exact: true }).click();
    await held;
    await page.context().addCookies(cookiesB);
    await page.evaluate(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "wg-account-change",
          newValue: "other-tab",
        }),
      ),
    );
    await expect(
      page.getByText("Secret Owner B，欢迎回来。", { exact: true }),
    ).toBeVisible();
    release();
    await expect(
      page.getByRole("button", { name: "生成恢复码", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".recovery-code")).toHaveCount(0);
  } finally {
    release?.();
    await other.close();
  }
});

test("old signup and add-key challenges cannot complete after switching accounts", async ({
  page,
}) => {
  await page.goto(origin + "/health");
  await authenticator(page);
  const context = encodeURIComponent(
    JSON.stringify({
      nickname: "Stale Signup",
    }),
  );
  const oldSignup = await page.evaluate(
    async (context) =>
      (
        await fetch(
          "/api/auth/passkey/generate-register-options?context=" + context,
        )
      ).json(),
    context,
  );
  const signupCookies = (await page.context().cookies()).filter((c) =>
    c.name.endsWith("better-auth-passkey"),
  );
  expect((await register(page, "Challenge Owner A")).status).toBe(200);
  const a = (await api(page, "/api/me")).data;
  const oldAdd = await page.evaluate(
    async (binding) =>
      (
        await fetch("/api/auth/passkey/generate-register-options", {
          headers: { "x-wg-binding": binding },
        })
      ).json(),
    a.binding,
  );
  const addCookies = (await page.context().cookies()).filter((c) =>
    c.name.endsWith("better-auth-passkey"),
  );
  await api(page, "/api/auth/sign-out", {});
  expect((await register(page, "Challenge Owner B")).status).toBe(200);
  const b = (await api(page, "/api/me")).data;
  for (const [options, cookies] of [
    [oldSignup, signupCookies],
    [oldAdd, addCookies],
  ] as const) {
    expect(cookies.length).toBeGreaterThan(0);
    await page.context().addCookies(cookies);
    const response = registrationFixture(options.challenge, origin!, true);
    const result = await page.evaluate(
      async (response) =>
        (
          await fetch("/api/auth/passkey/verify-registration", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ response, createSession: true }),
          })
        ).status,
      response,
    );
    expect([400, 401]).toContain(result);
  }
  const after = (await api(page, "/api/me")).data;
  expect(after.user.id).toBe(b.user.id);
  expect(after.passkeys).toHaveLength(1);
});
