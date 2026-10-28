import { AccountError } from "./errors.server.ts";
import type { CatalogItem } from "./library.server.ts";
export function validateCatalog(data: unknown): CatalogItem[] {
  if (!Array.isArray(data) || data.length > 10000 || data.some((w: CatalogItem) =>
    !w || typeof w.id !== 'string' || typeof w.title !== 'string' || !/^\/b?[1-9]\d*\/$/.test(w.url)
    || !Array.isArray(w.versions) || w.versions.some(v => !v || typeof v.id !== 'string'
      || typeof v.title !== 'string' || typeof v.engine !== 'string' || !Number.isSafeInteger(v.number)
      || !/^\/b?[1-9]\d*\/[1-9]\d*\/$/.test(v.url)))) throw new Error('Invalid catalog');
  return data as CatalogItem[];
}
export class CatalogPolicy {
  private entries: CatalogItem[] = [];
  private checked = 0;
  private flight?: Promise<void>;
  constructor(private provider: () => Promise<CatalogItem[]>) {}
  async refresh(force = false) {
    if (!force && Date.now() - this.checked < 30_000) return;
    if (this.flight) return this.flight;
    this.flight = (async () => {
      try {
        const data = validateCatalog(await this.provider());
        this.entries = data;
        this.checked = Date.now();
      } catch {
        this.checked = 0;
        throw new AccountError(503, "CATALOG_UNAVAILABLE");
      }
    })().finally(() => {
      this.flight = undefined;
    });
    return this.flight;
  }
  require(versionId: string) {
    if (!this.checked || Date.now() - this.checked >= 30_000)
      throw new AccountError(503, "CATALOG_UNAVAILABLE");
    for (const w of this.entries) {
      const v = w.versions.find((v) => v.id === versionId);
      if (v)
        return {
          work: { id: w.id, title: w.title, url: w.url },
          version: {
            id: v.id,
            title: v.title,
            number: v.number,
            engine: v.engine,
            url: v.url,
          },
        };
    }
    throw new AccountError(404, "VERSION_UNAVAILABLE");
  }
  visible(versionId: string) {
    try {
      this.require(versionId);
      return true;
    } catch (e) {
      if (e instanceof AccountError && e.status === 404) return false;
      throw e;
    }
  }
}
export function catalogProvider(origin: string) {
  const url = new URL(origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
    throw new Error("Exact catalog origin required");
  return async (): Promise<CatalogItem[]> => {
    const response = await fetch(origin + "/api/catalog", {
      redirect: "error",
      signal: AbortSignal.timeout(2000),
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length") ?? 0) > 8 * 1024 ** 2
    )
      throw new Error("Catalog unavailable");
    const text = await response.text();
    if (text.length > 8 * 1024 ** 2) throw new Error("Catalog too large");
    return JSON.parse(text).map((w: CatalogItem) => ({
      id: w.id,
      title: w.title,
      url: w.url,
      versions: w.versions.map((v) => ({
        id: v.id,
        title: v.title,
        number: v.number,
        engine: v.engine,
        url: v.url,
      })),
    }));
  };
}
