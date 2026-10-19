import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAccountService } from "../src/accounts/service.server.ts";
import { registrationFixture } from "./helpers/webauthn.ts";
test("sessions survive a process restart and absolute expiration removes stale server state", async () => {
  const root = mkdtempSync(join(tmpdir(), "wg-session-"));
  const config = {
    origin: "https://accounts.wg.test",
    database: join(root, "accounts.sqlite"),
    deletionLedger: join(root, "deletions.jsonl"),
    secret: "synthetic-secret-that-is-at-least-48-characters-long",
    signupInvite: "test-invite",
  };
  let service = await createAccountService(config);
  try {
    const options = await service.app.request(
      config.origin +
        "/api/auth/passkey/generate-register-options?context=" +
        encodeURIComponent(
          JSON.stringify({
            nickname: "Persistent Reader",
            invite: config.signupInvite,
          }),
        ),
    );
    assert.equal(options.status, 200);
    const data = await options.json();
    const challengeCookie = options.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const verified = await service.app.request(
      config.origin + "/api/auth/passkey/verify-registration",
      {
        method: "POST",
        headers: {
          origin: config.origin,
          "content-type": "application/json",
          cookie: challengeCookie,
        },
        body: JSON.stringify({
          response: registrationFixture(data.challenge, config.origin, true),
          createSession: true,
        }),
      },
    );
    assert.equal(verified.status, 200);
    const cookie = verified.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    service.close();
    service = await createAccountService(config);
    const me = await service.app.request(config.origin + "/api/me", {
      headers: { cookie },
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.name, "Persistent Reader");
    service.db
      .prepare("UPDATE session SET createdAt=?,expiresAt=?")
      .run(Date.now() - 91 * 86400_000, Date.now() + 30 * 86400_000);
    const expired = await service.app.request(config.origin + "/api/me", {
      headers: { cookie },
    });
    assert.equal(expired.status, 401);
    assert.equal(expired.headers.getSetCookie().length, 0);
    assert.equal(
      service.db.prepare("SELECT count(*) AS n FROM session").get()?.n,
      0,
    );
  } finally {
    service.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("a renewal Cookie delivered after sign-out cannot revive the revoked session", async () => {
  const root = mkdtempSync(join(tmpdir(), "wg-late-cookie-"));
  const config = {
    origin: "https://accounts.wg.test",
    database: join(root, "accounts.sqlite"),
    deletionLedger: join(root, "deletions.jsonl"),
    secret: "synthetic-secret-that-is-at-least-48-characters-long",
    signupInvite: "test-invite",
  };
  const service = await createAccountService(config);
  try {
    const options = await service.app.request(
      config.origin +
        "/api/auth/passkey/generate-register-options?context=" +
        encodeURIComponent(
          JSON.stringify({
            nickname: "Late Cookie",
            invite: config.signupInvite,
          }),
        ),
    );
    const data = await options.json();
    const registration = await service.app.request(
      config.origin + "/api/auth/passkey/verify-registration",
      {
        method: "POST",
        headers: {
          origin: config.origin,
          "content-type": "application/json",
          cookie: options.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; "),
        },
        body: JSON.stringify({
          response: registrationFixture(data.challenge, config.origin, true),
          createSession: true,
        }),
      },
    );
    assert.equal(registration.status, 200);
    const cookie = registration.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    service.db
      .prepare("UPDATE session SET createdAt=?,updatedAt=?,expiresAt=?")
      .run(
        Date.now() - 3 * 86400_000,
        Date.now() - 3 * 86400_000,
        Date.now() + 27 * 86400_000,
      );
    // Capture a real renewal response, withhold its Cookie until AFTER the logout response.
    const renewal = await service.app.request(config.origin + "/api/me", {
      headers: { cookie },
    });
    assert.equal(renewal.status, 200);
    const late = renewal.headers
      .getSetCookie()
      .filter((c) => c.includes("session_token="));
    assert.ok(late.length > 0, "must exercise a genuine renewal Set-Cookie");
    const binding = (await renewal.json()).binding;
    const logout = await service.app.request(
      config.origin + "/api/auth/sign-out",
      {
        method: "POST",
        headers: {
          origin: config.origin,
          "content-type": "application/json",
          cookie,
          "x-wg-binding": binding,
        },
        body: "{}",
      },
    );
    assert.equal(logout.status, 200);
    const replay = await service.app.request(config.origin + "/api/me", {
      headers: { cookie: late.map((c) => c.split(";")[0]).join("; ") },
    });
    assert.equal(replay.status, 401);
    assert.equal(
      service.db.prepare("SELECT count(*) AS n FROM session").get()?.n,
      0,
    );
  } finally {
    service.close();
    rmSync(root, { recursive: true, force: true });
  }
});
