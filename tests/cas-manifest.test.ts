import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import assets from '../ops/b2/public-assets.mjs';
import {gunzipSync} from 'node:zlib';
import {CasManifestService, createCasManifestApp, RENPY_RELEASE} from '../src/player/cas-manifest.server.ts';
const hash='a'.repeat(64), inventory='b'.repeat(64);
const row=(path:string)=>({path,key:'12345678-1234-4234-8234-123456789abc',sha256:hash,bytes:7,contentType:'image/png',url:`https://wg-b2.saop.cc/${hash}.bin`});
function fixture(id='artemis-v27448-1', source='html'){
 let hidden=false,broken=false,shared=true; const calls:string[]=[]; const dependencies:string[]=[]; const rows=[row('数据/空 格#%.png')];
 const versions={manifest:async(version:string)=>{calls.push(version);if(broken)throw Error('password=secret');return hidden?undefined:{versionId:version,inventorySha256:inventory,resources:rows,nextCursor:null};}};
 const resources={manifest:async()=>shared?{}:undefined,findByOriginalPath:async(_ns:string,path:string)=>{dependencies.push(path);const result=row(path);if(path.endsWith('onsyuri.wasm')){result.sha256='64ed1e7b9e92aa83b8106227d6095b3ab951e2bed75ac4bb8ed43f044737de04';result.url=`https://wg-b2.saop.cc/${result.sha256}.bin`;}return result;}};
 const document={schema:1,entries:{[id]:{source,bytes:Buffer.byteLength(source),sha1:createHash('sha1').update(source).digest('hex')}}};
 const service=new CasManifestService(versions as never,resources as never,{document,namespace:'snapshot',inventorySha256:inventory,engineReleaseId:RENPY_RELEASE});
 return {app:createCasManifestApp(service),calls,rows,dependencies,revokeShared(){shared=false},hide(){hidden=true},break(){broken=true}};
}
test('registered game metadata stays scoped and does not cache publication',async()=>{
 const f=fixture(),url='/api/player/artemis-v27448-1/resources';const res=await f.app.request(url);assert.equal(res.status,200);const data=await res.json();assert.equal(data.delivery,'cas');assert.equal(data.resources[0].path,'数据/空 格#%.png');assert.equal(data.engineResources.files.length,0);assert.match(f.calls[0],/^legacy-/);f.hide();assert.equal((await f.app.request(url)).status,404);
 assert.equal((await f.app.request('/api/player/legacy-22f82f586933328e09f8545a/resources')).status,404);
});
test('engine query, malformed queries and database failures fail closed',async()=>{
 const f=fixture();for(const query of ['?engine=foreign','?version=x','?engine=x&engine=y'])assert.equal((await f.app.request('/api/player/artemis-v27448-1/resources'+query)).status,400);
 f.break();const r=await f.app.request('/api/player/artemis-v27448-1/resources');assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret|password/);
});
test('gzip and HEAD preserve metadata headers and empty HEAD body',async()=>{
 const f=fixture(),url='/api/player/artemis-v27448-1/resources';const r=await f.app.request(url,{headers:{'accept-encoding':'gzip'}});assert.equal(r.headers.get('content-encoding'),'gzip');assert.equal(JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString()).schema,1);
 const head=await f.app.request(url,{method:'HEAD',headers:{'accept-encoding':'gzip;q=0'}});assert.equal(head.status,200);assert.equal(head.headers.get('content-encoding'),null);assert.equal(await head.text(),'');assert.match(head.headers.get('cache-control')!,/no-store/);
});
test('ONS preserves exact paths and lazy flags using hash URLs',async()=>{
 const f=fixture('clannad',JSON.stringify({args:[],files:[{path:'数据/空 格#%.png',lazyload:false}]}));const r=await f.app.request('/api/player/clannad/resources');assert.equal(r.status,200);const d=await r.json();assert.equal(d.ons.files[0].lazyload,false);assert.equal(d.ons.files[0].url,`https://wg-b2.saop.cc/${hash}.bin`);assert.equal(d.engineResources.files.length,2);
});

test('registered RenPy engine contains only its four shared files',async()=>{
 const f=fixture('renpy-v1286-1');const r=await f.app.request('/api/player/renpy-v1286-1/resources?engine='+RENPY_RELEASE);assert.equal(r.status,200);const d=await r.json();assert.equal(d.engineResources.id,RENPY_RELEASE);assert.deepEqual(d.engineResources.files.map((f:{path:string})=>f.path),['renpy-pre.js','renpy.js','renpy.wasm','renpy.data']);
});
test('duplicates, invalid MIME, URL, size and hash fail closed',async()=>{
 for(const mutate of [(r:ReturnType<typeof row>[])=>r.push(r[0]),(r:ReturnType<typeof row>[])=>r[0].url='https://evil.invalid/a',(r:ReturnType<typeof row>[])=>r[0].bytes=-1,(r:ReturnType<typeof row>[])=>r[0].sha256='bad',(r:ReturnType<typeof row>[])=>r[0].contentType='invalid']){const f=fixture();mutate(f.rows);assert.equal((await f.app.request('/api/player/artemis-v27448-1/resources')).status,503);}
});

test('media aliases are limited to the selected game and preserve original logical path',async()=>{
 const id='renpy-v8038-1',f=fixture(id);f.rows.length=0;
 for(const alias of Object.keys(assets.media))if(alias.startsWith(id+'\0'))f.rows.push(row(alias.slice(id.length+1)));
 const r=await f.app.request('/api/player/'+id+'/resources');assert.equal(r.status,200);const d=await r.json();assert.equal(d.resources.length,f.rows.length);assert.equal(f.dependencies.filter(p=>p.startsWith('releases/20261027-01/media/')).length,f.rows.length);assert.deepEqual(d.resources.map((r:{path:string})=>r.path),f.rows.map(r=>r.path));
 f.revokeShared();assert.equal((await f.app.request('/api/player/'+id+'/resources')).status,404);
});
