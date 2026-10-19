import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getMigrations } from "better-auth/db/migration";
import { validateAccountConfig, type AccountConfig } from "./config.server.ts";
import {
  makeAuth,
  newUserId,
  secureEqual,
  RECENT_MS,
  ABSOLUTE_MS,
  type PlayerSession,
} from "./auth.server.ts";
import { AccountError } from "./errors.server.ts";
import { RecoveryStore } from "./recovery.server.ts";
import { DeletionLedger } from "./deletion.server.ts";
import { SaveStore } from "./saves.server.ts";
import { mountSaves } from "./saves-http.server.ts";
import { LibraryStore } from "./library.server.ts";
import { mountSettings } from "./settings-http.server.ts";
import { mountLibrary } from "./library-http.server.ts";
import { mountRecovery } from "./recovery-http.server.ts";
import { ShareStore } from "./shares.server.ts";
import { ShareLedger } from "./share-ledger.server.ts";
import { ShareClaims } from "./share-claims.server.ts";
import { CatalogPolicy, catalogProvider } from "./catalog-policy.server.ts";
import { mountShares } from "./shares-http.server.ts";
export type Player = { session: PlayerSession; binding: string };
export type AccountService = {
  app: Hono;
  db: DatabaseSync;
  auth: ReturnType<typeof makeAuth>;
  config: AccountConfig;
  player: (c: Context, recent?: boolean) => Promise<Player>;
  recovery: RecoveryStore;
  library: LibraryStore;
  saves: SaveStore | null;
  sharing: ShareStore | null;
  claims: ShareClaims | null;
  deletions: DeletionLedger;
  withLock: <T>(fn: () => T | Promise<T>) => Promise<T>;
  close: () => void;
};
export async function createAccountService(
  input: AccountConfig,
): Promise<AccountService> {
  const config = validateAccountConfig(input);
  if (config.database !== ":memory:")
    mkdirSync(dirname(config.database), { recursive: true });
  const db = new DatabaseSync(config.database);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS wg_account(user_id TEXT PRIMARY KEY,auth_version INTEGER NOT NULL,code_group TEXT NOT NULL)",
  );
  const recovery = new RecoveryStore(db);
  const library = new LibraryStore(db, config.catalog ?? []);
  const saves = config.blobRoot ? new SaveStore(db, config.blobRoot) : null;
  const sharing =
    config.shareLedger && saves
      ? new ShareStore(
          db,
          saves,
          new CatalogPolicy(
            config.catalogProvider ??
              catalogProvider(config.catalogOrigin ?? ""),
          ),
          new ShareLedger(config.shareLedger),
        )
      : null;
  const claims = sharing ? new ShareClaims(sharing) : null;
  const deletions = new DeletionLedger(config.deletionLedger);
  const auth = makeAuth(db, config, (id) => deletions.entries.has(id));
  await (await getMigrations(auth.options)).runMigrations();
  db.exec(
    "CREATE TABLE IF NOT EXISTS wg_deleted_accounts(user_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL)",
  );
  deletions.replay(db, saves);
  const app = new Hono();
  // One DatabaseSync connection: serialize API transactions across awaited library hooks.
  let tail = Promise.resolve();
  async function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  app.use("/api/*", (c, next) =>
    (c.req.method === "PUT" &&
      /^\/api\/me\/uploads\/[^/]+\/files\/[^/]+$/.test(c.req.path)) ||
    (c.req.method === "POST" &&
      ["/api/me/share-claims", "/api/me/share-downloads"].includes(c.req.path))
      ? next()
      : withLock(next),
  );
  app.use("*", async (c, next) => {
    if (
      c.req.path.startsWith("/api/") &&
      ["same-site", "cross-site"].includes(c.req.header("sec-fetch-site") ?? "")
    )
      return c.json({ code: "ORIGIN_INVALID" }, 403);
    c.header("Cache-Control", "private, no-store");
    c.header("Vary", "Cookie");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Cross-Origin-Embedder-Policy", "require-corp");
    c.header(
      "Content-Security-Policy",
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    if (new URL(c.req.url).origin !== config.origin)
      return c.json({ code: "HOST_MISMATCH" }, 421);
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      c.req.header("origin") !== config.origin
    )
      return c.json({ code: "ORIGIN_INVALID" }, 403);
    if (c.req.method === "OPTIONS") return c.body(null, 403);
    return next();
  });
  const smallBody = bodyLimit({
    maxSize: 65536,
    onError: (c) => c.json({ code: "BODY_TOO_LARGE" }, 413),
  });
  const manifestBody = bodyLimit({
    maxSize: 262144,
    onError: (c) => c.json({ code: "BODY_TOO_LARGE" }, 413),
  });
  app.use("/api/*", (c, next) => {
    if (
      c.req.method === "PUT" &&
      /^\/api\/me\/uploads\/[^/]+\/files\/[^/]+$/.test(c.req.path)
    )
      return next();
    return c.req.path.endsWith("/uploads")
      ? manifestBody(c, next)
      : smallBody(c, next);
  });
  app.onError((e, c) =>
    c.json(
      { code: e instanceof AccountError ? e.code : "REQUEST_FAILED" },
      e instanceof AccountError
        ? e.status
        : e instanceof SyntaxError
          ? 400
          : 500,
    ),
  );
  function authHeaders(c: Context) {
    const headers = new Headers(c.req.raw.headers);
    for (const key of [
      "forwarded",
      "x-forwarded-for",
      "x-real-ip",
      "cf-connecting-ip",
      "x-wg-client-ip",
    ])
      headers.delete(key);
    let peer = "127.0.0.1";
    try {
      peer = getConnInfo(c).remote.address ?? peer;
    } catch {}
    headers.set("x-wg-client-ip", peer);
    return headers;
  }
  async function readSession(c: Context) {
    const result = await auth.api.getSession({
      headers: authHeaders(c),
      returnHeaders: true,
    });
    const session = result.response;
    if (
      session &&
      (deletions.entries.has(session.user.id) ||
        Date.now() - new Date(session.session.createdAt).getTime() >
          ABSOLUTE_MS)
    ) {
      db.prepare("DELETE FROM session WHERE id=? AND userId=?").run(
        session.session.id,
        session.user.id,
      );
      return { ...result, response: null };
    }
    return result;
  }
  async function player(c: Context, recent = false): Promise<Player> {
    const result = await readSession(c);
    const session = result.response;
    if (!session) throw new AccountError(401, "SIGN_IN_REQUIRED");
    for (const cookie of result.headers.getSetCookie())
      c.header("Set-Cookie", cookie, { append: true });
    const state = db
      .prepare("SELECT auth_version FROM wg_account WHERE user_id=?")
      .get(session.user.id);
    if (!state) throw new AccountError(401, "SIGN_IN_REQUIRED");
    const binding = `${session.session.id}:${state.auth_version}`;
    if (c.req.method !== "GET" && c.req.header("x-wg-binding") !== binding)
      throw new AccountError(409, "IDENTITY_CHANGED");
    if (
      recent &&
      Date.now() - new Date(session.session.createdAt).getTime() > RECENT_MS
    )
      throw new AccountError(403, "REAUTH_REQUIRED");
    return { session, binding };
  }
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "wg-accounts",
      mode: "preview",
      revision: config.revision ?? null,
    }),
  );
  app.get("/api/login-options", (c) =>
    c.json({ passkey: true, signup: "invite", password: false }),
  );
  app.get("/api/me", async (c) => {
    const { session, binding } = await player(c);
    const keys = db
      .prepare(
        "SELECT id,name,createdAt,deviceType,backedUp FROM passkey WHERE userId=? ORDER BY createdAt",
      )
      .all(session.user.id);
    const devices = db
      .prepare(
        "SELECT id,userAgent,createdAt,expiresAt FROM session WHERE userId=? AND expiresAt>? AND createdAt>? ORDER BY createdAt DESC LIMIT 50",
      )
      .all(session.user.id, Date.now(), Date.now() - ABSOLUTE_MS);
    return c.json({
      user: { id: session.user.id, name: session.user.name },
      binding,
      passkeys: keys,
      devices: devices.map((d) => ({
        ...d,
        current: d.id === session.session.id,
      })),
      recoveryReady: !!db
        .prepare(
          "SELECT 1 FROM wg_recovery_codes WHERE user_id=? AND used_at IS NULL LIMIT 1",
        )
        .get(session.user.id),
    });
  });
  const allowed = new Set([
    "/api/auth/passkey/generate-register-options",
    "/api/auth/passkey/verify-registration",
    "/api/auth/passkey/generate-authenticate-options",
    "/api/auth/passkey/verify-authentication",
    "/api/auth/sign-out",
  ]);
  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    if (!allowed.has(c.req.path)) return c.notFound();
    if (c.req.path === "/api/auth/sign-out") await player(c);
    let req = new Request(c.req.raw, { headers: authHeaders(c) });
    if (c.req.path.endsWith("generate-register-options")) {
      const url = new URL(req.url);
      const current = (await readSession(c)).response;
      let context: Record<string, unknown>;
      if (current) {
        if (
          Date.now() - new Date(current.session.createdAt).getTime() >
          RECENT_MS
        )
          throw new AccountError(403, "REAUTH_REQUIRED");
        if (
          c.req.header("x-wg-binding") !==
          `${current.session.id}:${db.prepare("SELECT auth_version FROM wg_account WHERE user_id=?").get(current.user.id)?.auth_version}`
        )
          throw new AccountError(409, "IDENTITY_CHANGED");
        context = {
          intent: "add",
          sessionId: current.session.id,
          version: db
            .prepare("SELECT auth_version FROM wg_account WHERE user_id=?")
            .get(current.user.id)?.auth_version,
        };
      } else {
        const raw = JSON.parse(url.searchParams.get("context") ?? "{}");
        if (
          typeof raw.invite !== "string" ||
          !secureEqual(raw.invite, config.signupInvite)
        )
          throw new AccountError(403, "INVITATION_REQUIRED");
        const name = String(raw.nickname ?? "")
          .normalize("NFKC")
          .trim();
        if (!name || [...name].length > 40 || /[\p{Cc}\p{Cf}]/u.test(name))
          throw new AccountError(400, "NICKNAME_INVALID");
        context = { intent: "signup", id: newUserId(), name };
      }
      url.searchParams.set("context", JSON.stringify(context));
      url.searchParams.delete("name");
      req = new Request(url, { method: req.method, headers: req.headers });
    }
    const response = await auth.handler(req);
    const headers = new Headers(response.headers);
    // Better Auth Passkey responses include session.token; never send it to page JS.
    if (response.ok && c.req.path.endsWith("generate-authenticate-options")) {
      const data = await response.json();
      data.userVerification = "required";
      return new Response(JSON.stringify(data), { status: 200, headers });
    }
    if (
      response.ok &&
      c.req.method === "POST" &&
      c.req.path.includes("/passkey/")
    )
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers,
      });
    return response;
  });
  app.post("/api/me/passkeys/:id/delete", async (c) => {
    const { session } = await player(c, true);
    const id = c.req.param("id");
    db.exec("BEGIN IMMEDIATE");
    try {
      const owned = db
        .prepare("SELECT id FROM passkey WHERE userId=? AND id=?")
        .get(session.user.id, id);
      if (!owned) throw new AccountError(404, "NOT_FOUND");
      if (
        Number(
          db
            .prepare("SELECT count(*) AS n FROM passkey WHERE userId=?")
            .get(session.user.id)?.n,
        ) <= 1
      )
        throw new AccountError(409, "LAST_PASSKEY");
      db.prepare("DELETE FROM passkey WHERE userId=? AND id=?").run(
        session.user.id,
        id,
      );
      db.prepare(
        "UPDATE wg_account SET auth_version=auth_version+1 WHERE user_id=?",
      ).run(session.user.id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return c.json({ ok: true });
  });
  app.post("/api/me/devices/:id/revoke", async (c) => {
    const { session } = await player(c, true);
    db.prepare("DELETE FROM session WHERE userId=? AND id=?").run(
      session.user.id,
      c.req.param("id"),
    );
    return c.json({ ok: true });
  });
  const gc = saves
    ? setInterval(() => {
        void withLock(() => {
          sharing?.gc();
          claims?.gc();
          saves.gc();
        }).catch(() => {});
      }, 6 * 3600_000)
    : null;
  gc?.unref();
  const service = {
    app,
    db,
    auth,
    config,
    player,
    recovery,
    library,
    saves,
    sharing,
    claims,
    deletions,
    withLock,
    close() {
      if (gc) clearInterval(gc);
      db.close();
    },
  };
  mountRecovery(service);
  mountLibrary(service);
  mountSettings(service);
  mountSaves(service);
  mountShares(service);
  return service;
}
