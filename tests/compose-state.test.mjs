import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
const script = new URL("../ops/compose/prepare.mjs", import.meta.url),
  sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
function directory(t) {
  const path = mkdtempSync(join(tmpdir(), "wvn-compose-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
const run = (path) =>
  spawnSync(process.execPath, [script.pathname, path], { encoding: "utf8" });
test("新 Compose 状态使用独立秘密与有效 localhost 证书，不把秘密写到输出", (t) => {
  const root = join(directory(t), "state"),
    result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const secret = readFileSync(join(root, "secrets/account-secret"), "utf8");
  assert(secret.length >= 48);
  assert.notEqual(
    secret,
    readFileSync(join(root, "secrets/b2-secret"), "utf8"),
  );
  assert(!result.stdout.includes(secret));
  assert.equal(statSync(join(root, "compose.env")).mode & 0o777, 0o600);
  for (const name of ["account-secret", "b2-secret", "blob-token", "tls.key"])
    assert.equal(statSync(join(root, "secrets", name)).mode & 0o777, 0o600);
  const cert = new X509Certificate(readFileSync(join(root, "secrets/tls.crt")));
  assert(cert.checkHost("localhost"));
  assert(Date.parse(cert.validTo) > Date.now());
  assert(
    existsSync(join(root, "catalog")) &&
      existsSync(join(root, "b2-config")) &&
      existsSync(join(root, "reports")),
  );
});
test("重复准备保留现有密钥、证书、私有环境和数据库内容", (t) => {
  const root = join(directory(t), "state");
  assert.equal(run(root).status, 0);
  writeFileSync(
    join(root, "web/accounts.sqlite"),
    "synthetic existing database",
  );
  const names = [
      "compose.env",
      "secrets/account-secret",
      "secrets/b2-secret",
      "secrets/tls.key",
      "secrets/tls.crt",
      "web/accounts.sqlite",
    ],
    before = names.map((n) => sha(join(root, n)));
  assert.equal(run(root).status, 0);
  assert.deepEqual(
    names.map((n) => sha(join(root, n))),
    before,
  );
});
test("陌生非空目录被拒绝且不产生任何额外文件", (t) => {
  const root = directory(t);
  writeFileSync(join(root, "existing.db"), "keep");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.deepEqual(readdirSync(root), ["existing.db"]);
  assert.equal(readFileSync(join(root, "existing.db"), "utf8"), "keep");
});
test("已初始化目录缺少秘密时拒绝静默重建", (t) => {
  const root = join(directory(t), "state");
  assert.equal(run(root).status, 0);
  rmSync(join(root, "secrets/account-secret"));
  const before = sha(join(root, "compose.env"));
  assert.notEqual(run(root).status, 0);
  assert(!existsSync(join(root, "secrets/account-secret")));
  assert.equal(sha(join(root, "compose.env")), before);
});
