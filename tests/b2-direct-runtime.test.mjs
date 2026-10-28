import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {b2ResourceOrigin,runtimeResourceOrigin,resourceOriginForManifest,verifyDirectEngine} from '../public/player/resource-location.mjs';
test('仅接受主站或固定 CDN 的当前游戏目录，存储身份不随资源域变化',()=>{
 const p={id:'artemis-v27448-1'},origin='https://localhost:18981';
 assert.equal(runtimeResourceOrigin(origin+'/__player/resource/'+p.id+'/',p,origin),origin);
 assert.equal(runtimeResourceOrigin(b2ResourceOrigin+'/__player/resource/'+p.id+'/',p,origin),b2ResourceOrigin);
 for(const base of ['https://evil.invalid/__player/resource/'+p.id+'/',b2ResourceOrigin+'/__player/resource/other/',b2ResourceOrigin+'/api/'])assert.throws(()=>runtimeResourceOrigin(base,p,origin));
 assert.equal(resourceOriginForManifest(undefined,origin),origin);assert.equal(resourceOriginForManifest(b2ResourceOrigin,origin),b2ResourceOrigin);assert.throws(()=>resourceOriginForManifest('https://evil.invalid',origin));
});
test('浏览器直接读取并验证引擎，遗漏凭据，摘要错误即停止',async()=>{
 const bytes=new Uint8Array([0,97,115,109]),hash=createHash('sha256').update(bytes).digest('hex'),entry={id:'test',engineFiles:{'engine.wasm':hash}},seen=[];
 const fetcher=async(url,options)=>{seen.push({url,options});return new Response(bytes)};
 const verified=await verifyDirectEngine(entry,undefined,b2ResourceOrigin,{fetcher});assert.deepEqual(verified.get("engine.wasm"),bytes);assert.equal(seen[0].url,b2ResourceOrigin+'/__player/resource/test/engine.wasm');assert.equal(seen[0].options.credentials,'omit');assert.equal(seen[0].options.redirect,'error');
 await assert.rejects(verifyDirectEngine({...entry,engineFiles:{'engine.wasm':'a'.repeat(64)}},undefined,b2ResourceOrigin,{fetcher}),/checksum/);
 const release={id:'renpy-'+'b'.repeat(64),files:[{path:'renpy.wasm',sha256:hash}]};await verifyDirectEngine(entry,release,b2ResourceOrigin,{fetcher});assert(seen.at(-1).url.includes('/__engines/resource/'+release.id+'/'));
});
