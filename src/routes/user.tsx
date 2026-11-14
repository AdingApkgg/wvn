import { useEffect, useState } from 'react';
import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { publicProjectionFetch } from '../accounts/public-projection.server';
import { useContentAccess } from '../content/client';
import type { ShareView } from '../accounts/share-types';
import { SHARE_PROGRESS } from '../accounts/share-metadata';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { brand } from '../brand';
import { createApiClient, ApiResponseError } from '../api/client';
const api = createApiClient();
export async function loader({request,params}:LoaderFunctionArgs) {
  const fetcher=publicProjectionFetch(request);
  if(!fetcher)throw new Response('个人主页暂不可用',{status:503});
  const client=createApiClient({baseUrl:new URL(request.url).origin,fetch:fetcher});
  try { return await client.publicProfileGet({params:{uid:params.uid??''}},{signal:request.signal}); }
  catch(error) { if(error instanceof ApiResponseError)throw new Response('主页未公开或不存在',{status:error.status});throw error; }
}
export function meta(){return [{title:`个人主页 · ${brand.shortName}`},{name:'robots',content:'noindex,nofollow'}]}
export default function UserPage(){
  const profile=useLoaderData<typeof loader>();
  const content=useContentAccess();
  const scope=content.access,ready=!content.enabled||(!content.loading&&!content.pendingPublic);
  const [page,setPage]=useState(1),[result,setResult]=useState<{uid:string;scope:typeof scope;page:number;items:ShareView[];next:number|null}|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{setPage(1)},[profile.uid]);
  useEffect(()=>{
    if(!ready)return;const controller=new AbortController();setError('');
    void api.publicProfileShares({params:{uid:profile.uid},query:{page:String(page)}},{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setResult({uid:profile.uid,scope,page,...value})}).catch(()=>{if(!controller.signal.aborted)setError('公开分享加载失败，请重试。')});
    return()=>controller.abort();
  },[profile.uid,scope,ready,page,reload]);
  const visible=ready&&result?.uid===profile.uid&&result.scope===scope&&result.page===page?result:null;
  return <main className="container public-profile"><section className="profile-heading"><div className="profile-avatar" aria-hidden="true">{Array.from(profile.name)[0]?.toUpperCase()||'读'}</div><div><p className="eyebrow">读者主页 · UID {profile.uid}</p><h1>{profile.name}</h1><p className="text-muted-foreground">{new Date(profile.joinedAt).toLocaleDateString('zh-CN')} 加入</p></div></section><p className="profile-bio">{profile.bio||'这位读者还没有填写简介。'}</p><section className="mt-10"><h2>公开分享</h2><p className="text-muted-foreground">已审核且仍有效的公开存档分享。</p><p role="status">{error||(!visible?'正在读取公开分享…':'')}</p>{error&&<Button variant="outline" onClick={()=>setReload(n=>n+1)}>重试</Button>}{visible&&!visible.items.length&&<Card><CardContent className="pt-6">暂时没有可展示的公开分享。</CardContent></Card>}<div className="dashboard-users">{visible?.items.map(share=><Card key={share.id}><CardHeader><CardTitle><Link to={'/s/'+encodeURIComponent(share.id)}>{share.title}</Link></CardTitle><p>{share.work.title} · {SHARE_PROGRESS[share.progress]}{share.spoiler?' · 含剧透说明':''}</p></CardHeader><CardContent>{!share.spoiler&&<p className="whitespace-pre-wrap break-words">{share.description}</p>}<Button asChild variant="outline"><Link to={'/s/'+encodeURIComponent(share.id)}>查看分享</Link></Button></CardContent></Card>)}</div><div className="flex gap-2 mt-4"><Button variant="outline" disabled={page===1||!visible} onClick={()=>setPage(n=>n-1)}>上一页</Button><span className="self-center">第 {page} 页</span><Button variant="outline" disabled={!visible?.next} onClick={()=>setPage(visible!.next!)}>下一页</Button></div></section></main>;
}
