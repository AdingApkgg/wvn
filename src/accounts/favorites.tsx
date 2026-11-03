import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {Button} from '../components/ui/button';
import type {useAccount} from './client';
import type {CatalogItem} from './library.server';
import {useContentAccess} from '../content/client';
export function Favorites({account}:{account:ReturnType<typeof useAccount>}){
 const owner=account.me?.user.id,{request}=account;
 const content=useContentAccess(),scope=content.enabled?content.access:null;
 const ready=!content.enabled||(!content.loading&&!content.pendingPublic);
 const [snapshot,setSnapshot]=useState<{scope:typeof scope;owner:typeof owner;items:CatalogItem[];error:string}|null>(null);
 const visible=!!snapshot&&ready&&snapshot.scope===scope&&snapshot.owner===owner;
 useEffect(()=>{
  if(!owner||!ready)return;
  let live=true;
  void Promise.all([request<string[]>('/api/me/favorites',undefined,undefined,owner),request<CatalogItem[]>('/api/account-catalog')]).then(([ids,works])=>{if(live)setSnapshot({scope,owner,items:ids.flatMap(id=>works.filter(w=>w.id===id)),error:''})}).catch(()=>{if(live)setSnapshot({scope,owner,items:[],error:'收藏暂时无法读取，请刷新重试。'})});
  return()=>{live=false};
 },[owner,request,scope,ready]);
 return <section id="my-favorites" className="space-y-3" aria-label="我的收藏">
  <h2>我的收藏</h2>
  {!visible||!snapshot?<p className="text-sm text-muted-foreground">正在读取收藏…</p>:snapshot.error?<p role="alert">{snapshot.error}</p>:snapshot.items.length?<div className="flex flex-wrap gap-2">{snapshot.items.map(w=><Button key={w.id} asChild variant="outline"><Link to={w.url}>{w.title}</Link></Button>)}</div>:<p className="text-sm text-muted-foreground">还没有收藏。在作品页点击“收藏”，方便下次找到。</p>}
 </section>;
}
