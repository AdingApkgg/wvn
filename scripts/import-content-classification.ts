import { readFileSync } from "node:fs";
import { getStore } from "../src/server/runtime.ts";

const store = getStore();
try {
  const path = process.argv.find(value => value.endsWith(".json")) ?? "data/content-classification.json";
  const apply = process.argv.includes("--apply");
  const result = await store.classifications.import(JSON.parse(readFileSync(path, "utf8")), apply);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }));
} finally { await store.close(); }
