import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
test("port preflight checks live ownership even when a stale ready marker exists", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const root = mkdtempSync(join(tmpdir(), "wg-preflight-"));
  writeFileSync(join(root, "ready"), "old");
  writeFileSync(join(root, "pid"), String(process.pid));
  const command =
    'source scripts/lib/sharing-preflight.sh; preflight_listener "$1" "$2" "$3" "$4"';
  try {
    await run("bash", [
      "-c",
      command,
      "test",
      String(port),
      join(root, "pid"),
      process.cwd(),
      "sharing-preflight.test",
    ]);
    writeFileSync(join(root, "pid"), "999999999");
    await assert.rejects(
      run("bash", [
        "-c",
        command,
        "test",
        String(port),
        join(root, "pid"),
        process.cwd(),
        "sharing-preflight.test",
      ]),
    );
    writeFileSync(join(root, "pid"), String(process.pid));
    await assert.rejects(
      run("bash", [
        "-c",
        command,
        "test",
        String(port),
        join(root, "pid"),
        root,
        "sharing-preflight.test",
      ]),
    );
    await assert.rejects(
      run("bash", [
        "-c",
        command,
        "test",
        String(port),
        join(root, "pid"),
        process.cwd(),
        "accounts-server.ts",
      ]),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
