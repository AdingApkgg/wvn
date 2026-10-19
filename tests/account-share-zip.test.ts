import { test } from "node:test";
import assert from "node:assert/strict";
const module = await import("../src/accounts/share-zip.server.ts").catch(
  () => null,
);
test("stored ZIP contains CRC checked portable paths and a central directory", async () => {
  assert.ok(module?.zipFiles, "bounded ZIP generator required");
  const bytes: Buffer[] = [];
  async function* files() {
    yield { name: "manifest.json", bytes: Buffer.from("{}") };
    yield { name: "files/slot.dat", bytes: Buffer.from("123456789") };
  }
  for await (const chunk of module.zipFiles(files()))
    bytes.push(Buffer.from(chunk));
  const zip = Buffer.concat(bytes);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const second = 30 + Buffer.byteLength("manifest.json") + 2;
  assert.equal(zip.readUInt32LE(second + 14), 0xcbf43926);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2);
  async function* bad() {
    yield { name: "../secret", bytes: Buffer.from("bad") };
  }
  await assert.rejects(async () => {
    for await (const _ of module.zipFiles(bad())) {
    }
  }, /ZIP_PATH/);
});
