import { serve } from "@hono/node-server";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { getStore } from "./src/server/runtime.ts";
import { createPublicApp, createAdminApp } from "./src/server/http.ts";
import { Auth } from "./src/server/auth.ts";
import { fileResponse } from "./src/server/resources.ts";
const store = getStore();
const auth = new Auth();
const stateDir = resolve(process.env.WG_STATE_DIR ?? "state");
mkdirSync(stateDir, { recursive: true });
writeFileSync(resolve(stateDir, "admin-token"), auth.token, { mode: 0o600 });
const root = resolve(process.env.WG_RESOURCE_ROOT ?? "fixtures/resources");
const pub = createPublicApp(
  store,
  root,
  resolve(process.env.WG_MEDIA_ROOT ?? "media"),
);
const admin = createAdminApp(
  store,
  auth,
  JSON.parse(readFileSync("data/sources.json", "utf8")),
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
serve({ fetch: pub.fetch, hostname: host, port }, () =>
  console.log(
    `WG preview: http://${host}:${port}; private admin: 127.0.0.1:${adminPort}`,
  ),
);
serve({ fetch: admin.fetch, hostname: "127.0.0.1", port: adminPort });
