import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { getStore } from "./src/server/runtime.ts";
import { createPublicApp, createAdminApp } from "./src/server/http.ts";
import { Auth } from "./src/server/auth.ts";
import { fileResponse } from "./src/server/resources.ts";
import { mountPublicPlatform } from "./src/platform/public.server.ts";
import {createContentFetch} from './src/content/http.server.ts';
import {configureContentAccessProxy,contentGateEnabled} from './src/content/access.server.ts';
import {contentAccessProxy} from './src/content/access-proxy.server.ts';
const store = getStore();
await store.ready;
// 账号入口与公开入口分开部署时（平台QA、双栈预览）资格只能回源账号服务；
// 单 origin 生产不设它，仍旧走账号进程内的同进程读取器。
const accountOrigin = process.env.WG_ACCOUNT_ORIGIN?.trim() || '';
if (contentGateEnabled() && accountOrigin) {
  configureContentAccessProxy(contentAccessProxy(accountOrigin));
}
const auth = new Auth();
const stateDir = resolve(process.env.WG_STATE_DIR ?? "state");
mkdirSync(stateDir, { recursive: true });
writeFileSync(resolve(stateDir, "admin-token"), auth.token, { mode: 0o600 });
const root = resolve(process.env.WG_RESOURCE_ROOT ?? "fixtures/resources");
const publicApi = new Hono();
const platform = await mountPublicPlatform(publicApi, store);
const pub = createPublicApp(
  store,
  root,
  resolve(process.env.WG_MEDIA_ROOT ?? "media"),
  publicApi,
  accountOrigin || undefined,
);
const admin = createAdminApp(
  store,
  auth,
  JSON.parse(readFileSync(process.env.WG_INVENTORY_FILE ?? "data/sources.json", "utf8")),
);
// The framework build exports a standard Web Request handler; no extra app server/scheduler.
const buildPath = "./build/server/index.js";
const build = await import(buildPath);
const handler = createRequestHandler(
  build,
  process.env.NODE_ENV ?? "production",
);
for (const app of [pub, admin]) {
  app.get("/assets/*", (c) =>
    fileResponse(c.req.raw, resolve("build/client"), c.req.path),
  );
  app.all("*", (c) => handler(c.req.raw, new RouterContextProvider()));
}
const host = "127.0.0.1";
const port = Number(process.env.WG_PORT ?? 8281),
  adminPort = Number(process.env.WG_ADMIN_PORT ?? 8282);
const publicServer = serve({ fetch: createContentFetch(pub.fetch,store,{enabled:contentGateEnabled()}), hostname: host, port }, () =>
  console.log(
    `WG preview: http://${host}:${port}; private admin: 127.0.0.1:${adminPort}`,
  ),
);
const adminServer = serve({ fetch: admin.fetch, hostname: "127.0.0.1", port: adminPort });
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  await Promise.all([publicServer, adminServer].map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
  await platform.close(); await store.close();
}
process.once("SIGTERM", () => { stop().catch(() => { process.exitCode = 1; }); });
process.once("SIGINT", () => { stop().catch(() => { process.exitCode = 1; }); });
