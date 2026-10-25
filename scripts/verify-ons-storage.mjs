// Run with the browser suite on the remote host, never with a player's profile.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const origin = process.env.WG_ONS_TEST_URL || "http://127.0.0.1:18481";
const browser = await chromium.launch({ executablePath: process.env.WG_CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"] });
const results = [];
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin + "/4/1/");
  results.push(await page.evaluate(async () => {
    const { openSaveStore, readLegacy, exportBackup, importBackup } = await import("/ons/storage.mjs");
    const check = (v, why) => { if (!v) throw new Error(why); };
    const old = await new Promise((resolve, reject) => {
      const r = indexedDB.open("/onsyuri_save/clannad", 21);
      r.onupgradeneeded = () => { r.result.createObjectStore("FILE_DATA"); };
      r.onerror = () => reject(r.error); r.onsuccess = () => resolve(r.result);
    });
    const original = new Uint8Array([0, 255, 4, 97]);
    await new Promise((resolve, reject) => {
      const t = old.transaction("FILE_DATA", "readwrite");
      t.objectStore("FILE_DATA").put({ timestamp: new Date(1609459200000), mode: 33206, contents: original }, "/onsyuri_save/clannad/save1.dat");
      t.oncomplete = resolve; t.onabort = () => reject(t.error);
    });
    old.close();
    const store = await openSaveStore();
    const legacy = await readLegacy("clannad");
    check(legacy.files.length === 1 && legacy.files[0].data[1] === 255, "legacy bytes");
    check(legacy.files[0].mtime === 1609459200000, "legacy modification time");
    const migrated = await store.commit("clannad", 0, legacy, "legacy-import");
    const archive = await exportBackup(migrated.snapshot);
    const imported = await importBackup(archive, "clannad");
    check(imported.files[0].data[3] === 97, "portable backup bytes");
    check(imported.files[0].mtime === 1609459200000, "portable modification time");
    const changedDate = JSON.parse(archive); changedDate.files[0].mtime += 1000;
    let dateDenied = false; try { await importBackup(JSON.stringify(changedDate), "clannad"); } catch { dateDenied = true; }
    check(dateDenied, "modification time integrity");
    let denied = false;
    try { await importBackup(archive, "saya"); } catch { denied = true; }
    check(denied, "cross-game import must fail");
    const changed = { schema: 1, pilot: "clannad", files: [{ path: "save1.dat", data: new Uint8Array([9, 8, 7]) }] };
    await store.commit("clannad", migrated.revision, changed, "engine");
    denied = false;
    try { await store.commit("clannad", migrated.revision, legacy, "engine"); } catch { denied = true; }
    check(denied, "stale tab cannot overwrite newer save");
    const history = await store.history("clannad");
    check(history.length === 2, "append-only history");
    const first = await store.getRevision(history.find(x => x.reason === "legacy-import").id, "clannad");
    check(first.snapshot.files[0].data[1] === 255, "migration backup retained");
    const saya = { schema: 1, pilot: "saya", files: [{ path: "save1.dat", data: new Uint8Array([88]) }] };
    await store.commit("saya", 0, saya, "engine");
    check((await store.get("clannad")).snapshot.files[0].data[0] === 9, "game namespace");
    check((await store.get("saya")).snapshot.files[0].data[0] === 88, "saya namespace");
    denied = false;
    try { await store.getRevision(first.id, "saya"); } catch { denied = true; }
    check(denied, "cross-game history rejected");
    const after = await readLegacy("clannad");
    check(after.files[0].data.every((v, i) => v === original[i]), "old IDBFS must remain unchanged");
    check(after.files[0].mtime === 1609459200000, "old IDBFS dates remain unchanged");
    const tampered = JSON.parse(archive); tampered.files[0].data = "AAAAAA==";
    denied = false;
    try { await importBackup(JSON.stringify(tampered), "clannad"); } catch { denied = true; }
    check(denied, "backup integrity");
    const large = { schema: 1, pilot: "clannad", files: [{ path: "save-big.dat", data: new Uint8Array(6 * 1024 * 1024).fill(42) }] };
    const largeArchive = await exportBackup(large);
    const largeRestored = await importBackup(largeArchive, "clannad");
    check(largeRestored.files[0].data.length === 6291456 && largeRestored.files[0].data[6291455] === 42, "6 MiB backup round-trip");
    store.close();
    return { case: "legacy-migration-cas-history-scope-integrity", passed: true };
  }));
  await page.reload();
  assert.equal(await page.evaluate(async () => { const s = await (await import("/ons/storage.mjs")).openSaveStore(); const h = await s.get("clannad"); s.close(); return h.snapshot.files[0].data[0]; }), 9);
  results.push({ case: "reload-persistence", passed: true });
  await context.close();
  mkdirSync("reports/ons-pilot", { recursive: true });
  writeFileSync("reports/ons-pilot/storage.json", JSON.stringify({ status: "passed", results }, null, 2));
  console.log(JSON.stringify({ status: "passed", results }));
} finally { await browser.close(); }
