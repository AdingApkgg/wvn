import {test} from 'node:test';import assert from 'node:assert/strict';import {Hono} from 'hono';
import {registerPreviewManifests} from '../src/content/preview-manifests.server.ts';
import {players} from '../public/player/registry.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const player=players.find(row=>row.id==='clannad')!;
function manifest(origin='https://wvn-s3-zi0.saop.cc'){
 const sha='a'.repeat(64),url=origin+'/'+sha+'.bin';
 return {schema:1,delivery:'cas',pilot:player.id,versionId:player.versionId,inventorySha256:'b'.repeat(64),resourceOrigin:origin,
  resources:[{path:'nscript.dat',key:'11111111-1111-4111-8111-111111111111',url,sha256:sha,bytes:8,contentType:'application/octet-stream'}],
  engineResources:{id:player.engine,files:[{path:'onsyuri.wasm',key:'22222222-2222-4222-8222-222222222222',url:origin+'/'+player.engine+'.bin',sha256:player.engine,bytes:32,contentType:'application/wasm'}]},
  ons:{pilot:player.id,title:player.title,versionId:player.versionId,engine:player.engine,gamedir:'/game',savedir:'/save',args:[],resourceOrigin:origin,files:[{path:'nscript.dat',url,lazyload:true}]}};
}
test('预览只能只读代理固定公开源的CAS元数据，不在生产启用或转发Cookie',async()=>{
 const app=new Hono();let seen=false;
 assert.throws(()=>registerPreviewManifests(app,{origin:'https://wg.saop.cc',deployment:'production'}));
 registerPreviewManifests(app,{origin:'https://wg.saop.cc',deployment:'preview',fetcher:async(input,options)=>{
  seen=true;assert.equal(new URL(String(input)).hostname,'wg.saop.cc');assert.equal(options?.credentials,'omit');assert.equal(new Headers(options?.headers).has('cookie'),false);
  return Response.json(manifest());
 }});
 assert.equal((await app.request('/api/player/'+player.id+'/resources',{headers:{cookie:'private=secret'}})).status,200);assert(seen);
 assert.equal((await app.request('/api/player/not-a-player/resources')).status,404);
});
test('预览保持线上新域名清单原始响应，不再改写资源和引擎URL',async()=>{
 const raw=' \n'+JSON.stringify(manifest(),null,2)+'\n';
 const app=new Hono();registerPreviewManifests(app,{origin:'https://wg.saop.cc',deployment:'preview',fetcher:async()=>new Response(raw)});
 const response=await app.request('/api/player/'+player.id+'/resources');assert.equal(response.status,200);assert.equal(await response.text(),raw);
 const head=await app.request('/api/player/'+player.id+'/resources',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('预览拒绝旧域名、混合资源/引擎/ONS来源及带查询的摘要URL',async()=>{
 const old='https://wg-b2.saop.cc',sha='a'.repeat(64);
 const invalid=[()=>manifest(old),(value:any)=>({...value,resourceOrigin:'https://untrusted.invalid'}),
  (value:any)=>{value.resources[0].url=old+'/'+sha+'.bin';return value},
  (value:any)=>{value.engineResources.files[0].url=old+'/'+player.engine+'.bin';return value},
  (value:any)=>{value.ons.resourceOrigin=old;return value},
  (value:any)=>{value.ons.files[0].url=value.resources[0].url+'?download=1';return value}];
 for(const mutate of invalid){
  const app=new Hono();registerPreviewManifests(app,{origin:'https://wg.saop.cc',deployment:'preview',fetcher:async()=>Response.json(mutate(manifest()))});
  assert.equal((await app.request('/api/player/'+player.id+'/resources')).status,503);
 }
});

test('隔离预览读取冻结清单，继续校验CAS来源且不向生产取账号权限',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'wvn-preview-manifests-'));
 try{
  const raw=JSON.stringify(manifest());await writeFile(join(directory,player.id+'.json'),raw);
  let externalCalls=0;
  const app=new Hono();registerPreviewManifests(app,{origin:'https://wg.saop.cc',deployment:'preview',manifestDirectory:directory,fetcher:async()=>{externalCalls++;throw Error('不允许外部请求')}});
  assert.equal(await(await app.request('/api/player/'+player.id+'/resources')).text(),raw);
  assert.equal((await app.request('/api/player/'+player.id+'/resources?engine=missing')).status,503);
  await writeFile(join(directory,player.id+'.json'),JSON.stringify(manifest('https://wg-b2.saop.cc')));
  assert.equal((await app.request('/api/player/'+player.id+'/resources')).status,503);
  assert.equal(externalCalls,0);
  assert.throws(()=>registerPreviewManifests(new Hono(),{origin:'https://wg.saop.cc',deployment:'production',manifestDirectory:directory}));
 }finally{await rm(directory,{recursive:true,force:true})}
});
