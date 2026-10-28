import { PgDatabase } from "../database/postgres.ts";
import { Store } from "./store.ts";
let instance: Store | undefined;
export function getStore() {
  if (!instance) {
    const url = process.env.WG_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('WG_DATABASE_URL or DATABASE_URL is required');
    instance = new Store(new PgDatabase(url, { schema: process.env.WG_DATABASE_SCHEMA }));
  }
  return instance;
}
