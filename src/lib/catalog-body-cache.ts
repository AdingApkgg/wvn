import { projectWork, PUBLIC_CONTENT_ACCESS } from '../content/policy';
import type { PublicWork } from '../types';

/** 仅保存当前目录已取得的公共主体；不保存权限结果、账号或异步附属数据。 */
export class CatalogBodyCache {
  private readonly entries = new Map<string, { work: PublicWork; expires: number }>();
  private readonly sources = new WeakSet<PublicWork[]>();
  private readonly now: () => number;
  private readonly ttl: number;
  private readonly capacity: number;
  constructor({ now = Date.now, ttl = 30_000, capacity = 100 } = {}) {
    this.now = now; this.ttl = ttl; this.capacity = capacity;
  }
  clear() { this.entries.clear(); }
  seed(works: PublicWork[], enabled = true) {
    if (!enabled) { this.clear(); return; }
    // 同一loader快照的重渲染不能续期或复活已失效的数据。
    if (this.sources.has(works)) return;
    this.sources.add(works);
    this.clear();
    for (const work of works) {
      if (this.entries.size >= this.capacity) break;
      const projected = projectWork(work, PUBLIC_CONTENT_ACCESS);
      if (!projected?.versions.length) continue;
      this.entries.set(projected.url, { work: structuredClone(projected), expires: this.now() + this.ttl });
    }
  }
  get(url: URL) {
    if (url.search) return;
    const entry = this.entries.get(url.pathname);
    if (!entry) return;
    if (entry.expires <= this.now()) { this.entries.delete(url.pathname); return; }
    return structuredClone(entry.work);
  }
}

export const catalogBodies = new CatalogBodyCache();
let listening = false;
export function rememberCatalogBodies(works: PublicWork[], enabled: boolean) {
  if (typeof window === 'undefined') return;
  if (!listening) {
    listening = true;
    const clear = () => catalogBodies.clear();
    for (const event of ['wg-content-change', 'wg-account-invalidated', 'blur', 'pagehide']) window.addEventListener(event, clear);
    window.addEventListener('storage', event => { if (event.key === 'wg-content-change' || event.key === 'wg-account-change') clear(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') clear(); });
  }
  catalogBodies.seed(works, enabled);
}
