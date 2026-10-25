import {publicProjectionFetch} from '../accounts/public-projection.server.ts';
import type {WorkCounts} from '../accounts/work-stats.server.ts';
export async function projectWorkCounts(ids:string[]):Promise<Record<string,WorkCounts>|null>{
 if(!ids.length)return {};
 const origin=process.env.WG_SHARE_ACCOUNT_ORIGIN??process.env.WG_ACCOUNT_ORIGIN;if(!origin)return null;
 try{
  const send=publicProjectionFetch()??fetch,response=await send(origin+'/api/public/work-stats?ids='+encodeURIComponent(ids.join(',')),{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(2500)});
  if(!response.ok)return null;const data=await response.json();
  for(const id of ids)if(!data[id]||!['reads','likes','favorites'].every(k=>Number.isSafeInteger(data[id][k])&&data[id][k]>=0))return null;
  return Object.fromEntries(ids.map(id=>[id,{reads:data[id].reads,likes:data[id].likes,favorites:data[id].favorites}]));
 }catch{return null}
}
