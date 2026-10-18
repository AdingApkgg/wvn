import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { Store } from "./store.ts";
let instance: Store;
export function getStore() {
  if (!instance) {
    const file = resolve(process.env.WG_DATABASE ?? "state/catalog.db");
    mkdirSync(resolve(file, ".."), { recursive: true });
    instance = new Store(file);
  }
  return instance;
}
