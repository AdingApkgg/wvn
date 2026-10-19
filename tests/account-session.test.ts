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
