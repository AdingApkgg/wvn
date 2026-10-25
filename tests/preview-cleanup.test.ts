import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const module = await import("../scripts/lib/preview-cleanup.mjs").catch(
  () => null,
);
function fixture(overrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "wg-cleanup-"));
  const calls: string[] = [];
  const request = {
    get: async () => ({
      status: () => 200,
      json: async () => ({
        user: { id: "created-a" },
        binding: "private-binding",
      }),
    }),
    delete: async (
      _url: string,
      options: { headers: Record<string, string> },
    ) => {
      calls.push(options.headers["x-wg-binding"]);
      return { status: () => 200, json: async () => ({ ok: true }) };
    },
    ...overrides,
  };
  assert.ok(module?.PreviewCleanup, "cleanup controller must exist");
  const run = new module.PreviewCleanup({
    directory: root,
    origin: "https://localhost:18283",
    runId: "test-run",
  });
  const entry = run.begin({ request }, "temporary-a");
  run.identify(entry, "created-a");
  return {
    root,
    request,
    calls,
    run,
    entry,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}
test("cleanup checks owner and confirmed deletion, journals no session secrets and uses0600", async () => {
  const f = fixture();
  try {
    assert.equal((await f.run.remove(f.entry)).ok, true);
    const result = await f.run.finish({ passed: true, stage: "finished" });
    assert.equal(result.status, "passed");
    assert.equal(result.remaining, 0);
    assert.deepEqual(f.calls, ["private-binding"]);
    const raw = readFileSync(result.report, "utf8"),
      saved = JSON.parse(raw);
    assert.equal(saved.accounts[0].accountId, "created-a");
    assert.equal(saved.accounts[0].state, "deleted");
    assert.ok(!raw.includes("private-binding"));
    // Windows preview directories are restricted with NTFS ACLs by the
    // launcher; POSIX mode bits are only meaningful on the Linux runner.
    if (process.platform !== "win32")
      assert.equal(statSync(result.report).mode & 0o777, 0o600);
  } finally {
    f.close();
  }
});
for (const status of [401, 403, 500])
  test(`cleanup records DELETE ${status} instead of claiming success`, async () => {
    const f = fixture({
      delete: async () => ({
        status: () => status,
        json: async () => ({
          code: "REQUEST_FAILED",
          token: "sensitive-response-body",
        }),
      }),
    });
    try {
      const result = await f.run.finish({ passed: true, stage: "cleanup" });
      assert.equal(result.status, "failed");
      assert.equal(result.remaining, 1);
      const raw = readFileSync(result.report, "utf8"),
        saved = JSON.parse(raw);
      assert.equal(saved.accounts[0].accountId, "created-a");
      assert.ok(
        saved.events.some(
          (e: { status: number; phase: string }) =>
            e.status === status && e.phase === "delete",
        ),
      );
      assert.ok(!raw.includes("sensitive-response-body"));
    } finally {
      f.close();
    }
  });
test("cleanup never deletes a switched account and does not infer deletion from401 probe", async () => {
  const f = fixture({
    get: async () => ({
      status: () => 200,
      json: async () => ({ user: { id: "unrelated-b" }, binding: "secret-b" }),
    }),
  });
  try {
    const result = await f.run.remove(f.entry);
    assert.equal(result.code, "OWNER_MISMATCH");
    assert.equal(f.calls.length, 0);
    f.request.get = async () =>
      ({ status: () => 401, json: async () => ({}) }) as never;
    const unauthorized = await f.run.remove(f.entry);
    assert.equal(unauthorized.ok, false);
    assert.equal(unauthorized.status, 401);
    assert.equal(f.calls.length, 0);
  } finally {
    f.close();
  }
});
test("network errors preserve original failure and cannot prevent other accounts being cleaned", async () => {
  const f = fixture({
    delete: async () => {
      throw new Error("https://localhost/#key=TOP_SECRET Cookie=SECRET");
    },
  });
  try {
    const second = f.run.begin(
      {
        request: {
          get: async () => ({
            status: () => 200,
            json: async () => ({ user: { id: "created-b" }, binding: "b" }),
          }),
          delete: async () => ({
            status: () => 200,
            json: async () => ({ ok: true }),
          }),
        },
      },
      "temporary-b",
    );
    f.run.identify(second, "created-b");
    const result = await f.run.finish({
      passed: false,
      stage: "pagination",
      error: Object.assign(new Error("TOKEN=TOP_SECRET"), {
        code: "ERR_ASSERTION",
      }),
    });
    assert.equal(result.status, "failed");
    assert.equal(result.remaining, 1);
    assert.equal(result.deleted, 1);
    const raw = readFileSync(result.report, "utf8"),
      saved = JSON.parse(raw);
    assert.equal(saved.failure.stage, "pagination");
    assert.equal(saved.failure.code, "ERR_ASSERTION");
    assert.ok(
      saved.events.some(
        (e: { code: string }) => e.code === "CLEANUP_TRANSPORT",
      ),
    );
    assert.ok(!raw.includes("TOP_SECRET"));
    assert.ok(!raw.includes("Cookie"));
  } finally {
    f.close();
  }
});
test("only successful runs keep explicitly retained examples; failure cleans every registered account", async () => {
  const f = fixture();
  try {
    const retained = f.run.begin({ request: f.request }, "author", true);
    f.run.identify(retained, "created-a");
    await f.run.remove(f.entry);
    const success = await f.run.finish({ passed: true, stage: "finished" });
    assert.equal(success.status, "passed");
    assert.equal(f.calls.length, 1);
    const failed = await f.run.finish({
      passed: false,
      stage: "late-failure",
      error: new Error("failure"),
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.remaining, 0);
    assert.equal(f.calls.length, 2);
  } finally {
    f.close();
  }
});
test("unconfirmed registration stays actionable without deleting an unknown owner", async () => {
  const f = fixture();
  try {
    const pending = f.run.begin({ request: f.request }, "registering-author");
    const result = await f.run.remove(pending);
    assert.equal(result.code, "OWNER_UNCONFIRMED");
    assert.equal(f.calls.length, 0);
    const report = JSON.parse(readFileSync(f.run.report, "utf8"));
    assert.ok(
      report.accounts.some(
        (a: { label: string; accountId: null }) =>
          a.label === "registering-author" && a.accountId === null,
      ),
    );
  } finally {
    f.close();
  }
});

test("cleanup failure cancels retention of successful-example accounts", async () => {
  const f = fixture({
    delete: async () => ({ status: () => 500, json: async () => ({}) }),
  });
  try {
    const retained = f.run.begin(
      {
        request: {
          get: async () => ({
            status: () => 200,
            json: async () => ({ user: { id: "example-b" }, binding: "b" }),
          }),
          delete: async () => ({
            status: () => 200,
            json: async () => ({ ok: true }),
          }),
        },
      },
      "example",
      true,
    );
    f.run.identify(retained, "example-b");
    const result = await f.run.finish({ passed: true, stage: "cleanup" });
    assert.equal(result.status, "failed");
    assert.equal(retained.state, "deleted");
  } finally {
    f.close();
  }
});

test("a late resource-close error changes the durable run status to failed", async () => {
  const f = fixture();
  try {
    await f.run.finish({ passed: true, stage: "done" });
    f.run.recordFailure("close-resources", new Error("private message"));
    const record = JSON.parse(readFileSync(f.run.report, "utf8"));
    assert.equal(record.status, "failed");
    assert.equal(record.failure.stage, "close-resources");
  } finally {
    f.close();
  }
});
