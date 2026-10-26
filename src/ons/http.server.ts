import { brand } from "../brand";
import type { Hono } from "hono";
import{registerPlayerModules}from"../player/modules.server.ts";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileResponse } from "../server/resources.ts";
import { findPilot, engineHash } from "./pilots.server.ts";
import { validPath } from "../../public/ons/protocol.mjs";

// Resource names are distinct from writable save names. Only listed audio gets
// the two legacy filename exceptions; traversal and executable rules stay intact.
function resourcePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (path.includes("#") && !/\.(?:ogg|mp3|wav)$/i.test(path)) return false;
  return validPath(path.replaceAll("#", "a").replace(/(^|\/)\.([^/.]+\.ogg)$/i, "$1$2"));
}
export function registerOnsPilot(app: Hono, root: string) {
  registerOnsModules(app);
  const cached = new Map<string, { doc: object; files: Set<string> }>();
  const engines = new Map<string, Buffer>();
  function manifest(id: string) {
    const pilot = findPilot(id);
    if (!pilot) throw Error("Unknown pilot");
    let found = cached.get(id);
    if (found) return found;
    const raw = readFileSync(resolve(root, pilot.directory, "onsyuri_index.json"));
    if (raw.length > 4 * 1024 * 1024) throw Error("Manifest too large");
    const data = JSON.parse(raw.toString("utf8"));
    if (!Array.isArray(data.files) || data.files.length > 60000 || !Array.isArray(data.args) || data.args.length !== 0) throw Error("Invalid manifest");
    const paths = new Set<string>();
    const files = data.files.filter((f: { path?: string }) => typeof f?.path !== "string" || !/^(?:[^./][^/]*\/)*\.nomedia$/.test(f.path)).map((f: { path: string; url?: string; lazyload?: boolean }) => {
      if (!resourcePath(f?.path) || paths.has(f.path) || (f.url && f.url !== f.path && f.url !== "./" + f.path) || (f.lazyload !== undefined && typeof f.lazyload !== "boolean")) throw Error("Unsafe manifest entry");
      paths.add(f.path);
      return { path: f.path, lazyload: f.lazyload ?? true, url: `/__ons/data/${id}/` + f.path.split("/").map(encodeURIComponent).join("/") };
    });
    found = { files: paths, doc: { pilot: id, title: pilot.title, versionId: pilot.versionId, engine: engineHash, gamedir: "/game", savedir: "/save", args: [], files } };
    cached.set(id, found);
    return found;
  }
  app.use("/api/*", async (c, next) => {
    if (c.req.header("origin") === "null" || c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "来源无效" }, 403);
    return next();
  });
  app.use("/__ons/*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    if (!c.req.path.startsWith("/__ons/runtime/")) {
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Cross-Origin-Resource-Policy", "cross-origin");
    }
  });
  app.get("/__ons/runtime/:id", c => {
    if (!findPilot(c.req.param("id"))) return c.notFound();
    const origin = new URL(c.req.url).origin;
    c.header("Content-Security-Policy", `sandbox allow-scripts; default-src 'none'; script-src ${origin}/ons/ ${origin}/player/registry.mjs ${origin}/player/emscripten.mjs ${origin}/__ons/engine/ 'wasm-unsafe-eval'; connect-src ${origin}/__ons/; style-src 'unsafe-inline'; img-src ${origin}/__ons/data/ data: blob:; media-src ${origin}/__ons/data/ blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
    c.header("Cache-Control", "no-store");
    return c.html(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${brand.shortName} ONS 运行区</title><style>html,body{margin:0;width:100%;height:100%;background:#08090b;overflow:hidden}canvas{display:block;margin:auto;max-width:100%;max-height:100%;outline:none}#status{position:absolute;bottom:8px;left:12px;color:#ddd;font:13px sans-serif;pointer-events:none}</style><canvas id="canvas" tabindex="0"></canvas><p id="status">等待播放器连接…</p><script src="/ons/runtime.js" defer></script></html>`);
  });
  app.get("/__ons/manifest/:id", c => {
    if (!findPilot(c.req.param("id"))) return c.notFound();
    try { return c.json(manifest(c.req.param("id")).doc); } catch { return c.json({ error: "试点资源配置校验失败" }, 503); }
  });
  app.on(["GET", "HEAD"], "/__ons/data/:id/*", c => {
    const pilot = findPilot(c.req.param("id"));
    if (!pilot) return c.notFound();
    try {
      const prefix = `/__ons/data/${pilot.id}/`;
      const path = decodeURIComponent(new URL(c.req.url).pathname.slice(prefix.length));
      if (!manifest(pilot.id).files.has(path) || !resourcePath(path)) return c.notFound();
      return fileResponse(c.req.raw, resolve(root, pilot.directory), "/" + path.split("/").map(encodeURIComponent).join("/"), undefined, true);
    } catch { return c.notFound(); }
  });
  app.on(["GET", "HEAD"], "/__ons/engine/:hash/:file", c => {
    const file = c.req.param("file");
    const expected: Record<string, string> = { "onsyuri.js": "334ee32249dce6c8d6cdf7e0c6b68e704129c58efa949336c8fad14742a882c1", "onsyuri.wasm": engineHash };
    if (c.req.param("hash") !== engineHash || !Object.hasOwn(expected, file)) return c.notFound();
    try {
      let bytes = engines.get(file);
      if (!bytes) {
        bytes = readFileSync(resolve(root, "clannad", file));
        if (createHash("sha256").update(bytes).digest("hex") !== expected[file]) throw Error("Engine hash differs");
        engines.set(file, bytes);
      }
      return new Response(c.req.method === "HEAD" ? null : new Uint8Array(bytes), { headers: { "content-type": file.endsWith("wasm") ? "application/wasm" : "text/javascript; charset=utf-8", "content-length": String(bytes.length), "cache-control": "public, max-age=31536000, immutable" } });
    } catch { return c.json({ error: "共享引擎校验失败" }, 503); }
  });
}
export function registerOnsModules(app: Hono) {
  registerPlayerModules(app);
  const staticRoot = resolve(existsSync("build/client/ons") ? "build/client/ons" : "public/ons");
  app.on(["GET", "HEAD"], "/ons/:file", async c => {
    if (!["runtime.js", "storage.mjs", "protocol.mjs", "cloud.mjs", "registry.mjs", "loading.mjs", "resource-loading.mjs"].includes(c.req.param("file"))) return c.notFound();
    const response = await fileResponse(c.req.raw, staticRoot, "/" + c.req.param("file"));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    return response;
  });
}
