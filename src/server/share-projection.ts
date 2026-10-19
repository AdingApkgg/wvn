export type PublicShareCard = {
  id: string;
  title: string;
  description: string;
  progress: string;
  spoiler: boolean;
  author: string;
  bytes: number;
  createdAt: number;
  version: { id: string; title: string; number: number };
};
export type PublicShareProjection = {
  available: boolean;
  items: PublicShareCard[];
  next: string | null;
  account: string;
};
export async function projectShares(
  work: string,
  versions: Set<string>,
  config: { backend: string; account: string },
  version?: string,
  cursor?: string,
  fetcher: typeof fetch = fetch,
): Promise<PublicShareProjection> {
  const empty = {
    available: false,
    items: [],
    next: null,
    account: config.account,
  };
  try {
    const account = new URL(config.account),
      backend = new URL(config.backend);
    if (
      account.origin !== config.account ||
      account.protocol !== "https:" ||
      backend.origin !== config.backend ||
      (backend.protocol !== "https:" &&
        !["127.0.0.1", "localhost"].includes(backend.hostname)) ||
      !/^v?[1-9]\d*$|^bgm:\d+$|^b[1-9]\d*$/.test(work)
    )
      return empty;
    const url = new URL(
      "/api/public/works/" + encodeURIComponent(work) + "/save-shares",
      config.backend,
    );
    if (version && versions.has(version))
      url.searchParams.set("versionId", version);
    if (cursor && /^[a-zA-Z0-9-]{1,100}$/.test(cursor))
      url.searchParams.set("cursor", cursor);
    const response = await fetcher(url, {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return empty;
    const text = await response.text();
    if (text.length > 8 * 1024 ** 2) return empty;
    const data = JSON.parse(text);
    if (
      !Array.isArray(data.items) ||
      data.items.length > 20 ||
      !(
        data.next === null ||
        (typeof data.next === "string" &&
          /^[a-zA-Z0-9-]{1,100}$/.test(data.next))
      )
    )
      return empty;
    const items: PublicShareCard[] = [];
    for (const x of data.items) {
      if (x.work?.id !== work || !versions.has(x.version?.id)) continue;
      if (
        !/^[a-zA-Z0-9-]{1,100}$/.test(x.id) ||
        typeof x.title !== "string" ||
        x.title.length > 240 ||
        typeof x.description !== "string" ||
        x.description.length > 6000 ||
        typeof x.author !== "string" ||
        x.author.length > 160 ||
        typeof x.progress !== "string" ||
        typeof x.spoiler !== "boolean" ||
        !Number.isSafeInteger(x.bytes) ||
        x.bytes < 0 ||
        typeof x.createdAt !== "number" ||
        typeof x.version.title !== "string" ||
        !Number.isSafeInteger(x.version.number)
      )
        return empty;
      items.push({
        id: x.id,
        title: x.title,
        description: x.description,
        author: x.author,
        progress: x.progress,
        spoiler: x.spoiler,
        bytes: x.bytes,
        createdAt: x.createdAt,
        version: {
          id: x.version.id,
          title: x.version.title,
          number: x.version.number,
        },
      });
    }
    return { available: true, items, next: data.next, account: config.account };
  } catch {
    return empty;
  }
}
