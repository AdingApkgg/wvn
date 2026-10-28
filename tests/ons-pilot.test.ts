import { testStore } from "./helpers/catalog.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { validateSnapshot, snapshotDigest } from "../public/ons/protocol.mjs";
import { registerOnsPilot } from "../src/ons/http.server.ts";
import { pilots } from "../src/ons/pilots.server.ts";
import { Store } from "../src/server/store.ts";
import { createPublicApp } from "../src/server/http.ts";

const bytes = new Uint8Array([0, 255, 17]);
const snapshot = () => ({ schema: 1, pilot: "clannad", files: [{ path: "save1.dat", data: bytes }] });
(test("snapshot scope, path and quota checks reject cross-game and executable/traversal input", () => {
  assert.deepEqual(validateSnapshot(snapshot(), "clannad").files[0].data, bytes);
  assert.throws(() => validateSnapshot(snapshot(), "saya"));
  for (const path of ["../save1.dat", "/save1.dat", "x/../../save1.dat", "x\\save.dat", "x%2f.dat", "x.js", ".secret", "x//save.dat"]) {
    assert.throws(() => validateSnapshot({ ...snapshot(), files: [{ path, data: bytes }] }, "clannad"), path);
  }
  assert.throws(() => validateSnapshot({ ...snapshot(), files: [snapshot().files[0], snapshot().files[0]] }, "clannad"));
  assert.throws(() => validateSnapshot({ ...snapshot(), files: [{ path: "save.dat", data: new Uint8Array(32 * 1024 * 1024 + 1) }] }, "clannad"));
  assert.throws(() => validateSnapshot({ ...snapshot(), files: [{ path: "save.dat", data: {} }] }, "clannad"));
}));
(test("snapshot digest detects changed bytes and names independent of enumeration order", async () => {
  const original = await snapshotDigest(snapshot());
  assert.notEqual(original, await snapshotDigest({ ...snapshot(), files: [{ path: "save1.dat", data: new Uint8Array([1, 255, 17]) }] }));
  assert.notEqual(original, await snapshotDigest({ ...snapshot(), files: [{ path: "save2.dat", data: bytes }] }));
  const files = [...snapshot().files, { path: "envdata", data: new Uint8Array([2]) }];
  assert.equal(await snapshotDigest({ ...snapshot(), files }), await snapshotDigest({ ...snapshot(), files: files.toReversed() }));
}));
(test("save modification times survive validation and are covered by the portable digest", async () => {
  const file = { ...snapshot().files[0], mtime: 1609459200000 };
  const value = { ...snapshot(), files: [file] };
  assert.equal(validateSnapshot(value, "clannad").files[0].mtime, file.mtime);
  assert.notEqual(await snapshotDigest(value), await snapshotDigest({ ...value, files: [{ ...file, mtime: file.mtime + 1000 }] }));
  for (const mtime of [-1, NaN, Infinity, "2021-01-01", 0.5, 8640000000000001]) {
    assert.throws(() => validateSnapshot({ ...value, files: [{ ...file, mtime }] }, "clannad"));
  }
}));
(test("runtime and projected data stay bounded and sandboxed even on direct navigation", async () => {
  const root = mkdtempSync(join(tmpdir(), "wg-ons-"));
  try {
    mkdirSync(join(root, "clannad"));
    writeFileSync(join(root, "clannad", "onsyuri_index.json"), JSON.stringify({ title: "CLANNAD", savedir: "/onsyuri_save/clannad", gamedir: "/onsyuri/clannad", args: [], lazyload: true, files: [{ path: "nscript.dat", lazyload: false }, { path: "unlisted.png" }] }));
    writeFileSync(join(root, "clannad", "nscript.dat"), "script-data");
    writeFileSync(join(root, "clannad", "private.dat"), "not-in-manifest");
    const app = new Hono();
    registerOnsPilot(app, root);
    const runtime = await app.request("http://localhost/__ons/runtime/clannad");
    assert.equal(runtime.status, 200);
    assert.match(runtime.headers.get("content-security-policy")!, /sandbox allow-scripts/);
    assert.doesNotMatch(runtime.headers.get("content-security-policy")!, /allow-same-origin/);
    assert.match(runtime.headers.get("content-security-policy")!, /frame-ancestors 'self'/);
    assert.equal(runtime.headers.get("cache-control"), "no-store");
    assert.match(runtime.headers.get("content-security-policy")!,/http:\/\/localhost\/player\/registry\.mjs/);
    assert.equal((await app.request("http://localhost/player/registry.mjs")).status,200);
    assert.equal((await app.request("http://localhost/player/adapters.mjs")).status,200);
    assert.equal((await app.request("http://localhost/player/native-input.mjs")).status,200);
    assert.equal((await app.request("http://localhost/player/native-input.d.mts")).status,404);
    const bridge = await app.request("http://localhost/ons/runtime.js");
    assert.equal(bridge.status, 200);
    assert.equal(bridge.headers.get("cross-origin-resource-policy"), "cross-origin");
    assert.equal(bridge.headers.get("access-control-allow-origin"), "*");
    const manifest = await app.request("http://localhost/__ons/manifest/clannad");
    assert.equal(manifest.headers.get("access-control-allow-origin"), "*");
    assert.equal(manifest.headers.get("access-control-allow-credentials"), null);
    const data = await manifest.json();
    assert.equal(data.pilot, "clannad");
    assert.equal(data.files[0].url, "/__ons/data/clannad/nscript.dat");
    assert.equal(data.savedir, "/save");
    assert.equal((await app.request("http://localhost/__ons/data/clannad/nscript.dat")).status, 200);
    for (const url of ["/__ons/data/clannad/private.dat", "/__ons/data/clannad/index.html", "/__ons/data/clannad/onsyuri.js", "/__ons/data/clannad/%252e%252e/private.dat", "/__ons/runtime/unknown"]) {
      assert.equal((await app.request("http://localhost" + url)).status, 404, url);
    }
    assert.equal(pilots.length, 26);
    assert.equal(pilots[0].engine, pilots[1].engine);
  } finally { rmSync(root, { recursive: true, force: true }); }
}));
(test("encoded legacy entry paths cannot bypass the pilot execution boundary", async () => {
  const root = mkdtempSync(join(tmpdir(), "wg-ons-encoded-")), store = await testStore();
  const before = process.env.WG_ONS_PILOT;
  try {
    process.env.WG_ONS_PILOT = "1";
    mkdirSync(join(root, "clannad"));
    writeFileSync(join(root, "clannad", "index.html"), "UNTRUSTED-LEGACY-HTML");
    writeFileSync(join(root, "clannad", "onsyuri.js"), "UNTRUSTED-LEGACY-JS");
    (await store.seed({ snapshotAt: "2026-10-19T00:00:00Z", works: [{ id: "v4", title: "CLANNAD", originalTitle: "CLANNAD", aliases: [], evidence: "https://vndb.org/v4" }], versions: [{ id: pilots[0].versionId, workId: "v4", number: 1, title: "CLANNAD", legacyPath: "/clannad/", engine: "ONS" }] }));
    const app = createPublicApp(store, root);
    for (const path of ["/clannad/index%2ehtml", "/clannad%2Findex.html", "/clannad/onsyuri%2ejs", "/clannad%2Fonsyuri.js", "/clannad/index.html.", "/clannad/index.html%20"]) {
      const response = await app.request("http://localhost" + path);
      assert.ok([302, 404].includes(response.status), path + ": " + response.status);
      assert.doesNotMatch(await response.text(), /UNTRUSTED-LEGACY/);
    }
    for (const path of ["/api/catalog", "/api/me/library"]) assert.equal((await app.request("http://localhost" + path, { headers: { Origin: "null", "Sec-Fetch-Site": "cross-site" } })).status, 403);
  } finally { if (before === undefined) delete process.env.WG_ONS_PILOT; else process.env.WG_ONS_PILOT = before; (await store.close()); rmSync(root, { recursive: true, force: true }); }
}));
(test("manifest does not grant arbitrary remote URLs or executable files", async () => {
  const root = mkdtempSync(join(tmpdir(), "wg-ons-bad-"));
  try {
    mkdirSync(join(root, "clannad"));
    const file = join(root, "clannad", "onsyuri_index.json");
    for (const files of [[{ path: "0.txt", url: "https://evil.invalid/0.txt" }], [{ path: "inject.js" }], [{ path: "../other/secret" }]]) {
      writeFileSync(file, JSON.stringify({ files, args: [] }));
      const app = new Hono(); registerOnsPilot(app, root);
      assert.equal((await app.request("http://localhost/__ons/manifest/clannad")).status, 503);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
}));

// Expansion coverage is derived independently from the catalog, not the registry.
(test("every catalog ONS version has a stable distinct namespace and canonical route", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
  const versions = catalog.versions.filter((v: { engine: string }) => v.engine === "ONS");
  assert.equal(versions.length, 26);
  assert.equal(new Set(pilots.map(p => p.id)).size, 26);
  for (const v of versions) {
    const p = pilots.find(p => p.versionId === v.id);
    assert.ok(p, v.id); assert.equal(p.workId, v.workId); assert.equal(p.slot, v.number);
    assert.equal(p.route, `/${v.workId.slice(1)}/${v.number}/`);
    assert.equal(p.directory, decodeURIComponent(v.legacyPath).replace(/^\/+|\/+$/g, ""));
    assert.equal(validateSnapshot({ schema: 1, pilot: p.id, files: [] }, p.id).pilot, p.id);
    assert.throws(() => validateSnapshot({ schema: 1, pilot: p.id, files: [] }, "unknown"));
    assert.throws(() => validateSnapshot({ schema: 1, pilot: p.id, files: [] }, pilots.find(q => q.id !== p.id)!.id));
  }
  assert.equal(pilots[0].id, "clannad"); assert.equal(pilots[1].id, "saya");
  const siblings = pilots.filter(p => p.workId === "v14365");
  assert.equal(siblings.length, 3); assert.equal(new Set(siblings.map(p => p.legacySave)).size, 1);
  const { trustedOnsPaths } = await import("../src/ons/pilots.server.ts");
  const paths = trustedOnsPaths();
  for (const p of pilots) for (const suffix of ["", "/", ".data", "/_.data"]) assert(paths.includes(p.route.slice(0,-1) + suffix), p.route.slice(0,-1) + suffix);
  assert(paths.includes("/14365/3/")); assert(!paths.includes("/14365/4/")); assert(!paths.includes("/27448/1/"));
}));
(test("projected game audio permits encoded hash names and listed hidden OGG, without weakening saves or hidden-file denial", async () => {
  const root=mkdtempSync(join(tmpdir(),'wg-ons-media-'));
  try{
    mkdirSync(join(root,'clannad','sound'),{recursive:true});mkdirSync(join(root,'clannad','se'),{recursive:true});
    writeFileSync(join(root,'clannad','sound','.se002.ogg'),'hidden-audio');writeFileSync(join(root,'clannad','se','#basket01.ogg'),'hash-audio');
    writeFileSync(join(root,'clannad','sound','.env'),'private');writeFileSync(join(root,'clannad','sound','.unlisted.ogg'),'unlisted');
    writeFileSync(join(root,'clannad','onsyuri_index.json'),JSON.stringify({args:[],files:[{path:'sound/.se002.ogg'},{path:'se/#basket01.ogg'},{path:'sound/.nomedia'}]}));
    const app=new Hono();registerOnsPilot(app,root);
    const response=await app.request('http://localhost/__ons/manifest/clannad');assert.equal(response.status,200);
    const m=await response.json();assert.equal(m.files.length,2);assert(m.files[1].url.endsWith('/se/%23basket01.ogg'));
    assert.equal(await(await app.request('http://localhost/__ons/data/clannad/sound/.se002.ogg')).text(),'hidden-audio');
    assert.equal(await(await app.request('http://localhost'+m.files[1].url)).text(),'hash-audio');
    for(const name of ['sound/.env','sound/.unlisted.ogg','sound/.nomedia','sound/.se002.ogg.','sound/.hidden/x.ogg'])assert.equal((await app.request('http://localhost/__ons/data/clannad/'+name)).status,404,name);
    for(const path of ['sound/.se002.ogg','se/#basket01.ogg'])assert.throws(()=>validateSnapshot({schema:1,pilot:'clannad',files:[{path,data:bytes}]},'clannad'));
  }finally{rmSync(root,{recursive:true,force:true})}
}));
