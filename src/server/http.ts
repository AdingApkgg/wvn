import {managementSummary} from '../engines/status.ts';
import { parseWorkSlug } from "../identity.ts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import { Conflict, Store } from "./store.ts";
import { Auth } from "./auth.ts";
import { fileResponse } from "./resources.ts";
import { registerOnsPilot } from "../ons/http.server.ts";
import { pilotForVersion } from "../ons/pilots.server.ts";
function base() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    await next();
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    c.header("Cross-Origin-Embedder-Policy", "require-corp");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "same-origin");
  });
  app.onError((e, c) =>
    c.json(
      {
        error:
          e instanceof Conflict
            ? e.message
            : e instanceof ZodError
              ? "输入格式无效"
              : "请求无法完成",
      },
      e instanceof Conflict ? 409 : 400,
    ),
  );
  return app;
}
export function createPublicApp(
  store: Store,
  root: string,
  mediaRoot?: string,
  publicApi?: Hono,
) {
  const app = base();
  if (process.env.WG_ONS_PILOT === "1") registerOnsPilot(app, root);
  app.get("/favicon.ico", (c) =>
    c.body(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#13151b"/><text x="32" y="42" fill="#d3b9a1" text-anchor="middle" font-family="serif" font-size="30">W</text></svg>',
      200,
      {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=86400",
      },
    ),
  );
  app.on(["GET", "HEAD"], "/media/:file", async (c) => {
    const file = c.req.param("file");
    if (
      !mediaRoot ||
      !/^([a-f0-9]{64})\.(jpg|png|webp)$/.test(file) ||
      !(await store.hasMedia("/media/" + file))
    )
      return c.notFound();
    return (await fileResponse(c.req.raw, mediaRoot, "/" + file));
  });
  app.get("/health", (c) => c.json({ status: "ok", mode: "preview" }));
  app.all("/share-admin", (c) => c.notFound());
  app.all("/s/*", (c) => c.notFound());
  app.all("/api/share-admin/*", (c) => c.notFound());
  app.all("/account", (c) => c.notFound());
  app.all("/account/*", (c) => c.notFound());
  app.all("/api/manage/*", (c) => c.notFound());
  app.all("/manage", (c) => c.notFound());
  app.all("/manage/*", (c) => c.notFound());
  app.get("/api/catalog", async (c) =>
    c.json((await store.list()).filter((w) => w.versions.length)),
  );
  app.get("/api/works/:id", async (c) => {
    const id = parseWorkSlug(c.req.param("id"));
    if (!id) return c.notFound();
    const w = (await store.get(id));
    return w?.versions.length ? c.json(w) : c.notFound();
  });
  if (publicApi) app.route("/", publicApi);
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return c.notFound();
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/assets/")) return (await next());
    let decoded;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return c.notFound();
    }
    const vs = (await store.list()).flatMap((w) => w.versions);
    const match = (await Promise.all(vs
      .map(async (v) => (await store.raw(v.id))!)))
      .sort((a, b) => b.legacyPath.length - a.legacyPath.length)
      .find(
        (v) =>
          decoded === v.legacyPath.slice(0, -1) ||
          decoded.startsWith(v.legacyPath),
      );
    if (match) {
      if (decoded === match.legacyPath.slice(0, -1))
        return c.redirect(
          encodeURI(match.legacyPath) + new URL(c.req.url).search,
          302,
        );
      const pilot = pilotForVersion(match.id);
      if (pilot) {
        // Check the same decoded path used by resource matching. All legacy
        // files for a pilot are closed; its data is served only via manifests.
        // This also avoids Windows trailing-dot/space filename aliases.
        if ([match.legacyPath, match.legacyPath + "index.html", match.legacyPath + "onsyuri.html"].includes(decoded)) return c.redirect(pilot.route, 302);
        return c.notFound();
      }
      return (await fileResponse(
        c.req.raw,
        root,
        decoded.endsWith("/") ? path + "index.html" : path,
        match.legacyPath,
      ));
    }
    if (
      (/\.[a-z0-9]+$/i.test(path) &&
        !/^\/(?:_|_root|b?[1-9]\d{0,8}(?:\/[1-9]\d{0,8})?(?:\/_)?)\.data$/.test(
          path,
        )) ||
      /^\/api\//.test(path)
    )
      return c.notFound();
    return (await next());
  });
  return app;
}
export function createAdminApp(store: Store, auth: Auth, sourceData: unknown) {
  const app = base();
  app.use(
    "*",
    bodyLimit({
      maxSize: 65536,
      onError: (c) => c.json({ error: "请求过大" }, 413),
    }),
  );
  app.use("/api/manage/*", async (c, next) => {
    if (!["GET", "HEAD"].includes(c.req.method) && !auth.origin(c))
      return c.json({ error: "来源无效" }, 403);
    if (c.req.path !== "/api/manage/login" && !auth.allowed(c))
      return c.json({ error: "需要登录" }, 401);
    return (await next());
  });
  app.post("/api/manage/login", async (c) => {
    const body = await c.req.json();
    if (typeof body.token !== "string" || body.token.length > 128)
      return c.json({ error: "凭据无效" }, 401);
    const session = auth.login(body.token);
    if (!session) return c.json({ error: "凭据无效或已使用" }, 401);
    auth.set(c, session);
    return c.json({ ok: true });
  });
  app.get("/api/manage/engines", c=>c.json(managementSummary()));
  app.get("/api/manage/catalog", async (c) => c.json((await store.list(true))));
  app.get("/api/manage/pending", async (c) => c.json((await store.pending())));
  app.post("/api/manage/works", async (c) =>
    c.json((await store.createWork(await c.req.json())), 201),
  );
  app.post("/api/manage/pending/:id/assign", async (c) => {
    const b = await c.req.json();
    return c.json((await store.bindPending(c.req.param("id"), b.workId)), 201);
  });
  app.get("/api/manage/sources", (c) => c.json(sourceData));
  app.patch("/api/manage/works/:id", async (c) => {
    const b = await c.req.json();
    return c.json((await store.editWork(c.req.param("id"), b.revision, b.patch)));
  });
  app.post("/api/manage/works/:id/versions", async (c) =>
    c.json((await store.addVersion(c.req.param("id"), await c.req.json())), 201),
  );
  app.patch("/api/manage/versions/:id", async (c) => {
    const b = await c.req.json();
    return c.json((await store.editVersion(c.req.param("id"), b.revision, b.patch)));
  });
  app.post("/api/manage/versions/:id/reassign", async (c) => {
    const b = await c.req.json();
    return c.json(
      (await store.reassignVersion(c.req.param("id"), b.workId, b.revision)),
    );
  });
  app.post("/api/manage/reports", async (c) =>
    c.json((await store.importReport(await c.req.json())), 201),
  );
  return app;
}
