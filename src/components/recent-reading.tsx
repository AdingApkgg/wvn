import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { PublicVersion } from "../types";

type Recent = { url: string; title: string; number: number; savedAt: string };
export function RecentReading({ works }: { works: { title: string; versions: Pick<PublicVersion, "id" | "url" | "number">[] }[] }) {
  const [items, setItems] = useState<Recent[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const storagePath = "/ons/storage.mjs", registryPath = "/player/registry.mjs";
      const { openSaveStore } = await import(/* @vite-ignore */ storagePath) as typeof import("../../public/ons/storage.mjs");
      const { players } = await import(/* @vite-ignore */ registryPath) as typeof import("../../public/player/registry.mjs");
      const store = await openSaveStore();
      try {
        const found: Recent[] = [];
        for (const work of works) for (const version of work.versions) {
          const player = players.find(p => p.versionId === version.id);
          if (!player) continue;
          const saved = await store.get(player.id);
          if (saved?.snapshot.files.some(file => file.data.byteLength > 0)) found.push({ url: version.url, title: work.title, number: version.number, savedAt: saved.createdAt });
        }
        if (active) setItems(found.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 3));
      } finally { store.close(); }
    })().catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [works]);
  if (unavailable) return <p className="text-sm text-muted-foreground">本机阅读记录暂时无法读取；仍可从作品页进入，已有存档保留。</p>;
  if (!items.length) return null;
  return <section className="recent-reading" aria-label="继续阅读"><h2>继续阅读</h2><div>{items.map(item => <Link to={item.url} key={item.url}><strong>{item.title}</strong><span>版本 {item.number} · 本机存档</span><span aria-hidden="true">继续 →</span></Link>)}</div></section>;
}
