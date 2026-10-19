import { readFileSync, existsSync } from "node:fs";
import { getStore } from "../src/server/runtime.ts";
const store = getStore();
store.seed(JSON.parse(readFileSync("data/catalog.json", "utf8")));
if (existsSync("data/metadata.json"))
  store.importMetadata(
    JSON.parse(readFileSync("data/metadata.json", "utf8")),
    true,
  );
console.log(
  JSON.stringify({
    works: store.list().length,
    versions: store.list().reduce((n, w) => n + w.versions.length, 0),
  }),
);
store.close();
