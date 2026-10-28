import { testStore } from "./helpers/catalog.ts";
import { postgresFixture } from "./helpers/postgres.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, Conflict } from "../src/server/store.ts";
const seed = {
  snapshotAt: "2026-10-19T00:00:00Z",
  works: [
    {
      id: "v4",
      title: "CLANNAD",
      originalTitle: "CLANNAD",
      aliases: [],
      evidence: "https://vndb.org/v4",
    },
    {
      id: "v27448",
      title: "ATRI",
      originalTitle: "ATRI",
      aliases: [],
      evidence: "https://vndb.org/v27448",
    },
  ],
  versions: [
    {
      id: "clannad-original",
      workId: "v4",
      number: 1,
      title: "原版",
      legacyPath: "/clannad/",
      engine: "ONS",
    },
  ],
};
async function fixture(fn: (a: Store, b: Store) => void | Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "wg-store-"));
  const a = await testStore();
  const b = new Store(a.database);
  try {
    (await a.seed(seed));
    await fn(a, b);
  } finally {
    (await a.close());
    (await b.close());
    rmSync(dir, { recursive: true, force: true });
  }
}
(test("seed is idempotent and allocation across handles never reuses tombstones", async () =>
  (await fixture(async (a, b) => {
    (await a.seed(seed));
    assert.equal((await a.list())[0].versions.length, 1);
    let v = (await a.addVersion("v4", {
      title: "修复",
      legacyPath: "/clannad-fixed/",
      engine: "ONS",
    }));
    assert.equal(v.number, 2);
    (await a.editVersion(v.id, v.revision, { status: "deleted" }));
    assert.equal(
      (await b.addVersion("v4", {
        title: "第三版",
        legacyPath: "/clannad-third/",
        engine: "ONS",
      })).number,
      3,
    );
    (await assert.rejects(async () =>
      (await a.addVersion("v4", {
        title: "duplicate",
        legacyPath: "/clannad/",
        engine: "ONS",
      })),
    ));
  }))));
(test("revision conflicts and invalid defaults cannot overwrite state", async () =>
  (await fixture(async (a) => {
    const w = (await a.get("v4"))!;
    (await a.editWork("v4", w.revision, { title: "团子" }));
    (await assert.rejects(
      async () => (await a.editWork("v4", w.revision, { title: "lost" })),
      Conflict,
    ));
    const v = (await a.addVersion("v27448", {
      title: "ATRI",
      legacyPath: "/atri/",
      engine: "Artemis",
    }));
    (await assert.rejects(async () =>
      (await a.editWork("v4", (await a.get("v4"))!.revision, { defaultVersionId: v.id })),
    ));
    assert.equal((await a.get("v4"))!.title, "团子");
    (await assert.rejects(async () =>
      (await a.editVersion("clannad-original", 1, { status: "hidden" })),
    ));
  }))));
(test("reassignment preserves legacy alias and old numeric route without reusing its slot", async () =>
  (await fixture(async (a) => {
    const v = (await a.reassignVersion("clannad-original", "v27448", 1));
    assert.equal(v.number, 1);
    assert.equal((await a.resolveLegacy("/clannad/"))?.workId, "v27448");
    assert.equal((await a.resolveRoute("4", "1"))?.id, v.id);
    assert.equal(
      (await a.addVersion("v4", { title: "new", legacyPath: "/new/", engine: "ONS" }))
        .number,
      2,
    );
  }))));
(test("public projection hides filesystem paths and stale reports cannot replace latest", async () =>
  (await fixture(async (a) => {
    (await a.importReport({
      versionId: "clannad-original",
      kind: "startup",
      runId: "new",
      startedAt: "2026-10-18T01:00:00Z",
      checkedAt: "2026-10-18T02:00:00Z",
      status: "passed",
      detail: "menu only",
    }));
    (await assert.rejects(async () =>
      (await a.importReport({
        versionId: "clannad-original",
        kind: "startup",
        runId: "old",
        startedAt: "2026-10-16T01:00:00Z",
        checkedAt: "2026-10-16T02:00:00Z",
        status: "passed",
        detail: "old",
      })),
    ));
    assert.equal((await a.get("v4"))!.versions[0].checks[0].runId, "new");
    assert.equal(JSON.stringify((await a.list())).includes("legacyPath"), false);
  }))));
(test("public reports never expose private details and hidden reassignment cannot become default", async () =>
  (await fixture(async (a) => {
    (await a.importReport({
      versionId: "clannad-original",
      kind: "startup",
      runId: "private",
      startedAt: "2026-10-18T00:00:00Z",
      checkedAt: "2026-10-18T01:00:00Z",
      status: "failed",
      detail: "H:\\private\\report.log confidential",
    }));
    assert.equal(JSON.stringify((await a.list())).includes("confidential"), false);
    assert.equal(
      (await a.list(true))[0].versions[0].checks[0].detail.includes("confidential"),
      true,
    );
    const v = (await a.addVersion("v4", {
      title: "hidden",
      legacyPath: "/hidden/",
      engine: "ONS",
    }));
    (await a.editVersion(v.id, v.revision, { status: "hidden" }));
    (await a.reassignVersion(v.id, "v27448", v.revision + 1));
    assert.equal((await a.get("v27448"))!.defaultVersionId, null);
  }))));
(test("simultaneous processes allocate distinct persistent slots", { timeout: 15000 }, async () => {
  const { spawn } = await import("node:child_process");
  const { writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "wg-concurrent-"));
  const pg = await postgresFixture();
  const file = pg.schema, barrier = join(dir, "go");
  const s = new Store(pg.db);
  (await s.seed(seed));
  function worker(label: string) {
    return new Promise<number>((resolve, reject) => {
      const p = spawn(
        process.execPath,
        ["--import", "tsx", "tests/allocate-worker.ts", file, barrier, label],
        { cwd: process.cwd() },
      );
      let out = "";
      p.stdout.on("data", (b) => (out += b));
      p.on("error", reject);
      p.on("exit", (code) =>
        code === 0
          ? resolve(Number(out.trim()))
          : reject(Error("worker failed " + code)),
      );
    });
  }
  try {
    const a = worker("a"),
      b = worker("b");
    writeFileSync(barrier, "go");
    assert.deepEqual((await Promise.all([a, b])).sort(), [2, 3]);
  } finally {
    await pg.close();
    rmSync(dir, { recursive: true, force: true });
  }
}));
