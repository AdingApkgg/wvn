import {CasManifestService,createCasManifestApp,RENPY_RELEASE} from './src/player/cas-manifest.server.ts';
import { mountPublicPlatform } from './src/platform/public.server.ts';
import { mountAccountRooms } from './src/platform/rooms.server.ts';
import {registerDirectB2Resources} from './src/player/b2.server.ts';
import {configuredCloudRuntime} from './src/engines/cloud-runtime.ts';
import {configuredCandidate} from './src/engines/candidate.ts';
import {registerEngineArtifacts} from './src/engines/artifacts.ts';
import { serve } from "@hono/node-server";
import { createServer, Server as HttpsServer } from "node:https";
import { createShareAdminApp } from "./src/accounts/share-admin.server.ts";
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {configurePublicProjection}from"./src/accounts/public-projection.server.ts";
import { catalogProvider } from "./src/accounts/catalog-policy.server.ts";
import { createAccountService } from "./src/accounts/service.server.ts";
import { fileResponse } from "./src/server/resources.ts";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { trustedOnsPaths } from './src/ons/pilots.server.ts';
import {getStore} from './src/server/runtime.ts';
import {registerTrustedCatalog} from './src/player/catalog.server.ts';
import {registerOtherPlayers,isPlayerResourcePath} from './src/player/http.server.ts';
import { registerOnsPilot, registerOnsModules } from './src/ons/http.server.ts';
import { registerRemotePlayerResources,previewResourceProjections } from './src/player/remote.server.ts';
import { isIP } from 'node:net';
import { RemoteBlobStore } from './src/accounts/blob-remote.server.ts';
import {configureResourceTimeout} from './src/server/resource-timeout.ts';
import type {IncomingMessage,ServerResponse} from 'node:http';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
const origin = required("WG_ACCOUNT_ORIGIN");
const engineCandidate=configuredCandidate(),engineRuntime=configuredCloudRuntime();
if(engineCandidate&&engineRuntime)throw Error("Select one engine preview policy");
const service = await createAccountService({
  origin,
  engineCloud:engineRuntime?.bindings.map(b=>({versionId:b.versionId,releaseId:engineRuntime.release.id})),
  isolated:process.env.WG_ALL_ENGINES==='1',
  deployment:process.env.WG_DEPLOYMENT_MODE === "production"?"production":"preview",
  publicResourcePreflight:process.env.WG_ALL_ENGINES==='1'?isPlayerResourcePath:undefined,
  cookiePrefix: process.env.WG_ACCOUNT_COOKIE_PREFIX,
  analytics:process.env.WG_UMAMI_WEBSITE_ID||process.env.WG_UMAMI_INTERNAL_URL?{websiteId:required('WG_UMAMI_WEBSITE_ID'),internalUrl:required('WG_UMAMI_INTERNAL_URL')}:undefined,
  revision: process.env.WG_ACCOUNT_REVISION,
  shareLedger: process.env.WG_ACCOUNT_SHARE_LEDGER,
  catalogOrigin: process.env.WG_ACCOUNT_CATALOG_ORIGIN,
  catalogProvider:process.env.WG_ACCOUNT_CATALOG_ORIGIN?catalogProvider(process.env.WG_ACCOUNT_CATALOG_ORIGIN):async()=>(await getStore().list()).filter(w=>w.versions.length).map(w=>({id:w.id,title:w.title,url:w.url,versions:w.versions.map(v=>({id:v.id,title:v.title,number:v.number,engine:v.engine,url:v.url}))})),
  database: process.env.WG_ACCOUNT_DATABASE_URL ?? required("WG_ACCOUNT_DATABASE"),
  databaseSchema: process.env.WG_ACCOUNT_DATABASE_SCHEMA,
  deletionLedger: required("WG_ACCOUNT_DELETION_LEDGER"),
  blobRoot: required("WG_ACCOUNT_BLOBS"),
  blobBackend: process.env.WG_BLOB_UPSTREAM ? new RemoteBlobStore(process.env.WG_BLOB_UPSTREAM, readFileSync(required("WG_BLOB_TOKEN_FILE"), "utf8").trim()) : undefined,
  secret: readFileSync(required("WG_ACCOUNT_SECRET_FILE"), "utf8").trim(),
});
const platform = await mountPublicPlatform(service.app, getStore());
const rooms = await mountAccountRooms(service, getStore());
if(service.sharing&&process.env.WG_ALL_ENGINES==='1')configurePublicProjection(origin,service.app.fetch);
const moderation = service.sharing
  ? createShareAdminApp(service, required("WG_SHARE_ADMIN_ORIGIN"))
  : null;
if (moderation)
  writeFileSync(required("WG_SHARE_ADMIN_TOKEN_FILE"), moderation.token, {
    mode: 0o600,
  });
if(engineRuntime&&!process.env.WG_B2_CONTROL_FILE)registerEngineArtifacts(service.app,{root:required("WG_ENGINE_ARTIFACT_ROOT"),releases:[engineRuntime.release]});
if(engineCandidate&&!process.env.WG_B2_CONTROL_FILE)registerEngineArtifacts(service.app,{root:required("WG_ENGINE_ARTIFACT_ROOT"),releases:[engineCandidate.release]});
if (process.env.WG_ACCOUNT_UI === "1") {
  const buildPath = "./build/server/index.js";
  const handler = createRequestHandler(await import(buildPath), "production");
  service.app.get("/assets/*", (c) =>
    fileResponse(c.req.raw, resolve("build/client"), c.req.path),
  );
  service.app.get("/account", (c) =>
    handler(c.req.raw, new RouterContextProvider()),
  );
  service.app.get("/account.data", (c) =>
    handler(c.req.raw, new RouterContextProvider()),
  );
  service.app.get("/account/*", (c) =>
    handler(c.req.raw, new RouterContextProvider()),
  );
  service.app.get("/s/:shareId", (c) =>
    handler(c.req.raw, new RouterContextProvider()),
  );
  if(process.env.WG_ONS_CLOUD==='1'){
    if(process.env.WG_ONS_PILOT!=='1')throw new Error('Cloud player requires the sandbox pilot');
    if(process.env.WG_B2_CONTROL_FILE){
      registerOnsModules(service.app);
      const document=JSON.parse(readFileSync(process.env.WG_B2_CONTROL_FILE,'utf8'));
      service.app.route('/',createCasManifestApp(new CasManifestService(platform.versions,platform.repository,{document,namespace:'b2/web-visual-novel/snapshot-20261028',inventorySha256:'fbdfcc49da7b16325482f82657cf7720454c43a03e67fed462386ba824daca01',engineReleaseId:RENPY_RELEASE})));
      registerDirectB2Resources(service.app,{document,origin,engineReleaseId:engineRuntime?.release.id??engineCandidate?.release.id,cas:true});
    } else if (process.env.WG_RESOURCE_UPSTREAM) {
      registerOnsModules(service.app);
      registerRemotePlayerResources(service.app, { upstream: process.env.WG_RESOURCE_UPSTREAM,projections:process.env.WG_PREVIEW_RESOURCE_PROJECTIONS?previewResourceProjections(JSON.parse(readFileSync(process.env.WG_PREVIEW_RESOURCE_PROJECTIONS,'utf8')),process.env.WG_DEPLOYMENT_MODE??'preview'):undefined });
    } else {
      registerOnsPilot(service.app,required('WG_RESOURCE_ROOT'));
      if(process.env.WG_ALL_ENGINES==='1')registerOtherPlayers(service.app,required('WG_RESOURCE_ROOT'));
    }
    service.app.get('/__manifest',c=>handler(c.req.raw,new RouterContextProvider()));
    // This credentialed listener never mounts the legacy static-game server.
    // Only the audited sandbox versions and their trusted work pages are allowed.
    for(const path of trustedOnsPaths())service.app.get(path,c=>handler(c.req.raw,new RouterContextProvider()));
    service.app.get('/media/*',c=>fileResponse(c.req.raw,required('WG_MEDIA_ROOT'),c.req.path.replace(/^\/media/,'')));
  }
  if (moderation) {
    moderation.app.get("/assets/*", (c) =>
      fileResponse(c.req.raw, resolve("build/client"), c.req.path),
    );
    moderation.app.get("/share-admin", (c) =>
      handler(c.req.raw, new RouterContextProvider()),
    );
  }
  if(process.env.WG_ALL_ENGINES==='1'){
    registerTrustedCatalog(service.app,getStore(),req=>handler(req,new RouterContextProvider()));
  }else service.app.get("/", (c) => c.redirect("/account"));
}
const port = Number(process.env.WG_ACCOUNT_PORT ?? 8383);
const bind = process.env.WG_ACCOUNT_BIND ?? '127.0.0.1';
const octets = bind.split('.').map(Number);
if (bind !== '127.0.0.1' && !(isIP(bind) === 4 && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127))
  throw new Error('Account bind must be loopback or an explicit Tailscale IPv4 address');
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid account port");
const server = serve(
  {
    fetch: service.app.fetch,
    hostname: bind,
    port,
    createServer,
    serverOptions: {
      key: readFileSync(required("WG_ACCOUNT_TLS_KEY")),
      cert: readFileSync(required("WG_ACCOUNT_TLS_CERT")),
    },
  },
  () => console.log(`WG accounts: ${origin} (${bind})`),
);
if (rooms) {
  if (!(server instanceof HttpsServer)) throw new Error('Rooms require the configured HTTPS server');
  rooms.attachWebSocket(server);
}
if ("requestTimeout" in server) server.requestTimeout = 300_000;
if ("headersTimeout" in server) server.headersTimeout = 10_000;
server.setTimeout(15_000);
server.prependListener('request',(request:IncomingMessage,response:ServerResponse)=>configureResourceTimeout(request,response));
const adminServer = moderation
  ? serve({
      fetch: moderation.app.fetch,
      hostname: "127.0.0.1",
      port: Number(required("WG_SHARE_ADMIN_PORT")),
      createServer,
      serverOptions: {
        key: readFileSync(required("WG_ACCOUNT_TLS_KEY")),
        cert: readFileSync(required("WG_ACCOUNT_TLS_CERT")),
      },
    })
  : null;
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  await rooms?.close();
  await Promise.all([server, ...(adminServer ? [adminServer] : [])].map(listener => new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))));
  await platform.close(); await service.close(); await getStore().close();
}
process.once("SIGTERM", () => { stop().catch(() => { process.exitCode = 1; }); });
process.once("SIGINT", () => { stop().catch(() => { process.exitCode = 1; }); });
