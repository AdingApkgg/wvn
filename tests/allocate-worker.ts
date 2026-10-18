import { Store } from "../src/server/store.ts";
import { existsSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
const [file, barrier, label] = process.argv.slice(2);
const s = new Store(file);
while (!existsSync(barrier)) await setTimeout(10);
const v = s.addVersion("v4", {
  title: label,
  legacyPath: "/" + label + "/",
  engine: "ONS",
});
console.log(v.number);
s.close();
