import {createApiClient} from '../api/client.ts';
import {useEffect,useRef} from 'react';
import {useLocation} from 'react-router';
import {PublicTracker} from './tracker.ts';
import {canonicalAnalyticsPath} from './contract.ts';
let current:PublicTracker|null=null;
export function trackPublicEvent(name:'reading_start'|'like'|'favorite',enabled?:boolean,path?:string){current?.event(name,enabled,path)}
export function Analytics({websiteId}:{websiteId:string|null}){
 const location=useLocation(),instance=useRef<PublicTracker|null>(null),publicPage=canonicalAnalyticsPath(location.pathname)!==null;
 useEffect(()=>{
  if(!websiteId||!publicPage||navigator.doNotTrack==='1')return;
  const tracker=new PublicTracker(websiteId,window.location.hostname,()=>(window as typeof window&{umami?:{track:(p:unknown)=>unknown}}).umami);instance.current=tracker;current=tracker;
  const script=document.createElement('script');script.src='/_s/script.js';script.defer=true;
  script.dataset.websiteId=websiteId;script.dataset.hostUrl=window.location.origin+'/_s';script.dataset.autoTrack='false';script.dataset.doNotTrack='true';script.dataset.excludeSearch='true';script.dataset.excludeHash='true';
  const flush=()=>tracker.flush();script.addEventListener('load',flush);document.head.append(script);
  return()=>{tracker.navigate('/account');if(current===tracker)current=null;instance.current=null;script.removeEventListener('load',flush);script.remove()};
 },[websiteId,publicPage]);
 useEffect(()=>{instance.current?.navigate(location.pathname)},[location.pathname,websiteId]);
 return null;
}
export async function recordReading(workId:string,versionId:string){
 if(navigator.doNotTrack==='1'||!navigator.locks)return;
 try{
  await navigator.locks.request('wvn-reading-visitor',async()=>{
   for(let i=0;i<2;i++){
    const api=createApiClient({fetch:(request,init)=>fetch(request,{...init,keepalive:true})});
    const body=await api.statsRead({params:{id:workId},body:{versionId}},{signal:AbortSignal.timeout(15000)});
    if(i===0&&'visitorRequired' in body&&body.visitorRequired)continue;
    return;
   }
  });
 }catch{/* 统计不可用时继续阅读，存档路径不依赖统计。 */}
}
