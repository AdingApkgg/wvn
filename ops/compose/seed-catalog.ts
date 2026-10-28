import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../../src/server/store.ts";
const file = process.env.WG_DATABASE;
if (!file) throw Error("WG_DATABASE is required");
if (existsSync(file)) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare("pragma quick_check").get()?.quick_check !== "ok")
      throw Error("Existing catalog integrity differs");
  } finally {
    db.close();
  }
  console.log(JSON.stringify({ status: "preserved" }));
} else {
  const store = new Store(file);
  try {
    store.seed(JSON.parse(readFileSync("data/catalog.json", "utf8")));
    if (existsSync("data/metadata.json"))
      store.importMetadata(
        JSON.parse(readFileSync("data/metadata.json", "utf8")),
        true,
      );
    console.log(
      JSON.stringify({ status: "created", works: store.list().length }),
    );
  } finally {
    store.close();
  }
}
