import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { mountDashboard } from "../src/accounts/dashboard.server.ts";
import { InternalStatistics } from "../src/accounts/dashboard-statistics.server.ts";
import { AccountError } from "../src/accounts/errors.server.ts";
import type { Store } from "../src/server/store.ts";
import { shareHttpFixture } from "./helpers/share-http.ts";

test("internal aggregates respect Shanghai day boundaries, share expiry and deduplicated blob references", async () => {
  const f = await shareHttpFixture();
  try {
    const cookies = await Promise.all(
      ["private-owner", "private-reader", "private-third"].map((n) =>
        f.register(n),
      ),
    );
    const users = await Promise.all(
      cookies.map(
        async (cookie) => (await (await f.api("/api/me", cookie)).json()).user,
      ),
    );
    const db = f.service.db,
      now = Date.parse("2026-11-14T16:30:00Z"),
      start = Date.parse("2026-11-08T16:00:00Z");
    for (let i = 0; i < 3; i++)
      await db
        .prepare('UPDATE "user" SET "createdAt"=$1 WHERE id=$2')
        .run(new Date([start - 1, start, now - 1000][i]), users[i].id);
    await db
      .prepare("UPDATE wg_public_profiles SET published=true WHERE user_id=$1")
      .run(users[1].id);
    for (const id of [users[0].id, users[1].id])
      await db
        .prepare("INSERT INTO wg_admin_roles VALUES($1,true,1,$2,now())")
        .run(id, users[0].id);
    const owner = users[1].id;
    await db
      .prepare(
        "INSERT INTO wg_library VALUES($1,'v4','playing','private-note',1,NULL,$2)",
      )
      .run(owner, now);
    for (const [id, work, started, seconds, active, last] of [
      ["p1", "v4", start - 1, 3600, 0, start - 1],
      ["p2", "v4", start, 7200, 0, start + 100],
      ["p3", "v17", now - 100000, 60, 1, now - 1000],
    ] as const)
      await db
        .prepare(
          "INSERT INTO wg_plays(id,user_id,work_id,version_id,event_id,started_at,last_at,seconds,active) VALUES($1,$2,$3,$4,$1,$5,$6,$7,$8)",
        )
        .run(id, owner, work, "version-a", started, last, seconds, active);
    await db
      .prepare(
        "INSERT INTO wg_save_profiles VALUES('profile',$1,'version-a',1,'r2',0,$2)",
      )
      .run(owner, start);
    for (const id of ["r1", "r2"])
      await db
        .prepare(
          "INSERT INTO wg_save_revisions(id,owner,profile,parent,source,files,conflict,created) VALUES($1,$2,'profile',NULL,NULL,'[{\"name\":\"private-secret-file.sav\"}]',0,$3)",
        )
        .run(id, owner, start);
    for (const [hash, bytes] of [
      ["a".repeat(64), 100],
      ["b".repeat(64), 200],
    ] as const)
      await db
        .prepare("INSERT INTO wg_save_blobs VALUES($1,$2,$3,$4)")
        .run(owner, hash, bytes, start);
    for (const revision of ["r1", "r2"])
      await db
        .prepare("INSERT INTO wg_save_refs VALUES($1,$2,$3)")
        .run(owner, revision, "a".repeat(64));
    for (const [id, state, mode, expires, pending] of [
      ["s1", "active", "public", null, null],
      ["s2", "active", "public", now - 1, "private review"],
      ["s3", "pending", "public", null, "private review"],
      ["s4", "revoked", "public", null, "private review"],
      ["s5", "active", "link", null, null],
    ] as const)
      await db
        .prepare(`INSERT INTO wg_save_shares(id,owner,profile,generation,revision,version,work,mode,state,expires,files,approved,pending,metadata_revision,created,request_id,payload)
    VALUES($1,$2,'profile',1,'r1','version-a','v4',$3,$4,$5,'[]','{}',$6,1,$7,$1,'{}')`)
        .run(id, owner, mode, state, expires, pending, start);
    await db
      .prepare(
        "INSERT INTO wg_save_share_reports(id,reporter,share,reason,status,created) VALUES('report',$1,'s1','private complaint','open',$2)",
      )
      .run(owner, start);
    await db
      .prepare("INSERT INTO wg_work_counts VALUES('v4',7),('v17',3)")
      .run();
    await db
      .prepare(
        "INSERT INTO wg_content_eligibility(user_id,status,policy_version,updated_at) VALUES($1,'qualified','old-policy',1)",
      )
      .run(users[1].id);
    const catalog = {
      list: async () =>
        [
          {
            id: "v4",
            title: "作品一",
            classification: { pageSuitability: "sfw" },
            versions: [
              { engine: "ONS", status: "published" },
              { engine: "RenPy", status: "hidden" },
            ],
          },
          {
            id: "v17",
            title: "作品二",
            classification: { pageSuitability: "unknown" },
            versions: [],
          },
        ] as unknown as Awaited<ReturnType<Store["list"]>>,
    };
    const service = new InternalStatistics(
      db,
      () => new Set([users[0].id]),
      catalog,
      () => now,
    );
    const result = await service.read(7);
    assert.equal(result.period.timeZone, "Asia/Shanghai");
    assert.equal(result.trend.length, 7);
    assert.equal(result.trend[0].date, "2026-11-09");
    assert.equal(result.trend[0].newUsers, 1);
    assert.equal(result.trend[6].date, "2026-11-15");
    assert.equal(result.trend[6].newUsers, 1);
    assert.equal(result.trend[2].newUsers, 0);
    assert.equal(result.window.newUsers, 2);
    assert.equal(result.window.readingStarts, 2);
    assert.equal(
      result.distributions.eligibility.find((r) => r.key === "needs_retest")
        ?.count,
      1,
    );
    assert.equal(result.totals.users, 3);
    assert.equal(result.totals.admins, 2);
    assert.equal(result.totals.publicProfiles, 1);
    assert.equal(result.totals.readingSeconds, 10860);
    assert.equal(result.totals.referencedSaveBytes, 100);
    assert.equal(result.totals.registeredSaveBytes, 300);
    assert.equal(result.totals.activeShares, 2);
    assert.equal(result.totals.pendingReviews, 1);
    assert.equal(result.totals.openReports, 1);
    assert.equal(result.topWorks[0].title, "作品一");
    assert.equal(result.topWorks[0].readingSeconds, 10800);
    assert.equal(result.totals.internalReads, 10);
    assert.equal(result.catalog?.versions, 2);
    assert.equal(
      result.distributions.shares.find((r) => r.key === "expired")?.count,
      1,
    );
    const text = JSON.stringify(result);
    for (const privateValue of [
      "private-owner",
      "private-note",
      "private-secret-file",
      "private review",
      "private complaint",
      owner,
      "visitor_key",
    ])
      assert.ok(!text.includes(privateValue), privateValue);
    assert.equal(
      await db
        .prepare("SELECT count(*) AS n FROM wg_dashboard_audit")
        .get()
        .then((r) => r?.n),
      0,
    );
    const failed = new InternalStatistics(db, () => new Set(), {
      list: async () => {
        throw Error("secret database connection");
      },
    });
    assert.equal((await failed.read(7)).catalog, null);
  } finally {
    await f.close();
  }
});

test("statistics are admin-only, private and reject unsupported or duplicated ranges", async () => {
  const f = await shareHttpFixture();
  try {
    const owner = await f.register("Owner"),
      reader = await f.register("Reader");
    f.service.config.adminUserIds = [
      (await (await f.api("/api/me", owner)).json()).user.id,
    ];
    f.service.app = new Hono()
      .route("/", f.service.app)
      .onError((e, c) =>
        c.json(
          { code: e instanceof AccountError ? e.code : "ERROR" },
          e instanceof AccountError ? e.status : 500,
        ),
      );
    mountDashboard(f.service);
    assert.equal((await f.api("/api/dash/statistics")).status, 401);
    assert.equal((await f.api("/api/dash/statistics", reader)).status, 403);
    for (const query of [
      "days=1",
      "days=28",
      "days=7&days=90",
      "days=7&unknown=1",
    ])
      assert.equal(
        (await f.api("/api/dash/statistics?" + query, owner)).status,
        400,
        query,
      );
    const response = await f.api("/api/dash/statistics?days=7", owner);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const data = await response.json();
    assert.equal(data.trend.length, 7);
    assert.equal(data.catalog, null);
    assert.equal(
      (await f.api("/api/dash/statistics?days=90", owner)).status,
      200,
    );
  } finally {
    await f.close();
  }
});
