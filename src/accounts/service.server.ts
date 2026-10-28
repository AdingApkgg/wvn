import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { PoolClient } from "pg";
import { PgDatabase } from "../database/postgres.ts";
import { migrate } from "../database/migrations.ts";
import { accountMigrations } from "../database/accounts.ts";
import { getMigrations } from "better-auth/db/migration";
import { validateAccountConfig, type AccountConfig } from "./config.server.ts";
import {
  makeAuth,
  newUserId,
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
import { WorkStatsStore } from "./work-stats.server.ts";
import { mountWorkStats } from "./work-stats-http.server.ts";
import {createAnalyticsApp} from '../analytics/proxy.server.ts';
export type Player = { session: PlayerSession; binding: string };
export type AccountService = {
  app: Hono;
  db: PgDatabase;
  auth: ReturnType<typeof makeAuth>;
  config: AccountConfig;
  player: (c: Context, recent?: boolean) => Promise<Player>;
  recovery: RecoveryStore;
  library: LibraryStore;
  workStats: WorkStatsStore;
  saves: SaveStore | null;
  sharing: ShareStore | null;
  claims: ShareClaims | null;
  deletions: DeletionLedger;
  withLock: <T>(fn: () => T | Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};
export async function createAccountService(
  input: AccountConfig,
): Promise<AccountService> {
  const config = validateAccountConfig(input);
  const analytics=config.analytics?createAnalyticsApp({...config.analytics,origin:config.origin}):null;
  const db = new PgDatabase(config.database, { schema: config.databaseSchema });
  let gc: ReturnType<typeof setInterval> | null = null;
  try {
  const deletions = new DeletionLedger(config.deletionLedger);
  const auth = makeAuth(db, config, (id) => deletions.entries.has(id));
  await (await getMigrations(auth.options)).runMigrations();
  await migrate(db, accountMigrations);
  const recovery = new RecoveryStore(db);
  const dynamicCatalog = config.catalogProvider ?? (config.catalogOrigin ? catalogProvider(config.catalogOrigin) : undefined);
  const library = new LibraryStore(db, config.catalog ?? [], undefined, dynamicCatalog);
  const saves = config.blobRoot ? new SaveStore(db, config.blobRoot, undefined, config.blobBackend) : null;
  const sharing =
    config.shareLedger && saves
      ? new ShareStore(
          db,
          saves,
          new CatalogPolicy(
            dynamicCatalog ?? (async () => config.catalog ?? []),
          ),
          new ShareLedger(config.shareLedger),
        )
      : null;
  const claims = sharing ? new ShareClaims(sharing) : null;
  const workStats = new WorkStatsStore(db,config.catalog??[]);
  if (sharing) await sharing.replay();
  await deletions.replay(db, saves);
  const app = new Hono();
  // 写操作在各进程先排队，再取得数据库会话锁；读取可并行，跨进程也保护通行密钥等组合操作。
  let tail = Promise.resolve();
  async function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    let client: PoolClient | undefined;
    let locked = false;
    try {
      client = await db.pool.connect();
      await client.query('SELECT pg_advisory_lock(hashtextextended($1,0))', ['wvn:account-api:' + (config.databaseSchema ?? 'public')]);
      locked = true;
      return await fn();
    } finally {
      try {
        if (locked && client) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', ['wvn:account-api:' + (config.databaseSchema ?? 'public')]);
      } finally { client?.release(); release(); }
    }
  }
  app.use("/api/*", async (c, next) =>
    ["GET", "HEAD", "OPTIONS"].includes(c.req.method) ||
    (c.req.method === "PUT" &&
      /^\/api\/me\/uploads\/[^/]+\/files\/[^/]+$/.test(c.req.path)) ||
    (c.req.method === "POST" &&
      ["/api/me/share-claims", "/api/me/share-downloads"].includes(c.req.path))
      ? next()
      : (await withLock(next)),
  );
  app.use("*", async (c, next) => {
    if (
      c.req.path.startsWith("/api/") &&
      (c.req.header('origin') === 'null' || ["same-site", "cross-site"].includes(c.req.header("sec-fetch-site") ?? ""))
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
    if(c.req.method==='OPTIONS'){
      const requested=(c.req.header('access-control-request-headers')??'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
      if(config.publicResourcePreflight?.(c.req.path)&&['GET','HEAD'].includes(c.req.header('access-control-request-method')??'')&&requested.every(name=>['x-requested-with','range'].includes(name))){
        return c.body(null,204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD','Access-Control-Allow-Headers':'X-Requested-With, Range','Access-Control-Max-Age':'600'});
      }
      return c.body(null,403);
    }
    if (
      !["GET", "HEAD"].includes(c.req.method) &&
      c.req.header("origin") !== config.origin
    )
      return c.json({ code: "ORIGIN_INVALID" }, 403);
    if (c.req.method === "OPTIONS") return c.body(null, 403);
    await next();
    // Framework/file handlers can return their own Response, bypassing Hono's
    // prepared headers. Fill missing defaults after dispatch without replacing
    // the runtime sandbox CSP or explicitly immutable engine responses.
    for (const [name, value] of Object.entries({
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    })) if (!c.res.headers.has(name)) c.header(name, value);
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
      (await db.prepare("DELETE FROM session WHERE id=$1 AND \"userId\"=$2").run(
        session.session.id,
        session.user.id,
      ));
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
    const state = (await db
      .prepare("SELECT auth_version FROM wg_account WHERE user_id=$1")
      .get(session.user.id));
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
      mode: config.deployment ?? "preview",
      revision: config.revision ?? null,
    }),
  );
  app.get("/api/login-options", (c) =>
    c.json({ passkey: true, signup: "open", password: false, mode:config.deployment??"preview", isolated:config.isolated===true }),
  );
  app.get("/api/me", async (c) => {
    const { session, binding } = await player(c);
    const keys = (await db
      .prepare(
        "SELECT id,name,\"createdAt\",\"deviceType\",\"backedUp\" FROM passkey WHERE \"userId\"=$1 ORDER BY \"createdAt\"",
      )
      .all(session.user.id));
    const devices = (await db
      .prepare(
        "SELECT id,\"userAgent\",\"createdAt\",\"expiresAt\" FROM session WHERE \"userId\"=$1 AND \"expiresAt\">$2 AND \"createdAt\">$3 ORDER BY \"createdAt\" DESC LIMIT 50",
      )
      .all(session.user.id, new Date(), new Date(Date.now() - ABSOLUTE_MS)));
    return c.json({
      user: { id: session.user.id, name: session.user.name },
      binding,
      passkeys: keys.map(key => ({ ...key, createdAt: new Date(key.createdAt).getTime(), backedUp: Number(key.backedUp) })),
      devices: devices.map((d) => ({
        ...d,
        createdAt: new Date(d.createdAt).getTime(),
        expiresAt: new Date(d.expiresAt).getTime(),
        current: d.id === session.session.id,
      })),
      recoveryReady: !!(await db
        .prepare(
          "SELECT 1 FROM wg_recovery_codes WHERE user_id=$1 AND used_at IS NULL LIMIT 1",
        )
        .get(session.user.id)),
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
          `${current.session.id}:${(await db.prepare("SELECT auth_version FROM wg_account WHERE user_id=$1").get(current.user.id))?.auth_version}`
        )
          throw new AccountError(409, "IDENTITY_CHANGED");
        context = {
          intent: "add",
          sessionId: current.session.id,
          version: (await db
            .prepare("SELECT auth_version FROM wg_account WHERE user_id=$1")
            .get(current.user.id))?.auth_version,
        };
      } else {
        const raw = JSON.parse(url.searchParams.get("context") ?? "{}");
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
    await db.transaction(async () => {
      const owned = (await db
        .prepare("SELECT id FROM passkey WHERE \"userId\"=$1 AND id=$2")
        .get(session.user.id, id));
      if (!owned) throw new AccountError(404, "NOT_FOUND");
      if (
        Number(
          (await db
            .prepare("SELECT count(*) AS n FROM passkey WHERE \"userId\"=$1")
            .get(session.user.id))?.n,
        ) <= 1
      )
        throw new AccountError(409, "LAST_PASSKEY");
      (await db.prepare("DELETE FROM passkey WHERE \"userId\"=$1 AND id=$2").run(
        session.user.id,
        id,
      ));
      (await db.prepare(
        "UPDATE wg_account SET auth_version=auth_version+1 WHERE user_id=$1",
      ).run(session.user.id));

    }, { lock: 'wvn:account-write' });
    return c.json({ ok: true });
  });
  app.post("/api/me/devices/:id/revoke", async (c) => {
    const { session } = await player(c, true);
    (await db.prepare("DELETE FROM session WHERE \"userId\"=$1 AND id=$2").run(
      session.user.id,
      c.req.param("id"),
    ));
    return c.json({ ok: true });
  });
  gc = saves
    ? setInterval(() => {
        void withLock(async () => {
          await sharing?.gc();
          await claims?.gc();
          await saves.gc();
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
    workStats,
    saves,
    sharing,
    claims,
    deletions,
    withLock,
    async close() {
      if (gc) clearInterval(gc);
      (await db.close());
    },
  };
  (await mountRecovery(service));
  mountLibrary(service);
  mountWorkStats(service);
  (await mountSettings(service));
  mountSaves(service);
  mountShares(service);
  if(analytics)app.route('/_s',analytics);
  return service;
  } catch (error) {
    if (gc) clearInterval(gc);
    await db.close();
    throw error;
  }
}
