import { PgDatabase } from "../database/postgres.ts";
import { Store } from "./store.ts";
// Vite SSR 与 tsx listener 会分别加载本模块；同进程必须共用一个连接池并一起关闭。
const runtimeKey = Symbol.for('wvn.catalog.runtime.v1');
const runtime = globalThis as typeof globalThis & { [runtimeKey]?: Store };
export function getStore() {
  if (!runtime[runtimeKey]) {
    const url = process.env.WG_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('WG_DATABASE_URL or DATABASE_URL is required');
    runtime[runtimeKey] = new Store(new PgDatabase(url, { schema: process.env.WG_DATABASE_SCHEMA }));
  }
  return runtime[runtimeKey]!;
}
