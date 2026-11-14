import test from 'node:test';
import assert from 'node:assert/strict';
import {projectWorkCounts} from '../src/analytics/projection.server.ts';
import {configurePublicProjection} from '../src/accounts/public-projection.server.ts';
import {cacheContentAccess} from '../src/content/access.server.ts';
import {createContentFetch} from '../src/content/http.server.ts';
import {PUBLIC_CONTENT_ACCESS} from '../src/content/policy.ts';

const origin='https://wvn.test';
const qualified={...PUBLIC_CONTENT_ACCESS,authenticated:true,eligibility:'qualified' as const,displayMode:'restricted' as const,canViewRestricted:true};
const counts={v4:{reads:64,likes:1,favorites:1},v17:{reads:5,likes:0,favorites:0}};

test('作品统计继承当前请求的可信资格，公共和外站请求仍过滤受限统计',async()=>{
 const previous=process.env.WG_ACCOUNT_ORIGIN,previousShare=process.env.WG_SHARE_ACCOUNT_ORIGIN;
 process.env.WG_ACCOUNT_ORIGIN=origin;delete process.env.WG_SHARE_ACCOUNT_ORIGIN;
 const seen:Request[]=[];
 const store={list:async()=>[
  {id:'v4',classification:{pageSuitability:'sfw'}},
  {id:'v17',classification:{pageSuitability:'nsfw'}},
 ]};
 configurePublicProjection(origin,createContentFetch(async request=>{
  seen.push(request);
  const ids=new URL(request.url).searchParams.get('ids')!.split(',');
  return Response.json(Object.fromEntries(ids.map(id=>[id,counts[id as keyof typeof counts]])));
 },store as never,{enabled:true,access:async()=>({...PUBLIC_CONTENT_ACCESS})}));
 try{
  const viewer=new Request('http://wvn.test/',{headers:{cookie:'private=session'}});
  cacheContentAccess(viewer,Promise.resolve(qualified));
  assert.deepEqual(await projectWorkCounts(['v4','v17'],viewer),counts);
  assert.deepEqual(await projectWorkCounts(['v17'],viewer),{v17:counts.v17});
  assert.deepEqual(await projectWorkCounts(['v4']),{v4:counts.v4});
  assert.equal(await projectWorkCounts(['v4','v17']),null);
  const foreign=new Request('https://foreign.test/',{headers:{cookie:'private=session','x-content-qualified':'true'}});
  assert.equal(await projectWorkCounts(['v17'],foreign),null);
  assert(seen.every(request=>!request.headers.has('cookie')&&!request.headers.has('x-content-qualified')));
 }finally{
  if(previous===undefined)delete process.env.WG_ACCOUNT_ORIGIN;else process.env.WG_ACCOUNT_ORIGIN=previous;
  if(previousShare===undefined)delete process.env.WG_SHARE_ACCOUNT_ORIGIN;else process.env.WG_SHARE_ACCOUNT_ORIGIN=previousShare;
 }
});
