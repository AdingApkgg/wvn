import { serve } from "@hono/node-server";
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectCatalog } from "./src/accounts/catalog.server.ts";
import { createAccountService } from "./src/accounts/service.server.ts";
import { fileResponse } from "./src/server/resources.ts";
import { createRequestHandler, RouterContextProvider } from "react-router";
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
const origin = required("WG_ACCOUNT_ORIGIN");
const service = await createAccountService({
  origin,
  revision: process.env.WG_ACCOUNT_REVISION,
  database: required("WG_ACCOUNT_DATABASE"),
  deletionLedger: required("WG_ACCOUNT_DELETION_LEDGER"),
  blobRoot: required("WG_ACCOUNT_BLOBS"),
  catalog: projectCatalog(
    JSON.parse(readFileSync("data/catalog.json", "utf8")),
  ),
  secret: readFileSync(required("WG_ACCOUNT_SECRET_FILE"), "utf8").trim(),
  signupInvite: readFileSync(required("WG_ACCOUNT_INVITE_FILE"), "utf8").trim(),
});
if (process.env.WG_ACCOUNT_UI === "1") {
  const buildPath = "./build/server/index.js";
  const handler = createRequestHandler(await import(buildPath), "production");
  service.app.get("/assets/*", (c) =>
    fileResponse(c.req.raw, resolve("build/client"), c.req.path),
  );
  service.app.get("/account", (c) =>
    handler(c.req.raw, new RouterContextProvider()),
  );
  service.app.get("/account/*", (c) =>
    handler(c.req.raw, new RouterContextProvider()),
  );
  service.app.get("/", (c) => c.redirect("/account"));
}
const port = Number(process.env.WG_ACCOUNT_PORT ?? 8383);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid account port");
const server = serve(
  {
    fetch: service.app.fetch,
    hostname: "127.0.0.1",
    port,
    createServer,
    serverOptions: {
      key: readFileSync(required("WG_ACCOUNT_TLS_KEY")),
      cert: readFileSync(required("WG_ACCOUNT_TLS_CERT")),
    },
  },
  () => console.log(`WG accounts preview: ${origin} (loopback only)`),
);
if ("requestTimeout" in server) server.requestTimeout = 300_000;
if ("headersTimeout" in server) server.headersTimeout = 10_000;
server.setTimeout(15_000);
process.on("SIGTERM", () =>
  server.close(() => {
    service.close();
    process.exit(0);
  }),
);
