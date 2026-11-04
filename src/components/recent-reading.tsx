import { Link } from "react-router";
import type { PublicVersion } from "../types";
import {useLocalReading} from '../accounts/local-reading';

export function RecentReading({ works }: { works: { title: string; versions: Pick<PublicVersion, "id" | "url" | "number">[] }[] }) {
  const local=useLocalReading(works.flatMap(work=>work.versions)),unavailable=local.unavailable;
  const items=local.items.slice(0,3).flatMap(item=>{const work=works.find(work=>work.versions.some(version=>version.id===item.id));return work?[{...item,title:work.title}]:[]});
  if (unavailable) return <p className="text-sm text-muted-foreground">本机阅读记录暂时无法读取；仍可从作品页进入，已有存档保留。</p>;
  if (!items.length) return null;
  return <section className="recent-reading" aria-label="继续阅读"><h2>继续阅读</h2><div>{items.map(item => <Link to={item.url} state={{startReading:item.id}} key={item.url}><strong>{item.title}</strong><span>版本 {item.number} · 本机存档</span><span aria-hidden="true">继续 →</span></Link>)}</div></section>;
}
