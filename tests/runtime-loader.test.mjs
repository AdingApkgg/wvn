import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
test("Oxc executes TSX, parameter properties, JSON, aliases and extensionless imports in a child process", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "@oxc-node/core/register",
      "tests/fixtures/runtime-loader/entry.ts",
    ],
    {
      cwd: root,
      env: { ...process.env, WVN_RUNNER_CHILD: "1" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    jsx: true,
    uid: 7,
    alias: true,
    package: "wg-manager",
    child: true,
  });
});
