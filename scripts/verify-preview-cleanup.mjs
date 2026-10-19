import assert from "node:assert/strict";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import { PreviewCleanup } from "./lib/preview-cleanup.mjs";
assert.equal(hostname(), "localhost");
assert.equal(process.cwd(), "/home/wvn/wg-accounts-preview-20261019");
const origin = "https://localhost:18283",
  cases = [];
const db = new DatabaseSync("state/accounts-preview/accounts.sqlite", {
  readOnly: true,
});
const isPresent = (id) =>
  !!db.prepare('SELECT 1 FROM "user" WHERE id=?').get(id);
const child = spawnSync(
  process.execPath,
  ["scripts/verify-sharing-preview.mjs"],
  {
    env: {
      ...process.env,
      WG_PREVIEW_FAIL_AFTER_REGISTER: "1",
      WG_SHARING_POLISH_ACCEPTANCE: "0",
    },
    encoding: "utf8",
    timeout: 60000,
  },
);
assert.equal(child.status, 1, "Failed acceptance must exit nonzero");
const result = JSON.parse(
  child.stderr
    .trim()
    .split("\n")
    .findLast((line) => line.startsWith('{"code":"PREVIEW_ACCEPTANCE_FAILED"')),
);
const record = JSON.parse(readFileSync(result.report, "utf8"));
assert.equal(record.failure.stage, "injected-after-registration");
assert.equal(record.failure.code, "INJECTED_ACCEPTANCE_FAILURE");
assert.equal(record.accounts.length, 1);
assert.equal(record.accounts[0].state, "deleted");
assert.equal(isPresent(record.accounts[0].accountId), false);
assert.equal(statSync(result.report).mode & 0o777, 0o600);
cases.push({
  name: "actual-process-interrupted-after-register",
  exitCode: child.status,
  remaining: result.remaining,
  privateJournal: result.report,
});
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  for (const fault of ["http500", "network"]) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const run = new PreviewCleanup({
      directory: "state/sharing-preview/acceptance-runs",
      origin,
    });
    const entry = run.begin(context, "fault-fixture");
    try {
      const page = await context.newPage();
      await page.goto(origin + "/account");
      const cdp = await context.newCDPSession(page);
      await cdp.send("WebAuthn.enable");
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
      await page
        .getByLabel("昵称", { exact: true })
        .fill("清理验收 · " + run.runId.slice(0, 8));
      await page
        .getByLabel("预览邀请码")
        .fill(readFileSync("state/accounts-preview/invite", "utf8").trim());
      const registration = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/auth/passkey/verify-registration") &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "创建通行密钥并注册" }).click();
      assert.equal((await registration).status(), 200);
      const me = await (await context.request.get(origin + "/api/me")).json();
      run.identify(entry, me.user.id);
      const live = context;
      entry.context = {
        request: {
          get: (...args) => live.request.get(...args),
          delete: async () => {
            if (fault === "network")
              throw new Error(
                "Synthetic network failure with token=must-not-log",
              );
            return {
              status: () => 500,
              json: async () => ({ token: "must-not-log" }),
            };
          },
        },
      };
      const failed = await run.finish({
        passed: false,
        stage: "controlled-failure",
        error: Object.assign(new Error("must-not-log"), {
          code: "INJECTED_ACCEPTANCE_FAILURE",
        }),
      });
      assert.equal(failed.status, "failed");
      assert.equal(failed.remaining, 1);
      assert.equal(isPresent(entry.accountId), true);
      const raw = readFileSync(run.report, "utf8"),
        log = JSON.parse(raw);
      assert.ok(!raw.includes("must-not-log"));
      assert.ok(!raw.includes(me.binding));
      assert.equal(log.accounts[0].accountId, entry.accountId);
      assert.ok(
        log.events.some((event) =>
          fault === "http500"
            ? event.status === 500 && event.phase === "delete"
            : event.code === "CLEANUP_TRANSPORT",
        ),
      );
      // Resolve this controlled transport fault through the normal API, never with database writes.
      entry.context = live;
      assert.equal((await run.remove(entry)).ok, true);
      assert.equal(isPresent(entry.accountId), false);
      const final = await run.finish({
        passed: false,
        stage: "remediated",
        error: new Error("resolved synthetic transport"),
      });
      assert.equal(final.remaining, 0);
      assert.equal(final.status, "failed");
      assert.equal(
        JSON.parse(readFileSync(run.report, "utf8")).failure.stage,
        "controlled-failure",
      );
      cases.push({
        name: stdfault(fault),
        simulatedRemaining: failed.remaining,
        afterRemediationRemaining: final.remaining,
        originalFailurePreserved: true,
        privateJournal: run.report,
      });
    } finally {
      entry.context = context;
      if (entry.accountId && entry.state !== "deleted") await run.remove(entry);
      await context.close();
    }
  }
} finally {
  await browser.close();
  db.close();
}
const receipt = {
  status: "passed",
  checkedAt: new Date().toISOString(),
  host: hostname(),
  revision: readFileSync("reports/sharing-source-revision", "utf8").trim(),
  cases,
  allCreatedAccountsDeleted: true,
  productionChanged: false,
};
writeFileSync(
  "reports/sharing-preview/cleanup-failure-acceptance.json",
  JSON.stringify(receipt, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(receipt));
function stdfault(fault) {
  return fault === "http500"
    ? "simulated-delete-http500"
    : "simulated-delete-network";
}
