import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {Button} from '../components/ui/button';
import type {useAccount} from './client';
import type {CatalogItem} from './library.server';
export function Favorites({account}:{account:ReturnType<typeof useAccount>}){
 const owner=account.me?.user.id,{request}=account;
 const [items,setItems]=useState<CatalogItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let live=true;setItems([]);setLoading(true);setError('');
  if(owner)void Promise.all([request<string[]>('/api/me/favorites',undefined,undefined,owner),request<CatalogItem[]>('/api/account-catalog')]).then(([ids,works])=>{if(live)setItems(ids.flatMap(id=>works.filter(w=>w.id===id)))}).catch(()=>{if(live)setError('收藏暂时无法读取，请刷新重试。')}).finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[owner,request]);
 return <section id="my-favorites" className="space-y-3" aria-label="我的收藏">
  <h2>我的收藏</h2>
  {loading?<p className="text-sm text-muted-foreground">正在读取收藏…</p>:error?<p role="alert">{error}</p>:items.length?<div className="flex flex-wrap gap-2">{items.map(w=><Button key={w.id} asChild variant="outline"><Link to={w.url}>{w.title}</Link></Button>)}</div>:<p className="text-sm text-muted-foreground">还没有收藏。在作品页点击“收藏”，方便下次找到。</p>}
 </section>;
}
