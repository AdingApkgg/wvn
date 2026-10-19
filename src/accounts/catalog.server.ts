import type { CatalogSeed } from "../types.ts";
import { workSlug } from "../identity.ts";
import type { CatalogItem } from "./library.server.ts";
export function projectCatalog(seed: CatalogSeed): CatalogItem[] {
  return seed.works
    .map((work) => ({
      id: work.id,
      title: work.title,
      url: `/${workSlug(work.id)}/`,
      versions: seed.versions
        .filter((v) => v.workId === work.id)
        .map((v) => ({
          id: v.id,
          number: v.number,
          title: v.title,
          engine: v.engine,
          url: `/${workSlug(work.id)}/${v.number}/`,
        })),
    }))
    .filter((w) => w.versions.length);
}
