import {createApiClient} from '../api/client.ts';
import {publicProjectionFetch} from '../accounts/public-projection.server.ts';
import type {WorkCounts} from '../accounts/work-stats.server.ts';
export async function projectWorkCounts(ids:string[],viewer?:Request):Promise<Record<string,WorkCounts>|null>{
 if(!ids.length)return {};
 const origin=process.env.WG_SHARE_ACCOUNT_ORIGIN??process.env.WG_ACCOUNT_ORIGIN;if(!origin)return null;
 try{
  const send=publicProjectionFetch(viewer)??fetch;
  const api=createApiClient({baseUrl:origin,fetch:(request,init)=>send(request,{...init,redirect:'error'})});
  const data=await api.statsGet({query:{ids:ids.join(',')}},{signal:AbortSignal.timeout(2500)});
  for(const id of ids)if(!data[id]||!(['reads','likes','favorites'] as const).every(k=>Number.isSafeInteger(data[id][k])&&data[id][k]>=0))return null;
  return Object.fromEntries(ids.map(id=>[id,{reads:data[id].reads,likes:data[id].likes,favorites:data[id].favorites}]));
 }catch{return null}
}
