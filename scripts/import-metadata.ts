import { readFileSync } from "node:fs";
import { getStore } from "../src/server/runtime.ts";
const store = getStore();
try {
  const file =
    process.argv.find((v) => v.endsWith(".json")) ?? "data/metadata.json";
  const result = store.importMetadata(
    JSON.parse(readFileSync(file, "utf8")),
    process.argv.includes("--apply"),
  );
  console.log(
    JSON.stringify({
      mode: process.argv.includes("--apply") ? "apply" : "dry-run",
      ...result,
    }),
  );
} finally {
  store.close();
}
