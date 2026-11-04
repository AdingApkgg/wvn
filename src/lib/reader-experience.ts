export type ReaderSection = "discover" | "library" | "saves" | "settings";

export function sectionFor(pathname: string, tab = "library"): ReaderSection {
  if (pathname === "/content") return "settings";
  if (pathname.startsWith("/s/")) return "saves";
  if (pathname !== "/account") return "discover";
  if (tab === "saves" || tab === "shares") return "saves";
  return tab === "security" ? "settings" : "library";
}

export function accountReturnPath(pathname: string, search: string, hash: string) {
  return pathname + search + (pathname.startsWith("/s/") ? "" : hash);
}

export function withoutFilter(search: string, key: string) {
  const query = new URLSearchParams(search);
  query.delete(key);
  query.delete("cursor");
  query.delete("page");
  query.delete("offset");
  return "/" + (query.size ? "?" + query.toString() : "");
}

export function splitSynopsis(description: string) {
  const marker = "[中文简介]", at = description.indexOf(marker);
  if (at >= 0 && description.slice(at + marker.length).trim()) {
    return { primary: description.slice(at + marker.length).trim(), original: description.slice(0, at).trim() || null };
  }
  return { primary: description.trim(), original: null };
}

export function claimStartIntent(key: string, version: string, intent: unknown, storage: Pick<Storage, "getItem" | "setItem">) {
  if (!key || key === "default" || intent !== version) return false;
  try {
    const entry = "wvn:reading-intent:" + key;
    if (storage.getItem(entry)) return false;
    storage.setItem(entry, version);
    return true;
  } catch { return false; }
}

export function shelfWorkIds(entries: { workId: string }[], favorites: string[]) {
  return [...new Set([...entries.map(entry => entry.workId), ...favorites])];
}
