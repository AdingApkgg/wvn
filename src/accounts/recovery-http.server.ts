import { brand } from "../brand";
import { createHash } from "node:crypto";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { AccountError } from "./errors.server.ts";
import type { createAccountService } from "./service.server.ts";
export function mountRecovery(
  service: Awaited<ReturnType<typeof createAccountService>>,
) {
  const { app, db, config, player, recovery } = service;
  const COOKIE = `${config.cookiePrefix ?? '__Host-wg'}-recovery`;
  async function limit(key: string, max: number) {
    const window = Math.floor(Date.now() / 600_000);
    const hash = createHash("sha256").update(key).digest("hex");
    (await db.prepare("DELETE FROM wg_rate WHERE \"window\"<$1").run(window - 1));
    (await db.prepare(
      "INSERT INTO wg_rate VALUES ($1,$2,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN wg_rate.\"window\"=excluded.\"window\" THEN wg_rate.count+1 ELSE 1 END,\"window\"=excluded.\"window\"",
    ).run(hash, window));
    if (
      Number(
        (await db.prepare("SELECT count FROM wg_rate WHERE key=$1").get(hash))?.count,
      ) > max
    )
      throw new AccountError(429, "TRY_LATER");
  }
  app.post("/api/me/recovery-codes", async (c) => {
    const { session } = await player(c, true);
    const codes = (await recovery.rotate(session.user.id));
    return c.json({ accountId: session.user.id, codes });
  });
  app.post("/api/recovery/start", async (c) => {
    const body = await c.req.json();
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    const code = typeof body.code === "string" ? body.code : "";
    (await limit("recovery:global", 100));
    (await limit("recovery:" + accountId, 5));
    const token =
      accountId.length <= 100 && code.length <= 100
        ? (await recovery.start(accountId, code))
        : null;
    if (!token) throw new AccountError(400, "RECOVERY_INVALID");
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 600,
    });
    return c.json({ ok: true });
  });
  app.post("/api/recovery/options", async (c) => {
    const token = getCookie(c, COOKIE) ?? "";
    const state = (await recovery.inspect(token));
    if (!state) throw new AccountError(401, "RECOVERY_EXPIRED");
    const user = (await db
      .prepare("SELECT name FROM \"user\" WHERE id=$1")
      .get(state.userId));
    if (!user) throw new AccountError(401, "RECOVERY_EXPIRED");
    const options = await generateRegistrationOptions({
      rpName: brand.title,
      rpID: new URL(config.origin).hostname,
      userName: String(user.name),
      userID: new TextEncoder().encode(state.userId),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: (await db
        .prepare("SELECT \"credentialID\" FROM passkey WHERE \"userId\"=$1")
        .all(state.userId))
        .map((p) => ({ id: String(p.credentialID) })),
    });
    (await recovery.setChallenge(token, options.challenge));
    return c.json(options);
  });
  app.post("/api/recovery/complete", async (c) => {
    const token = getCookie(c, COOKIE) ?? "";
    let state;
    try {
      state = (await recovery.takeChallenge(token));
    } catch {
      throw new AccountError(401, "RECOVERY_EXPIRED");
    }
    const body = await c.req.json();
    let result;
    try {
      result = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: state.challenge!,
        expectedOrigin: config.origin,
        expectedRPID: new URL(config.origin).hostname,
        requireUserVerification: true,
      });
    } catch {
      throw new AccountError(400, "PASSKEY_INVALID");
    }
    if (!result.verified || !result.registrationInfo?.userVerified)
      throw new AccountError(400, "PASSKEY_INVALID");
    const info = result.registrationInfo;
    const codes = (await recovery.complete(token, {
      id: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey).toString("base64"),
      counter: info.credential.counter,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      transports: body.response.response.transports ?? [],
    }));
    deleteCookie(c, COOKIE, {
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
    });
    return c.json({
      ok: true,
      accountId: state.userId,
      codes,
      signInRequired: true,
    });
  });
}
