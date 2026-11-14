import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Hono} from 'hono';
import {createHash} from 'node:crypto';
import {createContentFetch} from '../src/content/http.server.ts';
import {registerDirectB2Resources} from '../src/player/b2.server.ts';
import {players} from '../public/player/registry.mjs';
import {PUBLIC_CONTENT_ACCESS} from '../src/content/policy.ts';
import type {Store} from '../src/server/store.ts';
const evidence={reason:'fixture',source:'test',reviewedAt:'2026-11-14T00:00:00Z',revision:1};
const publicVersion=players.find(p=>p.id==='clannad')!,restrictedVersion=players.find(p=>p.id==='saya')!;
const works=[publicVersion,restrictedVersion].map((p,index)=>({id:p.workId,title:p.id,url:'/'+p.workId.slice(1)+'/',classification:{...evidence,pageSuitability:index?'nsfw':'sfw'},versions:[{id:p.versionId,workId:p.workId,number:1,title:p.id,classification:{...evidence,sexualContent:index?'present':'none',titleSafe:true}}]}));
const store={raw:async(id:string)=>works.flatMap(w=>w.versions).find(v=>v.id===id),get:async(id:string)=>works.find(w=>w.id===id),list:async()=>works} as unknown as Store;

test('actual CAS runtime retains no-transform through the content listener without weakening isolation or eligibility',async()=>{
 const entries=Object.fromEntries(players.map(p=>{const source='runtimeKind'in p?'<html><head></head><body><script src="engine.js"></script></body></html>':JSON.stringify({args:[],files:[{path:'nscript.dat',lazyload:true}]});return [p.id,{source,bytes:Buffer.byteLength(source),sha1:createHash('sha1').update(source).digest('hex')}]}));
 const app=new Hono();registerDirectB2Resources(app,{document:{schema:1,entries},origin:'https://wvn.test',cas:true});
 const run=createContentFetch(app.fetch,store,{enabled:true,access:async()=>PUBLIC_CONTENT_ACCESS});
 for(const method of ['GET','HEAD']){
  const response=await run(new Request('https://wvn.test/__ons/runtime/clannad',{method}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store, no-transform');assert.match(response.headers.get('vary')??'',/Cookie/);
  assert.match(response.headers.get('content-security-policy')??'',/sandbox allow-scripts;/);assert.doesNotMatch(response.headers.get('content-security-policy')??'',/allow-same-origin/);
  assert.equal(response.headers.get('access-control-allow-credentials'),null);assert.equal(response.headers.get('set-cookie'),null);
  if(method==='HEAD')assert.equal((await response.arrayBuffer()).byteLength,0);
 }
 const denied=await run(new Request('https://wvn.test/__ons/runtime/saya'));assert.equal(denied.status,401);assert.equal(denied.headers.get('cache-control'),'private, no-store');
});
test('no-transform is matched as a directive; caching directives remain private and unrelated pages stay unchanged',async()=>{
 for(const [original,want] of [['public, max-age=3600, NO-TRANSFORM','private, no-store, no-transform'],['no-store, x-no-transform','private, no-store'],['public, max-age=900','private, no-store']]){
  const run=createContentFetch(()=>new Response('fixture',{headers:{'cache-control':original,'vary':'Accept-Encoding'}}),store,{enabled:true,access:async()=>PUBLIC_CONTENT_ACCESS});
  const response=await run(new Request('https://wvn.test/4/'));assert.equal(response.headers.get('cache-control'),want);assert.equal(response.headers.get('vary'),'Accept-Encoding, Cookie');assert.equal(await response.text(),'fixture');
 }
});
test('JSON projections retain no-transform while still removing restricted rows and stale entity headers',async()=>{
 const run=createContentFetch(()=>Response.json({v4:{reads:1},v97:{reads:2}},{headers:{'cache-control':'public, no-transform','etag':'"old"'}}),store,{enabled:true,access:async()=>PUBLIC_CONTENT_ACCESS});
 const response=await run(new Request('https://wvn.test/api/public/work-stats'));assert.equal(response.headers.get('cache-control'),'private, no-store, no-transform');assert.equal(response.headers.get('etag'),null);assert.deepEqual(await response.json(),{v4:{reads:1}});
});
