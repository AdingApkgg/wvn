import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AccountService } from "./service.server.ts";
import { AccountError } from "./errors.server.ts";
export function createShareAdminApp(
  service: AccountService,
  origin: string,
  token = randomBytes(32).toString("base64url"),
) {
  const app = new Hono(),
    sessions = new Map<string, number>();
  const expectedHost = new URL(origin).host;
  let invite = token;
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header(
      "Content-Security-Policy",
      "frame-ancestors 'none'; object-src 'none'",
    );
    c.header("Referrer-Policy", "no-referrer");
    if (new URL(c.req.url).host !== expectedHost)
      return c.json({ code: "HOST_MISMATCH" }, 421);
    if (
      (c.req.method !== "GET" && c.req.header("origin") !== origin) ||
      ["same-site", "cross-site"].includes(c.req.header("sec-fetch-site") ?? "")
    )
      return c.json({ code: "ORIGIN_INVALID" }, 403);
    return next();
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 65536,
      onError: (c) => c.json({ code: "BODY_TOO_LARGE" }, 413),
    }),
  );
  app.use("/api/share-admin/*", async (c, next) => {
    if (c.req.path.endsWith("/login")) return next();
    const session = getCookie(c, "__Host-wg-share-admin") ?? "";
    if ((sessions.get(session) ?? 0) < Date.now())
      return c.json({ code: "SIGN_IN_REQUIRED" }, 401);
    return (await service.withLock(next));
  });
  app.post("/api/share-admin/login", async (c) => {
    await service.sharing?.limit("admin-login", 20, 600_000);
    const { token } = await c.req.json();
    if (
      !invite ||
      typeof token !== "string" ||
      Buffer.byteLength(token) !== Buffer.byteLength(invite) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(invite))
    )
      return c.json({ code: "SIGN_IN_REQUIRED" }, 401);
    invite = "";
    const session = randomBytes(32).toString("base64url");
    sessions.set(session, Date.now() + 8 * 3600_000);
    setCookie(c, "__Host-wg-share-admin", session, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 8 * 3600,
    });
    return c.json({ ok: true });
  });
  app.get("/api/share-admin/queue", async (c) => {
    await service.sharing?.catalog.refresh().catch(() => {});
    return c.json(await service.sharing?.queue() ?? []);
  });
  app.get("/api/share-admin/audit", async (c) =>
    c.json(
      (await service.db
        .prepare(
          "SELECT share,action,reason,created FROM wg_share_audit ORDER BY id DESC LIMIT 100",
        )
        .all()),
    ),
  );
  app.post("/api/share-admin/:id/moderate", async (c) => {
    if (!service.sharing) throw new AccountError(404);
    const body = await c.req.json();
    if (body.action === "approve") await service.sharing.catalog.refresh(true);
    (await service.sharing.moderate(
      c.req.param("id"),
      body.revision,
      body.action,
      body.reason,
    ));
    return c.json({ ok: true });
  });
  app.onError((e, c) =>
    c.json(
      { code: e instanceof AccountError ? e.code : "REQUEST_FAILED" },
      e instanceof AccountError ? e.status : 500,
    ),
  );
  return { app, token };
}
