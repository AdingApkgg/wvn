import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import {BookOpen,Heart,Bookmark} from 'lucide-react';
import {Button} from './ui/button';
import {AccountClientError,errorCopy} from '../accounts/client';
import type {WorkCounts} from '../accounts/work-stats.server.ts';
import {trackPublicEvent} from '../analytics/client.tsx';
import {AccountConsumer,type ReaderAccount} from '../accounts/account-consumer';
export function WorkCountSummary({counts}:{counts?:WorkCounts|null}){
 if(!counts)return <span className="text-xs text-muted-foreground">统计暂不可用</span>;
 return <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="作品统计"><span>阅读 {counts.reads.toLocaleString('zh-CN')}</span><span>点赞 {counts.likes.toLocaleString('zh-CN')}</span><span>收藏 {counts.favorites.toLocaleString('zh-CN')}</span></span>;
}
export function WorkInteractions({workId,workUrl,counts}:{workId:string;workUrl:string;counts:WorkCounts|null}){
 return <AccountConsumer>{account=><InteractionActions account={account} workId={workId} workUrl={workUrl} counts={counts}/>}</AccountConsumer>;
}
function InteractionActions({account,workId,workUrl,counts}:{account:ReaderAccount;workId:string;workUrl:string;counts:WorkCounts|null}){
 const owner=account.me?.user.id,{api}=account;
 const [total,setTotal]=useState(counts),[mine,setMine]=useState({liked:false,favorited:false}),[known,setKnown]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setTotal(counts)},[counts]);
 useEffect(()=>{
  let live=true;setKnown(false);setMine({liked:false,favorited:false});setError('');
  if(owner)void api.statsMine({params:{id:workId}},{context:{owner}}).then(x=>{if(live){setMine(x);setKnown(true)}}).catch(()=>{if(live)setError('个人状态暂时无法读取，请刷新重试。')});
  return()=>{live=false};
 },[owner,workId,api]);
 async function react(kind:'like'|'favorite'){
  if(!owner||!known||busy)return;const check=account.guard();const enabled=kind==='like'?!mine.liked:!mine.favorited;setBusy(true);setError('');
  try{
   const next=await api.statsReact({params:{id:workId,kind},body:{enabled}},{context:{owner}});check();setMine(next);setTotal(next.stats);trackPublicEvent(kind,enabled,workUrl);
  }catch(e){setError(errorCopy(e instanceof AccountClientError?e.code:'NETWORK'))}finally{setBusy(false)}
 }
 return <section className="work-interactions space-y-2" aria-label="阅读与作品互动" data-work-stats={workId}>
  <div className="flex flex-wrap items-center gap-3">
   <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><BookOpen size={16} aria-hidden="true"/>阅读 {total?.reads.toLocaleString('zh-CN')??'—'}</span>
   {owner?<>
    <Button size="sm" variant={mine.liked?'secondary':'outline'} aria-pressed={mine.liked} disabled={!known||busy} onClick={()=>void react('like')}><Heart size={15} aria-hidden="true"/>{mine.liked?'已点赞':'点赞'} · {total?.likes??'—'}</Button>
    <Button size="sm" variant={mine.favorited?'secondary':'outline'} aria-pressed={mine.favorited} disabled={!known||busy} onClick={()=>void react('favorite')}><Bookmark size={15} aria-hidden="true"/>{mine.favorited?'已收藏':'收藏'} · {total?.favorites??'—'}</Button>
   </>:<>
    <Button asChild size="sm" variant="ghost"><Link to={"/account?returnTo="+encodeURIComponent(workUrl)}><Heart size={15} aria-hidden="true"/>点赞 · {total?.likes??'—'}</Link></Button>
    <Button asChild size="sm" variant="ghost"><Link to={"/account?returnTo="+encodeURIComponent(workUrl)}><Bookmark size={15} aria-hidden="true"/>收藏 · {total?.favorites??'—'}</Link></Button>
   </>}
  </div>
  <p className="text-xs text-muted-foreground">阅读按实际启动去重计数{!owner?' · 登录后可点赞和收藏':''}{!total?' · 统计暂不可用':''}</p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
