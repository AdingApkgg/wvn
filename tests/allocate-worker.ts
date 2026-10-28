import { PgDatabase } from "../src/database/postgres.ts";
import { Store } from "../src/server/store.ts";
import { existsSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
const [file, barrier, label] = process.argv.slice(2);
const s = new Store(new PgDatabase(process.env.WVN_TEST_DATABASE_URL!, { schema: file }));
while (!existsSync(barrier)) await setTimeout(10);
const v = (await s.addVersion("v4", {
  title: label,
  legacyPath: "/" + label + "/",
  engine: "ONS",
}));
console.log(v.number);
(await s.close());
